import { beforeEach, describe, expect, test } from 'vitest';

import { type AtaTestContext, createAtaTestContext, createMint, deriveAta } from './ata-test-utils';

describe('Associated Token Account: recoverNested', () => {
    let t: AtaTestContext;

    beforeEach(() => {
        t = createAtaTestContext();
    });

    test('should recover tokens from a nested associated token account', async () => {
        const payer = t.ctx.createFundedAccount();
        const mintAuthority = t.ctx.createFundedAccount();
        const ownerMint = t.ctx.createAccount();
        const nestedMint = t.ctx.createAccount();
        const wallet = t.ctx.createFundedAccount();

        await createMint(t, payer, ownerMint, mintAuthority);
        await createMint(t, payer, nestedMint, mintAuthority);

        // Create owner ATA (wallet → ownerMint)
        const ownerAta = deriveAta(t, wallet, ownerMint);
        const createOwnerAtaIx = await t.ataClient.methods
            .create()
            .accounts({ fundingAddress: payer, associatedAccountAddress: ownerAta, walletAddress: wallet, tokenMintAddress: ownerMint })
            .instruction();
        t.ctx.sendInstruction(createOwnerAtaIx, [payer]);

        // Create nested ATA (ownerAta → nestedMint) — tokens sent here accidentally
        const nestedAta = deriveAta(t, ownerAta, nestedMint);
        const createNestedAtaIx = await t.ataClient.methods
            .create()
            .accounts({ fundingAddress: payer, associatedAccountAddress: nestedAta, walletAddress: ownerAta, tokenMintAddress: nestedMint })
            .instruction();
        t.ctx.sendInstruction(createNestedAtaIx, [payer]);

        // Mint tokens to nested ATA
        const amount = BigInt(1_000_000);
        const mintToIx = await t.tokenClient.methods
            .mintTo({ amount })
            .accounts({ mint: nestedMint, token: nestedAta, mintAuthority })
            .instruction();
        t.ctx.sendInstruction(mintToIx, [payer, mintAuthority]);

        // Create destination ATA (wallet → nestedMint)
        const destinationAta = deriveAta(t, wallet, nestedMint);
        const createDestAtaIx = await t.ataClient.methods
            .create()
            .accounts({ fundingAddress: payer, associatedAccountAddress: destinationAta, walletAddress: wallet, tokenMintAddress: nestedMint })
            .instruction();
        t.ctx.sendInstruction(createDestAtaIx, [payer]);

        // Recover nested tokens
        const recoverIx = await t.ataClient.methods
            .recoverNested()
            .accounts({
                nestedAssociatedAccountAddress: nestedAta,
                nestedTokenMintAddress: nestedMint,
                destinationAssociatedAccountAddress: destinationAta,
                ownerAssociatedAccountAddress: ownerAta,
                ownerTokenMintAddress: ownerMint,
                walletAddress: wallet,
            })
            .instruction();
        t.ctx.sendInstruction(recoverIx, [payer, wallet]);

        // Verify tokens moved to destination
        const destAccount = t.ctx.requireEncodedAccount(destinationAta);
        const destAmount = new DataView(destAccount.data.buffer).getBigUint64(64, true);
        expect(destAmount).toBe(amount);
    });
});
