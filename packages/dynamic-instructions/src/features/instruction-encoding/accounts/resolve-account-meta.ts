import type { Address } from '@solana/addresses';
import type { AccountMeta } from '@solana/instructions';
import { AccountRole } from '@solana/instructions';
import type { InstructionAccountNode, InstructionNode, RootNode } from 'codama';

import { toAddress } from '../../../shared/address';
import { AccountError } from '../../../shared/errors';
import type { AccountsInput, ArgumentsInput, ResolutionPath } from '../../../shared/types';
import { resolveAccountAddress } from './resolve-account-address';

type ResolvedAccount = {
    address: Address | null;
    optional: boolean;
    role: AccountRole;
};

type ResolvedAccountWithAddress = ResolvedAccount & { address: Address };

/**
 * Resolves the AccountMeta for each account in the instruction by evaluating their default values.
 * Handles optional accounts based on the instruction's optionalAccountStrategy.
 * Throws errors if required accounts are missing or cannot be resolved.
 */
export async function resolveAccountMeta(
    root: RootNode,
    ixNode: InstructionNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {},
): Promise<AccountMeta[]> {
    const resolvedAccounts = await Promise.all(
        ixNode.accounts.map<Promise<ResolvedAccount>>(async ixAccountNode => {
            const accountAddressInput = accountsInput?.[ixAccountNode.name];

            // Double check required account is provided
            const isAccountProvided = accountAddressInput !== undefined && accountAddressInput !== null;
            if (!isAccountProvided && isIxAccountRequired(ixAccountNode)) {
                throw new AccountError(`Account not provided: ${ixAccountNode.name}`);
            }

            const initialResolutionPath: ResolutionPath = [];
            let resolvedAccountAddress: Address | null = null;
            if (!isAccountProvided) {
                resolvedAccountAddress = await resolveAccountAddress(
                    root,
                    ixNode,
                    ixAccountNode,
                    argumentsInput,
                    accountsInput,
                    initialResolutionPath,
                );
            }

            return {
                // Important: treat `null` the same as "not provided" so the IDL's
                // optionalAccountStrategy can decide whether to omit or substitute programId.
                address: isAccountProvided ? toAddress(accountAddressInput) : resolvedAccountAddress,
                optional: Boolean(ixAccountNode.isOptional),
                role: getAccountRole(ixAccountNode),
            };
        }),
    );

    // FIXME: Handle remaining accounts:
    // Can be provided via argument, e.g argumentValueNode("signers"), multisig signers in Token Program
    // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionRemainingAccountsNode.md
    return (
        resolvedAccounts
            // omitted optional accounts
            .filter((acc): acc is ResolvedAccountWithAddress => acc.address !== null)
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
