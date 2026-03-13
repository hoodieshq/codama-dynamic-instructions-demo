import { getNodeCodec } from '@codama/dynamic-codecs';
import type { Address } from '@solana/addresses';
import { address, getAddressEncoder, isAddress } from '@solana/addresses';
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
import { visitOrElse } from 'codama';

import { getCodecFromBytesEncoding } from '../../shared/bytes-encoding';
import { AccountError } from '../../shared/errors';
import { resolveAccountValueNodeAddress } from '../resolvers/resolve-account-value-node-address';
import type { BaseResolutionContext } from '../resolvers/types';
import { createInputValueTransformer } from './input-value-transformer';

type PdaSeedValueVisitorContext = BaseResolutionContext & {
    programId: Address;
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
    const { root, ixNode, programId, seedTypeNode, resolversInput, resolutionPath } = ctx;
    const accountsInput = ctx.accountsInput ?? {};
    const argumentsInput = ctx.argumentsInput ?? {};

    return {
        visitAccountValue: async (node: AccountValueNode) => {
            const resolvedAddress = await resolveAccountValueNodeAddress(node, {
                accountsInput,
                argumentsInput,
                ixNode,
                resolutionPath,
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
        visitArgumentValue: async (node: ArgumentValueNode) => {
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
            return await Promise.resolve(codec.encode(transformedInput));
        },

        visitBooleanValue: async (node: BooleanValueNode) =>
            await Promise.resolve(getBooleanCodec().encode(node.boolean)),

        visitBytesValue: async (node: BytesValueNode) => {
            const encodedValue = getCodecFromBytesEncoding(node.encoding).encode(node.data);
            return await Promise.resolve(encodedValue);
        },

        visitConstantValue: async (node: ConstantValueNode) => {
            const innerVisitor = createPdaSeedValueVisitor(ctx);
            return await visitOrElse(node.value, innerVisitor, innerNode => {
                throw new AccountError(`Unsupported constant PDA seed value: ${innerNode.kind}`);
            });
        },

        visitNoneValue: async (_node: NoneValueNode) => await Promise.resolve(new Uint8Array(0)),

        visitNumberValue: async (node: NumberValueNode) => {
            if (!Number.isInteger(node.number) || node.number < 0 || node.number > 0xff) {
                throw new AccountError(
                    `NumberValueNode seed value ${node.number} cannot be encoded as a single byte. ` +
                        `Expected an integer in range [0, 255].`,
                );
            }
            return await Promise.resolve(new Uint8Array([node.number]));
        },

        visitProgramIdValue: async () => {
            if (typeof programId !== 'string' || !isAddress(programId)) {
                throw new AccountError(
                    `Expected base58-encoded Address for programId, got: ${programId as unknown as string}`,
                );
            }
            return await Promise.resolve(getAddressEncoder().encode(programId));
        },

        visitPublicKeyValue: async (node: PublicKeyValueNode) => {
            if (typeof node.publicKey !== 'string' || !isAddress(node.publicKey)) {
                throw new AccountError(`Expected base58-encoded Address, got: ${node.publicKey as unknown as string}`);
            }
            return await Promise.resolve(getAddressEncoder().encode(address(node.publicKey)));
        },

        visitSomeValue: async (node: SomeValueNode) => {
            const innerVisitor = createPdaSeedValueVisitor(ctx);
            return await visitOrElse(node.value, innerVisitor, innerNode => {
                throw new AccountError(`Unsupported some PDA seed value: ${innerNode.kind}`);
            });
        },

        visitStringValue: async (node: StringValueNode) => await Promise.resolve(getUtf8Codec().encode(node.string)),
    };
}
