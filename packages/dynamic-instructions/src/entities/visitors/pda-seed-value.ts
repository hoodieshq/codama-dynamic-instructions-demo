import { address, getAddressEncoder } from '@solana/addresses';
import type { Address } from '@solana/addresses';
import { getBase16Codec, getBase58Codec, getBase64Codec, getBooleanCodec, getUtf8Codec } from '@solana/codecs';
import type { ReadonlyUint8Array } from '@solana/codecs';
import type { Visitor } from 'codama';
import type { BytesEncoding, InstructionNode, RootNode } from 'codama';
import { getNodeCodec } from '@codama/dynamic-codecs';
import { AccountError } from '../../shared/errors';
import { toAddress } from '../../shared/address';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';

type PdaSeedValueVisitorContext = {
    root: RootNode;
    ix: InstructionNode;
    programId: Address;
    accountsInput?: AccountsInput;
    argumentsInput?: ArgumentsInput;
};

/**
 * Visitor used to resolve PDA seed *values* to raw bytes.
 *
 * This is used for both:
 * - Variable seeds (e.g. seeds based on instruction accounts/arguments), and
 * - Constant seeds (e.g. bytes/string/programId/publicKey constants).
 *
 * The goal is to centralize seed encoding logic and avoid switch-cases.
 */
export function createPdaSeedValueVisitor(
    ctx: PdaSeedValueVisitorContext
): Visitor<
    ReadonlyUint8Array,
    | 'accountValueNode'
    | 'argumentValueNode'
    | 'programIdValueNode'
    | 'publicKeyValueNode'
    | 'bytesValueNode'
    | 'booleanValueNode'
    | 'numberValueNode'
    | 'stringValueNode'
> {
    const { root, ix, programId } = ctx;
    const accountsInput = ctx.accountsInput ?? {};
    const argumentsInput = ctx.argumentsInput ?? {};

    return {
        // Contextual seed values.
        visitAccountValue: (node: any) => {
            const input = (accountsInput as any)[node.name];
            if (input === undefined || input === null) {
                throw new AccountError(`Missing required account for PDA seed: ${node.name}`);
            }
            return getAddressEncoder().encode(toAddress(input));
        },
        visitArgumentValue: (node: any) => {
            const ixArgumentNode = ix.arguments.find(arg => arg.name === node.name);
            if (!ixArgumentNode) {
                throw new AccountError(`Missing instruction argument node for PDA seed: ${node.name}`);
            }
            const codec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
            const argInput = (argumentsInput as any)[node.name];
            return codec.encode(argInput);
        },

        // Constant / standalone value nodes.
        visitProgramIdValue: () => getAddressEncoder().encode(programId),
        visitPublicKeyValue: (node: any) => getAddressEncoder().encode(address(node.publicKey)),
        visitBytesValue: (node: any) => getCodecFromBytesEncoding(node.encoding as BytesEncoding).encode(node.data),
        visitBooleanValue: (node: any) => getBooleanCodec().encode(node.boolean),

        // Keep behavior compatible with existing implementation in `pda.ts`.
        visitNumberValue: (node: any) => new Uint8Array([node.number]),
        visitStringValue: (node: any) => getUtf8Codec().encode(node.string),
    };
}

// TODO: check if this can be replaced
// https://github.com/codama-idl/codama/blob/main/packages/dynamic-codecs/src/codecs.ts#L356
function getCodecFromBytesEncoding(encoding: BytesEncoding) {
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
