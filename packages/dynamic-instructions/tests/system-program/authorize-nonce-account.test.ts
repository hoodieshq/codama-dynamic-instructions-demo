import { beforeEach, describe, expect, test } from 'vitest';

import { createTestProgramClient, SvmTestContext } from '../test-utils';

describe('System Program: authorizeNonceAccount', () => {
    const programClient = createTestProgramClient('system-program-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
    });

    test('should change nonce account authority to a new authority', async () => {
        const payer = ctx.createFundedAccount();
        const nonceAccount = ctx.createAccount();
        const originalAuthority = ctx.createFundedAccount();
        const newAuthority = ctx.createAccount();

        const nonceAccountSpace = 80;
        const fundingLamports = 10_000_000;

        const createAccountInstruction = await programClient.methods
            .createAccount({
                lamports: fundingLamports,
                space: nonceAccountSpace,
                programAddress: programClient.programAddress,
            })
            .accounts({
                payer,
                newAccount: nonceAccount,
            })
            .instruction();

        ctx.sendInstruction(createAccountInstruction, [payer, nonceAccount]);

        const initializeNonceInstruction = await programClient.methods
            .initializeNonceAccount({
                nonceAuthority: originalAuthority,
            })
            .accounts({
                nonceAccount,
            })
            .instruction();

        ctx.sendInstruction(initializeNonceInstruction, [payer]);

        const initializedAccount = ctx.requireEncodedAccount(nonceAccount);
        expect(initializedAccount).toMatchObject({
            lamports: BigInt(fundingLamports),
            owner: programClient.programAddress,
            executable: false,
        });

        const authorizeNonceInstruction = await programClient.methods
            .authorizeNonceAccount({
                newNonceAuthority: newAuthority,
            })
            .accounts({
                nonceAccount,
                nonceAuthority: originalAuthority,
            })
            .instruction();

        ctx.sendInstruction(authorizeNonceInstruction, [originalAuthority]);

        const authorizedAccount = ctx.requireEncodedAccount(nonceAccount);
        expect(authorizedAccount).toMatchObject({
            lamports: BigInt(fundingLamports),
            owner: programClient.programAddress,
            executable: false,
        });
        expect(authorizedAccount.data.length).toBe(nonceAccountSpace);
    });

    test('should allow changing authority multiple times', async () => {
        const payer = ctx.createFundedAccount();
        const nonceAccount = ctx.createAccount();
        const firstAuthority = ctx.createFundedAccount();
        const secondAuthority = ctx.createFundedAccount();
        const thirdAuthority = ctx.createAccount();

        const nonceAccountSpace = 80;
        const fundingLamports = 10_000_000;

        const createAccountInstruction = await programClient.methods
            .createAccount({
                lamports: fundingLamports,
                space: nonceAccountSpace,
                programAddress: programClient.programAddress,
            })
            .accounts({
                payer,
                newAccount: nonceAccount,
            })
            .instruction();

        ctx.sendInstruction(createAccountInstruction, [payer, nonceAccount]);

        const initializeNonceInstruction = await programClient.methods
            .initializeNonceAccount({
                nonceAuthority: firstAuthority,
            })
            .accounts({
                nonceAccount,
            })
            .instruction();

        ctx.sendInstruction(initializeNonceInstruction, [payer]);

        const authorizeToSecondInstruction = await programClient.methods
            .authorizeNonceAccount({
                newNonceAuthority: secondAuthority,
            })
            .accounts({
                nonceAccount,
                nonceAuthority: firstAuthority,
            })
            .instruction();

        ctx.sendInstruction(authorizeToSecondInstruction, [firstAuthority]);

        const authorizeToThirdInstruction = await programClient.methods
            .authorizeNonceAccount({
                newNonceAuthority: thirdAuthority,
            })
            .accounts({
                nonceAccount,
                nonceAuthority: secondAuthority,
            })
            .instruction();

        ctx.sendInstruction(authorizeToThirdInstruction, [secondAuthority]);

        const finalAccount = ctx.requireEncodedAccount(nonceAccount);
        expect(finalAccount).toMatchObject({
            lamports: BigInt(fundingLamports),
            owner: programClient.programAddress,
            executable: false,
        });
        expect(finalAccount.data.length).toBe(nonceAccountSpace);
    });

    test('should work when authority transfers to itself (no-op transfer)', async () => {
        const payer = ctx.createFundedAccount();
        const nonceAccount = ctx.createAccount();
        const authority = ctx.createFundedAccount();

        const nonceAccountSpace = 80;
        const fundingLamports = 10_000_000;

        const createAccountInstruction = await programClient.methods
            .createAccount({
                lamports: fundingLamports,
                space: nonceAccountSpace,
                programAddress: programClient.programAddress,
            })
            .accounts({
                payer,
                newAccount: nonceAccount,
            })
            .instruction();

        ctx.sendInstruction(createAccountInstruction, [payer, nonceAccount]);

        const initializeNonceInstruction = await programClient.methods
            .initializeNonceAccount({
                nonceAuthority: authority,
            })
            .accounts({
                nonceAccount,
            })
            .instruction();

        ctx.sendInstruction(initializeNonceInstruction, [payer]);

        const authorizeInstruction = await programClient.methods
            .authorizeNonceAccount({
                newNonceAuthority: authority,
            })
            .accounts({
                nonceAccount,
                nonceAuthority: authority,
            })
            .instruction();

        ctx.sendInstruction(authorizeInstruction, [authority]);

        const finalAccount = ctx.requireEncodedAccount(nonceAccount);
        expect(finalAccount).toMatchObject({
            lamports: BigInt(fundingLamports),
            owner: programClient.programAddress,
            executable: false,
        });
    });
});
