import type { AccountLookupMeta, AccountMeta, Instruction } from '@solana/instructions';
import { AccountRole } from '@solana/instructions';
import * as web3 from '@solana/web3.js';

export function toLegacyAccountMeta(accountMeta: AccountMeta | AccountLookupMeta): web3.AccountMeta {
    return {
        pubkey: new web3.PublicKey(accountMeta.address),
        isSigner: accountMeta.role === AccountRole.WRITABLE_SIGNER || accountMeta.role === AccountRole.READONLY_SIGNER,
        isWritable: accountMeta.role === AccountRole.WRITABLE_SIGNER || accountMeta.role === AccountRole.WRITABLE,
    };
}

/**
 * Converts a kit-style `Instruction` (from `@solana/instructions`) to a legacy
 * `@solana/web3.js` `TransactionInstruction`.
 */
export function toLegacyTransactionInstruction(instruction: Instruction): web3.TransactionInstruction {
    return new web3.TransactionInstruction({
        programId: new web3.PublicKey(instruction.programAddress),
        data: Buffer.from(instruction.data ?? []),
        keys: (instruction.accounts ?? []).map(toLegacyAccountMeta),
    });
}

export type ToVersionedTransactionOptions = {
    payerKey: web3.PublicKey;
    recentBlockhash: string;
    addressLookupTableAccounts?: web3.AddressLookupTableAccount[];
};

/**
 * Converts kit-style instructions to a v0 `VersionedTransaction`.
 *
 * Note: This produces an *unsigned* transaction; call `tx.sign([payer, ...])`
 * with web3.js signers as needed.
 */
export function toVersionedTransaction(
    instructions: Instruction | readonly Instruction[],
    options: ToVersionedTransactionOptions
): web3.VersionedTransaction {
    const ixs = Array.isArray(instructions) ? instructions : [instructions];
    const legacyIxs = ixs.map(toLegacyTransactionInstruction);

    const messageV0 = new web3.TransactionMessage({
        payerKey: options.payerKey,
        recentBlockhash: options.recentBlockhash,
        instructions: legacyIxs,
    }).compileToV0Message(options.addressLookupTableAccounts);

    return new web3.VersionedTransaction(messageV0);
}
