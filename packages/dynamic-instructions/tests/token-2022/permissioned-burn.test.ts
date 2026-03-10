import type { Address } from '@solana/addresses';
import { some } from '@solana/codecs';
import { getMintDecoder, getMintSize, getTokenDecoder } from '@solana-program/token-2022';
import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { createTokenAccount, mintTokens, systemClient, token2022Client } from './token-2022-test-utils';

async function createPermissionedBurnMint(ctx: SvmTestContext, payer: Address, burnAuthority: Address) {
    const mint = ctx.createAccount();
    const size = getMintSize([{ __kind: 'PermissionedBurn', authority: burnAuthority }]);
    const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(size));

    const createAccountIx = await systemClient.methods
        .createAccount({ lamports, programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS, space: size })
        .accounts({ newAccount: mint, payer })
        .instruction();

    const initPermissionedBurnIx = await token2022Client.methods
        .initializePermissionedBurn({ authority: burnAuthority })
        .accounts({ mint })
        .instruction();

    const initMintIx = await token2022Client.methods
        .initializeMint2({ decimals: 9, mintAuthority: payer })
        .accounts({ mint })
        .instruction();

    ctx.sendInstructions([createAccountIx, initPermissionedBurnIx, initMintIx], [payer, mint]);
    return mint;
}

// Skipped: ensure instruction is available in the LiteSVM Token 2022 binary.
describe.skip('Token 2022 Program: permissionedBurn', () => {
    test('should initialize permissioned burn extension [initializePermissionedBurn]', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const burnAuthority = ctx.createFundedAccount();

        const mint = await createPermissionedBurnMint(ctx, payer, burnAuthority);

        const mintData = getMintDecoder().decode(ctx.requireEncodedAccount(mint).data);
        expect(mintData.mintAuthority).toEqual({ __option: 'Some', value: payer });
        expect(mintData.extensions).toMatchObject(
            some([{ __kind: 'PermissionedBurn', authority: some(burnAuthority) }]),
        );
    });

    test('should burn tokens with permissioned burn authority [permissionedBurn]', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const burnAuthority = ctx.createFundedAccount();

        const mint = await createPermissionedBurnMint(ctx, payer, burnAuthority);
        const tokenAccount = ctx.createAccount();
        await createTokenAccount(ctx, payer, tokenAccount, mint, payer);
        await mintTokens(ctx, payer, mint, tokenAccount, payer, 1_000_000);

        const burnIx = await token2022Client.methods
            .permissionedBurn({ amount: 500_000 })
            .accounts({ account: tokenAccount, authority: payer, mint, permissionedBurnAuthority: burnAuthority })
            .instruction();
        ctx.sendInstruction(burnIx, [payer, burnAuthority]);

        const tokenData = getTokenDecoder().decode(ctx.requireEncodedAccount(tokenAccount).data);
        expect(tokenData.amount).toBe(500_000n);
    });

    test('should burn tokens checked with permissioned burn authority [permissionedBurnChecked]', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true, precompiles: true });
        const payer = ctx.createFundedAccount();
        const burnAuthority = ctx.createFundedAccount();

        const mint = await createPermissionedBurnMint(ctx, payer, burnAuthority);
        const tokenAccount = ctx.createAccount();
        await createTokenAccount(ctx, payer, tokenAccount, mint, payer);
        await mintTokens(ctx, payer, mint, tokenAccount, payer, 1_000_000);

        const burnCheckedIx = await token2022Client.methods
            .permissionedBurnChecked({ amount: 300_000, decimals: 9 })
            .accounts({ account: tokenAccount, authority: payer, mint, permissionedBurnAuthority: burnAuthority })
            .instruction();
        ctx.sendInstruction(burnCheckedIx, [payer, burnAuthority]);

        const tokenData = getTokenDecoder().decode(ctx.requireEncodedAccount(tokenAccount).data);
        expect(tokenData.amount).toBe(700_000n);
    });
});
