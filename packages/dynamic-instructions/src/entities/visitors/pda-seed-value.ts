import { getNodeCodec } from '@codama/dynamic-codecs';
import type { Address } from '@solana/addresses';
import { address, getAddressEncoder } from '@solana/addresses';
import type { ReadonlyUint8Array } from '@solana/codecs';
import { getBase16Codec, getBase58Codec, getBase64Codec, getBooleanCodec, getUtf8Codec } from '@solana/codecs';
import type { Visitor } from 'codama';
import type {
    AccountValueNode,
    ArgumentValueNode,
    BooleanValueNode,
    BytesValueNode,
    IdentityValueNode,
    InstructionNode,
    NumberValueNode,
    PayerValueNode,
    PublicKeyValueNode,
    RootNode,
    StringValueNode,
} from 'codama';
import type { BytesEncoding } from 'codama';

import { toAddress } from '../../shared/address';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';

type PdaSeedValueVisitorContext = {
    accountsInput?: AccountsInput;
    argumentsInput?: ArgumentsInput;
    ix: InstructionNode;
    programId: Address;
    root: RootNode;
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
    'accountValueNode' | 'argumentValueNode' | 'booleanValueNode' | 'bytesValueNode' | 'identityValueNode' | 'numberValueNode' | 'payerValueNode' | 'programIdValueNode' | 'publicKeyValueNode' | 'stringValueNode'
> {
    const { root, ix, programId } = ctx;
    const accountsInput = ctx.accountsInput ?? {};
    const argumentsInput = ctx.argumentsInput ?? {};

    return {
        // Contextual seed values.
        visitAccountValue: (node: AccountValueNode) => {
            // FIXME: dependent account can be another auto-derived PDA account.
            return getAccountAddressFromInput(node, accountsInput);
        },
        visitArgumentValue: (node: ArgumentValueNode) => {
            const ixArgumentNode = ix.arguments.find(arg => arg.name === node.name);
            if (!ixArgumentNode) {
                throw new AccountError(`Missing instruction argument node for PDA seed: ${node.name}`);
            }
            const codec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
            const argInput = argumentsInput[node.name];
            return codec.encode(argInput);
        },

        visitBooleanValue: (node: BooleanValueNode) => getBooleanCodec().encode(node.boolean),

        visitBytesValue: (node: BytesValueNode) =>
            getCodecFromBytesEncoding(node.encoding as BytesEncoding).encode(node.data),

        // Keep behavior compatible with existing implementation in `pda.ts`.
        visitNumberValue: (node: NumberValueNode) => new Uint8Array([node.number]),

        // Constant / standalone value nodes.
        visitProgramIdValue: () => getAddressEncoder().encode(programId),
        visitPublicKeyValue: (node: PublicKeyValueNode) =>
            getAddressEncoder().encode(address(node.publicKey)),
        visitStringValue: (node: StringValueNode) => getUtf8Codec().encode(node.string),

        visitIdentityValue: (node: IdentityValueNode) => {
            return getAccountAddressFromInput(node, accountsInput);
        },
        visitPayerValue: (node: PayerValueNode) => {
            return getAccountAddressFromInput(node, accountsInput);
        },
    };
    
}

function getAccountAddressFromInput(
    node: AccountValueNode | IdentityValueNode | PayerValueNode,
    accountsInput: PdaSeedValueVisitorContext['accountsInput']
) {
    const nodeWithName = node as { name?: string };
    const name = nodeWithName.name;
    if (typeof name !== 'string') {
        throw new AccountError(
            'PDA seed identity/payer value node must have an account name in this context'
        );
    }
    const input = accountsInput?.[name];
    if (input === undefined || input === null || accountsInput === undefined) {
        throw new AccountError(`Missing required account for PDA seed: ${name}`);
    }
    return getAddressEncoder().encode(toAddress(input));
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
