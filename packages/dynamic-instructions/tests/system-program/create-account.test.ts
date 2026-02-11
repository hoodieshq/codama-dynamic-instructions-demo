import { beforeEach, describe, expect, test } from 'vitest';

import type { SystemProgramClient } from '../generated/system-program-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

describe('System Program: createAccount', () => {
    const programClient = createTestProgramClient<SystemProgramClient>('system-program-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
    });

    test('should create a new account with specified space and lamports', async () => {
        const payerAccount = ctx.createFundedAccount();
        const newAccountAddress = ctx.createAccount();

        const accountSpace = 165;
        const fundingLamports = 10_000_000;

        const createAccountInstruction = await programClient.methods
            .createAccount({
                lamports: fundingLamports,
                space: accountSpace,
                programAddress: programClient.programAddress,
            })
            .accounts({
                payer: payerAccount,
                newAccount: newAccountAddress,
            })
            .instruction();

        ctx.sendInstruction(createAccountInstruction, [payerAccount, newAccountAddress]);

        const createdAccount = ctx.requireEncodedAccount(newAccountAddress);

        expect(createdAccount).toMatchObject({
            lamports: BigInt(fundingLamports),
            data: new Uint8Array(accountSpace),
            owner: programClient.programAddress,
            executable: false,
        });
    });
});
