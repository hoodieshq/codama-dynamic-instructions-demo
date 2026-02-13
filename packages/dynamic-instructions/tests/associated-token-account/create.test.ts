import { beforeEach, describe, expect, test } from 'vitest';

import { findAssociatedTokenPda, getTokenDecoder } from '@solana-program/token';

import { SvmTestContext } from '../test-utils';
import { ataClient, createMint, tokenClient } from './ata-test-utils';

describe('Associated Token Account: create', () => {
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext({ defaultPrograms: true });
    });

    test('should create an associated token account', async () => {
        const payer = ctx.createFundedAccount();
        const mintAuthority = ctx.createFundedAccount();
        const mint = ctx.createAccount();
        const wallet = ctx.createFundedAccount();

        await createMint(ctx, payer, mint, mintAuthority);

        const [ataAddress] = await findAssociatedTokenPda({ owner: wallet, tokenProgram: tokenClient.programAddress, mint });

        const ix = await ataClient.methods
            .create()
            .accounts({
                fundingAddress: payer,
                associatedAccountAddress: ataAddress,
                walletAddress: wallet,
                tokenMintAddress: mint,
            })
            .instruction();

        ctx.sendInstruction(ix, [payer]);

        const ataAccount = ctx.requireEncodedAccount(ataAddress);
        const tokenData = getTokenDecoder().decode(ataAccount.data);
        expect(ataAccount.owner).toBe(tokenClient.programAddress);
        expect(tokenData.mint).toBe(mint);
        expect(tokenData.owner).toBe(wallet);
    });
});
