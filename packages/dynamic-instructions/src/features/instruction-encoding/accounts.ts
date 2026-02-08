import type { Address } from '@solana/addresses';
import { address } from '@solana/addresses';
import type { AccountMeta } from '@solana/instructions';
import { AccountRole } from '@solana/instructions';
import type { ConditionalValueNode, ContextualValueNode, InstructionAccountNode, InstructionInputValueNode, InstructionNode, RootNode, ValueNode } from 'codama';
import type { StructError } from 'superstruct';
import { assert } from 'superstruct';

import { AddressInput, toAddress } from '../../shared/address';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';
import { derivePDA } from './pda';
import { createIxAccountsValidator } from './validators';

type ResolvedAccount = {
    address: Address | null;
    optional: boolean;
    role: AccountRole;
};

export async function resolveAccountMetas(
    root: RootNode,
    ixNode: InstructionNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
): Promise<AccountMeta[]> {
    const resolvedAccounts = await Promise.all(
        ixNode.accounts.map<Promise<ResolvedAccount>>(async ixAccountNode => {
            const accountAddressInput = accountsInput?.[ixAccountNode.name];

            // Double check required account is provided
            const isAccountProvided = accountAddressInput !== undefined && accountAddressInput !== null;
            if (!isAccountProvided && isIxAccountRequired(ixAccountNode)) {
                throw new AccountError(`Account not provided: ${ixAccountNode.name}`);
            }

            let resolvedAccountAddress: Address | null;
            if (!isAccountProvided) {
                resolvedAccountAddress = await resolveAccountAddress(
                    root,
                    ixNode,
                    ixAccountNode,
                    argumentsInput,
                    accountsInput
                );
            }

            return {
                // Important: treat `null` the same as "not provided" so the IDL's
                // optionalAccountStrategy can decide whether to omit or substitute programId.
                address: isAccountProvided ? toAddress(accountAddressInput) : resolvedAccountAddress,
                optional: Boolean(ixAccountNode.isOptional),
                role: getAccountRole(ixAccountNode),
            };
        })
    );

    // FIXME: Handle remaining accounts:
    // Can be provided via argument, e.g argumentValueNode("signers"), multisig signers in Token Program
    // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionRemainingAccountsNode.md
    return (
        resolvedAccounts
            // omitted optional accounts
            .filter(acc => acc.address !== null)
            .map(acc => {
                return {
                    address: acc.address,
                    role: acc.role,
                };
            })
    );
}

// Optional accounts can be omitted
// Accounts with default values can be omitted, as they can be resolved from default value
function isIxAccountRequired(ixAccountNode: InstructionAccountNode) {
    return !ixAccountNode.isOptional && !ixAccountNode.defaultValue;
}

async function resolveAccountAddress(
    root: RootNode,
    ixNode: InstructionNode,
    ixAccountNode: InstructionAccountNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
): Promise<Address | null> {
    const accountAddressInput = accountsInput?.[ixAccountNode.name];
    // Undefined optional accounts are handled according on optionalAccountStrategy
    // With "programId" optionalStrategy, optional accounts are resolved to programId
    // With "omitted" optionalStrategy, optional accounts must be excluded from accounts list
    // By default, optional accounts are resolved to programId
    if (!accountAddressInput && ixAccountNode.isOptional) {
        switch (ixNode.optionalAccountStrategy) {
            case 'omitted':
                return null;
            case 'programId':
                return address(root.program.publicKey);
            default:
                throw new AccountError(
                    `Cannot resolve optional account: ${ixAccountNode.name} of ${ixNode.name} instruction with strategy: ${String(ixNode.optionalAccountStrategy)}`
                );
        }
    }

    if (!ixAccountNode.defaultValue) {
        throw new AccountError(`Cannot resolve account ${ixAccountNode.name} of ${ixNode.name} instruction. Account doesn't have default value`);
    }

    const resolvedAddress = await resolveInstructionAccountNodeValue(
        root,
        ixNode,
        ixAccountNode,
        accountAddressInput,
        argumentsInput,
        accountsInput
    );
    return resolvedAddress;
}

