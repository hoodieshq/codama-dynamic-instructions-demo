import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { SPL_TOKEN_MINT_SIZE, systemClient, tokenClient } from './token-test-utils';

describe('Token Program: initializeMint2', () => {
    test('should initialize a mint without requiring the Rent sysvar', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const mintAccount = ctx.createAccount();

        const mintRent = ctx.getMinimumBalanceForRentExemption(BigInt(SPL_TOKEN_MINT_SIZE));

        const createAccountIx = await systemClient.methods
            .createAccount({
                lamports: mintRent,
                programAddress: tokenClient.programAddress,
                space: SPL_TOKEN_MINT_SIZE,
            })
            .accounts({
                newAccount: mintAccount,
                payer,
            })
            .instruction();

        const initMintIx = await tokenClient.methods
            .initializeMint2({ decimals: 9, mintAuthority: payer })
            .accounts({ mint: mintAccount })
            .instruction();

        ctx.sendInstructions([createAccountIx, initMintIx], [payer, mintAccount]);

        const encodedAccount = ctx.requireEncodedAccount(mintAccount);
        expect(encodedAccount.owner).toBe(tokenClient.programAddress);
        expect(encodedAccount.data.length).toBe(SPL_TOKEN_MINT_SIZE);
    });
});
