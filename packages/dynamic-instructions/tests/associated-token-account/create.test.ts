import { getAddressDecoder } from '@solana/addresses';
import { beforeEach, describe, expect, test } from 'vitest';

import { type AtaTestContext, createAtaTestContext, createMint, deriveAta } from './ata-test-utils';

describe('Associated Token Account: create', () => {
    let t: AtaTestContext;

    beforeEach(() => {
        t = createAtaTestContext();
    });

    test('should create an associated token account', async () => {
        const payer = t.ctx.createFundedAccount();
        const mintAuthority = t.ctx.createFundedAccount();
        const mint = t.ctx.createAccount();
        const wallet = t.ctx.createFundedAccount();

        await createMint(t, payer, mint, mintAuthority);

        const ataAddress = deriveAta(t, wallet, mint);

        const ix = await t.ataClient.methods
            .create()
            .accounts({
                fundingAddress: payer,
                associatedAccountAddress: ataAddress,
                walletAddress: wallet,
                tokenMintAddress: mint,
            })
            .instruction();

        t.ctx.sendInstruction(ix, [payer]);

        const ataAccount = t.ctx.requireEncodedAccount(ataAddress);
        expect(ataAccount.owner).toBe(t.tokenClient.programAddress);
        expect(getAddressDecoder().decode(ataAccount.data.slice(0, 32))).toBe(mint);
        expect(getAddressDecoder().decode(ataAccount.data.slice(32, 64))).toBe(wallet);
    });
});
