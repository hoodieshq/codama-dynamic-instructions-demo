import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { createMint, createTokenAccount, tokenClient } from './token-test-utils';
import { SPL_TOKEN_ACCOUNT_SIZE } from './token-test-utils';

describe('Token Program: initializeAccount', () => {
    test('should initialize a token account', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const mintAccount = ctx.createAccount();
        const tokenAccount = ctx.createAccount();
        const owner = ctx.createAccount();

        await createMint(ctx, payer, mintAccount, payer);
        await createTokenAccount(ctx, payer, tokenAccount, mintAccount, owner);

        const encodedAccount = ctx.requireEncodedAccount(tokenAccount);
        expect(encodedAccount.owner).toBe(tokenClient.programAddress);
        expect(encodedAccount.data.length).toBe(SPL_TOKEN_ACCOUNT_SIZE);
    });
});
