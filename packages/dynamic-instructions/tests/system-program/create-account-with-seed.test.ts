import { beforeEach, describe, expect, test } from 'vitest';

import type { SystemProgramClient } from '../generated/system-program-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

describe('System Program: createAccountWithSeed', () => {
    const programClient = createTestProgramClient<SystemProgramClient>('system-program-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
    });

    test('should create a new account at a seed-derived address', async () => {
        const payerAccount = ctx.createFundedAccount();
        const baseAccount = ctx.createFundedAccount();

        const seed = 'vault';
        const newAccount = await ctx.createAccountWithSeed(baseAccount, seed, programClient.programAddress);

        const accountSpace = 64;
        const fundingLamports = 5_000_000;

        const createAccountWithSeedInstruction = await programClient.methods
            .createAccountWithSeed({
                base: baseAccount,
                seed,
                amount: fundingLamports,
                space: accountSpace,
                programAddress: programClient.programAddress,
            })
            .accounts({
                payer: payerAccount,
                newAccount,
                baseAccount,
            })
            .instruction();

        ctx.sendInstruction(createAccountWithSeedInstruction, [payerAccount, baseAccount]);

        const createdAccount = ctx.requireEncodedAccount(newAccount);

        expect(createdAccount).toMatchObject({
            lamports: BigInt(fundingLamports),
            data: new Uint8Array(accountSpace),
            owner: programClient.programAddress,
            executable: false,
        });
    });
});
