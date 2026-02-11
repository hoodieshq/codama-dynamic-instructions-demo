import { getNodeCodec } from '@codama/dynamic-codecs';
import type { Address } from '@solana/addresses';
import { address, getAddressEncoder } from '@solana/addresses';
import type { ReadonlyUint8Array } from '@solana/codecs';
import { getBase16Codec, getBase58Codec, getBase64Codec, getBooleanCodec, getUtf8Codec } from '@solana/codecs';
import type {
    AccountValueNode,
    ArgumentValueNode,
    BooleanValueNode,
    BytesValueNode,
    NumberValueNode,
    PublicKeyValueNode,
    StringValueNode,
    Visitor,
} from 'codama';
import type { InstructionNode, RootNode } from 'codama';

import { resolveAccountAddress } from '../../features/instruction-encoding/accounts/resolve-account-address';
import { toAddress } from '../../shared/address';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput, ResolutionPath } from '../../shared/types';
import { detectCircularDependency } from '../../shared/util';

type PdaSeedValueVisitorContext = {
    accountsInput?: AccountsInput;
    argumentsInput?: ArgumentsInput;
    ixNode: InstructionNode;
    programId: Address;
    resolutionPath?: ResolutionPath;
    root: RootNode;
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
export function createPdaSeedValueVisitor(ctx: PdaSeedValueVisitorContext): Visitor<
    Promise<ReadonlyUint8Array>,
    | 'accountValueNode'
    | 'argumentValueNode'
    | 'booleanValueNode'
    | 'bytesValueNode'
    | 'numberValueNode'
    | 'programIdValueNode'
    | 'publicKeyValueNode'
    | 'stringValueNode'
    // TODO: consider supporting the rest of ValueNodes: [ArrayValueNode, ConstantValueNode, EnumValueNode, MapValueNode, NoneValueNode, SetValueNode, SomeValueNode, StructValueNode, TupleValueNode]
> {
    const { root, ixNode, programId } = ctx;
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

            const resolvedAddress: Address | null = await resolveAccountAddress(
                root,
                ixNode,
                referencedIxAccountNode,
                argumentsInput,
                accountsInput,
                [...resolutionPath, node.name],
            );

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
            const codec = getNodeCodec([root, root.program, ixNode, ixArgumentNode]);
            const argInput = (argumentsInput as Record<string, unknown>)[node.name];
            return Promise.resolve(codec.encode(argInput));
        },

        visitBooleanValue: (node: BooleanValueNode) => Promise.resolve(getBooleanCodec().encode(node.boolean)),

        visitBytesValue: (node: BytesValueNode) =>
            Promise.resolve(getCodecFromBytesEncoding(node.encoding).encode(node.data)),

        visitNumberValue: (node: NumberValueNode) => Promise.resolve(new Uint8Array([node.number])),

        // Constant / standalone value nodes.
        visitProgramIdValue: () => Promise.resolve(getAddressEncoder().encode(programId)),

        visitPublicKeyValue: (node: PublicKeyValueNode) =>
            Promise.resolve(getAddressEncoder().encode(address(node.publicKey))),

        visitStringValue: (node: StringValueNode) => Promise.resolve(getUtf8Codec().encode(node.string)),
    };
}

// TODO: check if this can be replaced
// https://github.com/codama-idl/codama/blob/main/packages/dynamic-codecs/src/codecs.ts#L356
function getCodecFromBytesEncoding(encoding: string) {
    switch (encoding) {
        case 'base16':
            return getBase16Codec();
        case 'base58':
            return getBase58Codec();
        case 'base64':
            return getBase64Codec();
        case 'utf8':
            return getUtf8Codec();
        default:
            throw new AccountError(`Unsupported bytes encoding: ${encoding}`);
    }
}