async function resolveInstructionAccountNodeValue(
    root: RootNode,
    ixNode: InstructionNode,
    ixAccountNode: InstructionAccountNode,
    accountAddressInput: AddressInput,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
) {
    const addressValue = await resolveInstructionInputValueNode(
        root,
        ixNode,
        ixAccountNode,
        ixAccountNode.defaultValue,
        accountAddressInput,
        argumentsInput,
        accountsInput
    )
    return addressValue;
}

async function resolveInstructionInputValueNode(
    root: RootNode,
    ixNode: InstructionNode,
    ixAccountNode: InstructionAccountNode,
    ixInputValueNode: InstructionInputValueNode,
    accountAddressInput: AddressInput,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
) {
    switch (ixInputValueNode.kind) {
        // Contextual value nodes
        case 'pdaValueNode':
        case 'identityValueNode':
        case 'payerValueNode':
        case 'resolverValueNode':
        case 'accountBumpValueNode':
        case 'accountValueNode':
        case 'argumentValueNode':
        case 'programIdValueNode':
        case 'conditionalValueNode': {
            const resolvedValue = await resolveDefaultContextualValueNode(
                root,
                ixNode,
                ixAccountNode,
                ixInputValueNode,
                accountAddressInput,
                argumentsInput,
                accountsInput
            );
            return resolvedValue;
        }
        // Value nodes
        case 'publicKeyValueNode': {
            return address(ixInputValueNode.publicKey);
        }
        // TODO: Can be resolved but it looks like it doesn't make sense as we expect Address
        case 'programLinkNode':
        case 'arrayValueNode':
        case 'booleanValueNode':
        case 'bytesValueNode':
        case 'constantValueNode':
        case 'enumValueNode':
        case 'mapValueNode':
        case 'noneValueNode':
        case 'numberValueNode':
        case 'setValueNode':
        case 'someValueNode':
        case 'stringValueNode':
        case 'structValueNode':
        case 'tupleValueNode':
        default: {
            throw new AccountError(`Cannot resolve account ${ixAccountNode.name}:${ixAccountNode.kind} of ${ixNode.name} instruction`);
        }
    }
}

async function resolveDefaultContextualValueNode(
    root: RootNode,
    ixNode: InstructionNode,
    ixAccountNode: InstructionAccountNode,
    valueNode: ContextualValueNode,
    accountAddressInput: AddressInput,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
) {
    switch (valueNode.kind) {
        case 'pdaValueNode': {
            const pda = await derivePDA(root, ixNode, ixAccountNode, argumentsInput, accountsInput);
            return pda[0];
        }
        // Signers and Payers must be provided from input
        case 'identityValueNode': {
            return toAddress(accountAddressInput);
        }
        case 'payerValueNode': {
            return toAddress(accountAddressInput);
        }
        case 'conditionalValueNode': {
            const resolvedInputValueNode = await resolveConditionalValueNode(
                root,
                ixNode,
                valueNode,
                argumentsInput,
                accountsInput,
            );
            const addressValue: Address<string> = await resolveInstructionInputValueNode(
                root,
                ixNode,
                ixAccountNode,
                resolvedInputValueNode,
                accountAddressInput,
                argumentsInput,
                accountsInput,
            );
            return addressValue;
        }
        // TODO: here we want to (or may be don't want to) create address from other types of default values (InstructionAccountNode)
        // DOCS: InstructionAccountNode => InstructionInputValueNode
        // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionAccountNode.md
        case 'accountBumpValueNode':
        case 'accountValueNode': // An instruction account defaulting (referencing) to another account, can be in accountsInput or auto-derived pda
        case 'argumentValueNode':
        case 'programIdValueNode':
        case 'resolverValueNode':
        default: {
            throw new AccountError(`Cannot resolve ContextualValueNode: ${valueNode.kind} in ${ixAccountNode.name} account`);
        }
    }
}

export function validateAccountsInput(ixNode: InstructionNode, accountsInput: AccountsInput = {}) {
    if (!ixNode.accounts.length) return;

    const AccountsInputValidator = createIxAccountsValidator(ixNode.accounts);
    try {
        assert(accountsInput, AccountsInputValidator);
    } catch (error) {
        const { key, value, message } = error as StructError;
        // TODO: ensure this error is user friendly
        if (!value) {
            throw new AccountError(`Missing required account: ${key}. ${message}`);
        } else {
            throw new AccountError(`Invalid address of "${key}" account: ${value}`);
        }
    }
}

