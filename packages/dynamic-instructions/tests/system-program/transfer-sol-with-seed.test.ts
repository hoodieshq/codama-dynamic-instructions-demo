import { beforeEach, describe, expect, test } from 'vitest';

import type { SystemProgramClient } from '../generated/system-program-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

describe('System Program: transferSolWithSeed', () => {
    const programClient = createTestProgramClient<SystemProgramClient>('system-program-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
    });

    test('should transfer SOL from a seed-derived account to a destination', async () => {
        const payerAccount = ctx.createFundedAccount();
        const baseAccount = ctx.createFundedAccount();

        const seed = 'vault';
        const source = await ctx.createAccountWithSeed(baseAccount, seed, programClient.programAddress);

        const fundingLamports = 10_000_000;
        const createIx = await programClient.methods
            .createAccountWithSeed({
                base: baseAccount,
                seed,
                amount: fundingLamports,
                space: 0,
                programAddress: programClient.programAddress,
            })
            .accounts({
                payer: payerAccount,
                newAccount: source,
                baseAccount,
            })
            .instruction();

        ctx.sendInstruction(createIx, [payerAccount, baseAccount]);

        const destination = ctx.createAccount();
        const transferAmount = 3_000_000;

        expect(ctx.requireEncodedAccount(source).lamports).toBe(BigInt(fundingLamports));
        expect(ctx.fetchEncodedAccount(destination)).toBeNull();

        const transferIx = await programClient.methods
            .transferSolWithSeed({
                amount: transferAmount,
                fromSeed: seed,
                fromOwner: programClient.programAddress,
            })
            .accounts({
                source,
                baseAccount,
                destination,
            })
            .instruction();

        ctx.sendInstruction(transferIx, [baseAccount]);

        const sourceAfter = ctx.requireEncodedAccount(source);
        const destinationAfter = ctx.requireEncodedAccount(destination);

        expect(sourceAfter.lamports).toBe(BigInt(fundingLamports) - BigInt(transferAmount));
        expect(destinationAfter.lamports).toBe(BigInt(transferAmount));
    });
});
