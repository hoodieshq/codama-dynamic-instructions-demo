import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { systemClient, tokenClient } from './token-test-utils';

describe('Token Program: initializeMint', () => {
    test('should initialize a mint with default freeze authority (None)', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const mintAccount = ctx.createAccount();

        const mintSpace = 82;
        const mintRent = ctx.getMinimumBalanceForRentExemption(BigInt(mintSpace));

        const createAccountIx = await systemClient.methods
            .createAccount({
                lamports: mintRent,
                programAddress: tokenClient.programAddress,
                space: mintSpace,
            })
            .accounts({
                newAccount: mintAccount,
                payer,
            })
            .instruction();

        const initMintIx = await tokenClient.methods
            .initializeMint({ decimals: 9, mintAuthority: payer })
            .accounts({ mint: mintAccount })
            .instruction();

        ctx.sendInstructions([createAccountIx, initMintIx], [payer, mintAccount]);

        const encodedAccount = ctx.requireEncodedAccount(mintAccount);
        expect(encodedAccount.owner).toBe(tokenClient.programAddress);
        expect(encodedAccount.data.length).toBe(mintSpace);
    });
});