function getAccountRole(acc: InstructionAccountNode): AccountRole {
    if (acc.isWritable && acc.isSigner) {
        return AccountRole.WRITABLE_SIGNER;
    }
    if (acc.isWritable && !acc.isSigner) {
        return AccountRole.WRITABLE;
    }
    if (!acc.isWritable && acc.isSigner) {
        return AccountRole.READONLY_SIGNER;
    }
    return AccountRole.READONLY;
}


async function resolveConditionalValueNode(
    root: RootNode,
    ixNode: InstructionNode,
    conditionalValueNode: ConditionalValueNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {},
) {
    const { condition, value: requiredValueNode, ifTrue, ifFalse } = conditionalValueNode;

    // TODO: This can happen by design, yet not sure that this is valid
    if (!requiredValueNode && !ifTrue && !ifFalse) {
        throw new AccountError('Invalid conditionalValueNode!');
    }

    const providedValue = await resolveConditionNodeValue(
        root,
        ixNode,
        condition,
        argumentsInput,
        accountsInput,
    );
    // If provided, the condition must be equal to required value.
    if (requiredValueNode) {
        const requiredValue = resolveDefaultValueNode(
            requiredValueNode,
            argumentsInput,
            accountsInput
        );
        // TODO: Deep equality check for complex types, like maps, structs, arrays, etc.
        return requiredValue.value === providedValue ? ifTrue : ifFalse;
    } else {
        // Otherwise, the condition must simply exist
        return providedValue ? ifTrue : ifFalse;
    }
}

async function resolveConditionNodeValue(
    root: RootNode,
    ixNode: InstructionNode,
    conditionNode: ConditionalValueNode['condition'],
    // valueNode: ValueNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {},
) {
    switch (conditionNode.kind) {
        case 'accountValueNode': {
            const ixAccountNode = ixNode.accounts.find(acc => acc.name === conditionNode.name);
            if (!ixAccountNode) {
                throw new AccountError(`Missing instruction account node for conditionalValueNode condition: ${conditionNode.name}`);
            }
            const conditionalAddress = await resolveAccountAddress(
                root,
                ixNode,
                ixAccountNode,
                argumentsInput,
                accountsInput
            );
            return conditionalAddress;
        }
        case 'argumentValueNode': {
            const argInput = argumentsInput[conditionNode.name];
            return argInput;
        }
        case 'resolverValueNode': {
            throw new AccountError('ResolverValueNode is not supported in conditionalValueNode yet');
        }
        default: {
            const kind = (conditionNode as { kind?: unknown })?.kind ?? 'unknown';
            throw new AccountError(`Unsupported condition node kind: ${kind} of instruction node ${ixNode.name}`);
        }
    }
}


function resolveDefaultValueNode(
    valueNode: ValueNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
) {
    switch (valueNode.kind) {
        case 'publicKeyValueNode': {
            return {
                kind: valueNode.kind,
                value: address(valueNode.publicKey),
            };
        }
        case 'booleanValueNode': {
            return {
                kind: valueNode.kind,
                value: valueNode.boolean,
            };
        }
        case 'bytesValueNode': {
            return {
                encoding: valueNode.encoding,
                kind: valueNode.kind,
                value: valueNode.data,
            };
        }
        case 'constantValueNode': {
            return resolveDefaultValueNode(
                valueNode.value,
                argumentsInput,
                accountsInput,
            );
        }
        case 'numberValueNode': {
            return {
                kind: valueNode.kind,
                value: valueNode.number,
            };
        }
        case 'stringValueNode': {
            return {
                kind: valueNode.kind,
                value: valueNode.string,
            };
        }
        case 'someValueNode': {
            return resolveDefaultValueNode(
                valueNode.value,
                argumentsInput,
                accountsInput,
            );
        }
        case 'noneValueNode': {
            return {
                kind: valueNode.kind,
                value: null,
            }
        }
        case 'enumValueNode':
        case 'mapValueNode':
        case 'setValueNode':
        case 'structValueNode':
        case 'tupleValueNode':
        case 'arrayValueNode':
        default: {
            throw new AccountError(`Cannot resolve ValueNode: ${valueNode.kind}`);
        }
    }
}