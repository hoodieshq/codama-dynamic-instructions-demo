import type { AccountLookupMeta, AccountMeta, Instruction } from '@solana/instructions';
import { AccountRole } from '@solana/instructions';
import * as web3 from '@solana/web3.js';

export function toLegacyAccountMeta(accountMeta: AccountLookupMeta | AccountMeta): web3.AccountMeta {
    return {
        isSigner: accountMeta.role === AccountRole.WRITABLE_SIGNER || accountMeta.role === AccountRole.READONLY_SIGNER,
        isWritable: accountMeta.role === AccountRole.WRITABLE_SIGNER || accountMeta.role === AccountRole.WRITABLE,
        pubkey: new web3.PublicKey(accountMeta.address),
    };
}

/**
 * Converts a kit-style `Instruction` (from `@solana/instructions`) to a legacy
 * `@solana/web3.js` `TransactionInstruction`.
 */
export function toLegacyTransactionInstruction(instruction: Instruction): web3.TransactionInstruction {
    return new web3.TransactionInstruction({
        data: Buffer.from(instruction.data ?? []),
        keys: (instruction.accounts ?? []).map(toLegacyAccountMeta),
        programId: new web3.PublicKey(instruction.programAddress),
    });
}

export type ToVersionedTransactionOptions = {
    addressLookupTableAccounts?: web3.AddressLookupTableAccount[];
    payerKey: web3.PublicKey;
    recentBlockhash: string;
};

/**
 * Converts kit-style instructions to a v0 `VersionedTransaction`.
 *
 * Note: This produces an *unsigned* transaction; call `tx.sign([payer, ...])`
 * with web3.js signers as needed.
 */
export function toVersionedTransaction(
    instructions: Instruction | readonly Instruction[],
    options: ToVersionedTransactionOptions,
): web3.VersionedTransaction {
    const ixs = Array.isArray(instructions) ? instructions : [instructions];
    const legacyIxs = ixs.map(toLegacyTransactionInstruction);

    const messageV0 = new web3.TransactionMessage({
        instructions: legacyIxs,
        payerKey: options.payerKey,
        recentBlockhash: options.recentBlockhash,
    }).compileToV0Message(options.addressLookupTableAccounts);

    return new web3.VersionedTransaction(messageV0);
}
