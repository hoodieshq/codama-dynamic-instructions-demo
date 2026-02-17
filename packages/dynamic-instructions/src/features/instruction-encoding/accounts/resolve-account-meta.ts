import type { Address } from '@solana/addresses';
import type { AccountMeta } from '@solana/instructions';
import { AccountRole } from '@solana/instructions';
import type { InstructionAccountNode, InstructionNode, RootNode } from 'codama';

import { isPublicKeyLike, toAddress } from '../../../shared/address';
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
                resolvedAccountAddress = await resolveAccountAddress({
                    accountAddressInput,
                    accountsInput,
                    argumentsInput,
                    ixAccountNode,
                    ixNode,
                    resolutionPath: initialResolutionPath,
                    root,
                });
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

    const accountMetas: AccountMeta[] = resolvedAccounts
        // omitted optional accounts
        .filter((acc): acc is ResolvedAccountWithAddress => acc.address !== null)
        .map(acc => ({
            address: acc.address,
            role: acc.role,
        }));

    // Resolve remaining accounts from argument values
    // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionRemainingAccountsNode.md
    for (const remainingNode of ixNode.remainingAccounts ?? []) {
        if (remainingNode.value.kind !== 'argumentValueNode') continue;
        const addresses = argumentsInput[remainingNode.value.name];
        if (addresses === undefined) continue;
        if (!Array.isArray(addresses)) {
            throw new AccountError(
                `Remaining account argument "${remainingNode.value.name}" must be an array of addresses`,
            );
        }
        const role = getRemainingAccountRole(remainingNode.isSigner, remainingNode.isWritable);
        for (let i = 0; i < addresses.length; i++) {
            const addr: unknown = addresses[i];
            if (typeof addr !== 'string' && !isPublicKeyLike(addr)) {
                throw new AccountError(
                    `Remaining account argument "${remainingNode.value.name}[${i}]" must be an address string or PublicKey, got ${typeof addr}`,
                );
            }
            accountMetas.push({ address: toAddress(addr), role });
        }
    }

    return accountMetas;
}

// Optional accounts can be omitted
// Accounts with default values can be omitted, as they can be resolved from default value
function isIxAccountRequired(ixAccountNode: InstructionAccountNode) {
    return !ixAccountNode.isOptional && !ixAccountNode.defaultValue;
}

// TODO: 'either' is treated as signer — this works for Token Program multisig signers,
// but may need refinement for programs where 'either' accounts are sometimes non-signers.
function getRemainingAccountRole(isSigner?: boolean | 'either', isWritable?: boolean): AccountRole {
    const signer = isSigner === true || isSigner === 'either';
    const writable = isWritable === true;
    if (writable && signer) return AccountRole.WRITABLE_SIGNER;
    if (writable) return AccountRole.WRITABLE;
    if (signer) return AccountRole.READONLY_SIGNER;
    return AccountRole.READONLY;
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
