import type { Address } from '@solana/addresses';
import { address } from '@solana/addresses';
import type { AccountMeta } from '@solana/instructions';
import { AccountRole } from '@solana/instructions';
import type { InstructionAccountNode, InstructionNode, RootNode } from 'codama';
import type { StructError } from 'superstruct';
import { assert } from 'superstruct';

import { toAddress } from '../../shared/address';
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
                    `Cannot resolve optional account: ${ixAccountNode.name} with strategy: ${ixNode.optionalAccountStrategy}`
                );
        }
    }

    if (!ixAccountNode.defaultValue) {
        throw new AccountError(`Account doesn't have default value: ${ixAccountNode.name}`);
    }

    switch (ixAccountNode.defaultValue.kind) {
        case 'pdaValueNode': {
            const pda = await derivePDA(root, ixNode, ixAccountNode, argumentsInput, accountsInput);
            return pda[0];
        }
        case 'publicKeyValueNode': {
            return address(ixAccountNode.defaultValue.publicKey);
        }
        // TODO: here we want to (or may be don't want to) create address from other types of default values (InstructionAccountNode)
        // DOCS: InstructionAccountNode => InstructionInputValueNode
        // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionAccountNode.md
        case 'accountBumpValueNode':
        case 'accountValueNode':
        case 'argumentValueNode':
        case 'arrayValueNode':
        case 'booleanValueNode':
        case 'bytesValueNode':
        case 'conditionalValueNode':
        case 'constantValueNode':
        case 'enumValueNode':
        case 'identityValueNode':
        case 'mapValueNode':
        case 'noneValueNode':
        case 'numberValueNode':
        case 'payerValueNode':
        case 'programIdValueNode':
        case 'programLinkNode':
        case 'resolverValueNode':
        case 'setValueNode':
        case 'someValueNode':
        case 'stringValueNode':
        case 'structValueNode':
        case 'tupleValueNode':

        default: {
            throw new AccountError(`Cannot resolve account: ${ixAccountNode.name}`);
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
