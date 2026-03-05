import { getNodeCodec } from '@codama/dynamic-codecs';
import type { Address } from '@solana/addresses';
import { address, getAddressEncoder } from '@solana/addresses';
import type { ReadonlyUint8Array } from '@solana/codecs';
import { getBooleanCodec, getUtf8Codec } from '@solana/codecs';
import type {
    AccountValueNode,
    ArgumentValueNode,
    BooleanValueNode,
    BytesValueNode,
    ConstantValueNode,
    NoneValueNode,
    NumberValueNode,
    PublicKeyValueNode,
    SomeValueNode,
    StringValueNode,
    TypeNode,
    Visitor,
} from 'codama';
import type { InstructionNode, RootNode } from 'codama';
import { visitOrElse } from 'codama';

import { resolveAccountAddress } from '../../features/instruction-encoding/accounts/resolve-account-address';
import { toAddress } from '../../shared/address';
import { getCodecFromBytesEncoding } from '../../shared/bytes-encoding';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput, ResolutionPath, ResolversInput } from '../../shared/types';
import { detectCircularDependency } from '../../shared/util';
import { createInputValueTransformer } from './input-value-transformer';

type PdaSeedValueVisitorContext = {
    accountsInput?: AccountsInput;
    argumentsInput?: ArgumentsInput;
    ixNode: InstructionNode;
    programId: Address;
    resolutionPath: ResolutionPath | undefined;
    resolversInput: ResolversInput | undefined;
    root: RootNode;
    seedTypeNode?: TypeNode;
};

/**
 * Visitor used to resolve PDA seed *values* to raw bytes.
 * Supports recursive resolution of dependent PDAs (accounts that are themselves auto-derived PDAs).
 * This is used for both:
 * - Variable seeds (e.g. seeds based on instruction accounts/arguments), and
 * - Constant seeds (e.g. bytes/string/programId/publicKey constants).
 * Doc: https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/contextualValueNodes/PdaSeedValueNode.md
 * Visit AccountValueNode, ArgumentValueNode, ValueNode, ProgramIdValueNode
 */
export function createPdaSeedValueVisitor(
    ctx: PdaSeedValueVisitorContext,
): Visitor<
    Promise<ReadonlyUint8Array>,
    | 'accountValueNode'
    | 'argumentValueNode'
    | 'booleanValueNode'
    | 'bytesValueNode'
    | 'constantValueNode'
    | 'noneValueNode'
    | 'numberValueNode'
    | 'programIdValueNode'
    | 'publicKeyValueNode'
    | 'someValueNode'
    | 'stringValueNode'
> {
    const { root, ixNode, programId, seedTypeNode, resolversInput } = ctx;
    const accountsInput = ctx.accountsInput ?? {};
    const argumentsInput = ctx.argumentsInput ?? {};
    const resolutionPath = ctx.resolutionPath ?? [];

    return {
        // Contextual seed values
        visitAccountValue: async (node: AccountValueNode) => {
            const providedAddress = accountsInput[node.name];
            if (providedAddress !== undefined && providedAddress !== null) {
                return getAddressEncoder().encode(toAddress(providedAddress));
            }

            detectCircularDependency(node.name, resolutionPath);

            const referencedIxAccountNode = ixNode.accounts.find(acc => acc.name === node.name);
            if (!referencedIxAccountNode) {
                throw new AccountError(`PDA seed references unknown account: ${node.name}`);
            }

            const resolvedAddress: Address | null = await resolveAccountAddress({
                accountAddressInput: providedAddress,
                accountsInput,
                argumentsInput,
                ixAccountNode: referencedIxAccountNode,
                ixNode,
                resolutionPath: [...resolutionPath, node.name],
                resolversInput,
                root,
            });

            if (resolvedAddress === null) {
                throw new AccountError(
                    `Cannot resolve dependent account for PDA seed ${node.name} in ${ixNode.name} instruction`,
                );
            }

            return getAddressEncoder().encode(resolvedAddress);
        },
        visitArgumentValue: (node: ArgumentValueNode) => {
            const ixArgumentNode = ixNode.arguments.find(arg => arg.name === node.name);
            if (!ixArgumentNode) {
                throw new AccountError(`Missing instruction argument node for PDA seed: ${node.name}`);
            }
            const argInput = argumentsInput[node.name];
            if (argInput === undefined || argInput === null) {
                throw new AccountError(`Missing argument for PDA seed ${node.name} in ${ixNode.name} instruction`);
            }

            // Use the PDA seed's declared type (e.g. plain stringTypeNode) rather than
            // the instruction argument's type (e.g. sizePrefixTypeNode) so the seed
            // bytes match what the on-chain program derives.
            const typeNode = seedTypeNode ?? ixArgumentNode.type;
            const codec = getNodeCodec([root, root.program, ixNode, { ...ixArgumentNode, type: typeNode }]);
            const transformer = createInputValueTransformer(typeNode, root, {
                bytesEncoding: 'base16',
            });
            const transformedInput = transformer(argInput);
            return Promise.resolve(codec.encode(transformedInput));
        },

        visitBooleanValue: (node: BooleanValueNode) => Promise.resolve(getBooleanCodec().encode(node.boolean)),

        visitBytesValue: (node: BytesValueNode) => {
            const encodedValue = getCodecFromBytesEncoding(node.encoding).encode(node.data);
            return Promise.resolve(encodedValue);
        },

        visitConstantValue: (node: ConstantValueNode) => {
            const innerVisitor = createPdaSeedValueVisitor(ctx);
            return visitOrElse(node.value, innerVisitor, innerNode => {
                throw new AccountError(`Unsupported constant PDA seed value: ${innerNode.kind}`);
            });
        },

        visitNoneValue: (_node: NoneValueNode) => Promise.resolve(new Uint8Array(0)),

        visitNumberValue: (node: NumberValueNode) => Promise.resolve(new Uint8Array([node.number])),

        // Constant / standalone value nodes.
        visitProgramIdValue: () => Promise.resolve(getAddressEncoder().encode(programId)),

        visitPublicKeyValue: (node: PublicKeyValueNode) =>
            Promise.resolve(getAddressEncoder().encode(address(node.publicKey))),

        visitSomeValue: (node: SomeValueNode) => {
            const innerVisitor = createPdaSeedValueVisitor(ctx);
            return visitOrElse(node.value, innerVisitor, innerNode => {
                throw new AccountError(`Unsupported some PDA seed value: ${innerNode.kind}`);
            });
        },

        visitStringValue: (node: StringValueNode) => Promise.resolve(getUtf8Codec().encode(node.string)),
    };
}
