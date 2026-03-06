import { address } from '@solana/addresses';
import { getTokenDecoder } from '@solana-program/token-2022';
import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { systemClient, TOKEN_2022_ACCOUNT_SIZE, token2022Client } from './token-2022-test-utils';

const TOKEN_2022_NATIVE_MINT = address('9pan9bMn5HatX4EJdBwg9VgCa7Uz5HL8N1m5D3NdXejP');

describe.skip('Token 2022 Program: unwrapLamports', () => {
    // Skipped: unwrapLamports instruction is not available in the LiteSVM Token 2022 binary.
    test('should unwrap lamports from a Token 2022 wrapped SOL account', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const destination = ctx.createFundedAccount();

        // Ensure the Token 2022 native mint exists.
        const createNativeMintIx = await token2022Client.methods
            .createNativeMint()
            .accounts({ nativeMint: TOKEN_2022_NATIVE_MINT, payer, systemProgram: ctx.SYSTEM_PROGRAM_ADDRESS })
            .instruction();
        ctx.sendInstruction(createNativeMintIx, [payer]);

        // Create and initialize a wrapped SOL token account.
        const wrappedSolAccount = ctx.createAccount();
        const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(TOKEN_2022_ACCOUNT_SIZE));
        const createAccountIx = await systemClient.methods
            .createAccount({
                lamports,
                programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS,
                space: TOKEN_2022_ACCOUNT_SIZE,
            })
            .accounts({ newAccount: wrappedSolAccount, payer })
            .instruction();

        const initAccountIx = await token2022Client.methods
            .initializeAccount()
            .accounts({ account: wrappedSolAccount, mint: TOKEN_2022_NATIVE_MINT, owner: payer })
            .instruction();

        console.log('Creating and initializing wrapped SOL account...');
        ctx.sendInstructions([createAccountIx, initAccountIx], [payer, wrappedSolAccount]);

        // Transfer SOL into the wrapped account and sync.
        const depositAmount = 1_000_000_000n;
        const transferIx = await systemClient.methods
            .transferSol({ amount: depositAmount })
            .accounts({ destination: wrappedSolAccount, source: payer })
            .instruction();

        const syncIx = await token2022Client.methods
            .syncNative()
            .accounts({ account: wrappedSolAccount })
            .instruction();

        console.log('Transferring SOL into wrapped account and syncing...');
        ctx.sendInstructions([transferIx, syncIx], [payer]);

        const decoder = getTokenDecoder();
        const beforeUnwrap = decoder.decode(ctx.requireEncodedAccount(wrappedSolAccount).data);
        expect(beforeUnwrap.amount).toBe(depositAmount);

        // Unwrap lamports.
        const destBefore = ctx.getBalanceOrZero(destination);
        const unwrapIx = await token2022Client.methods
            .unwrapLamports()
            .accounts({ authority: payer, destination, source: wrappedSolAccount })
            .instruction();
        console.log('Unwrapping lamports from wrapped SOL account...');
        ctx.sendInstruction(unwrapIx, [payer]);

        expect(ctx.getBalanceOrZero(destination)).toBeGreaterThan(destBefore);
    });
});
