import { beforeEach, describe, expect, test } from 'vitest';

import { findAssociatedTokenPda, getTokenDecoder } from '@solana-program/token';

import { SvmTestContext } from '../test-utils';
import { ataClient, createMint, tokenClient } from './ata-test-utils';

describe('Associated Token Account: recoverNested', () => {
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext({ defaultPrograms: true });
    });

    test('should recover tokens from a nested associated token account', async () => {
        const payer = ctx.createFundedAccount();
        const mintAuthority = ctx.createFundedAccount();
        const ownerMint = ctx.createAccount();
        const nestedMint = ctx.createAccount();
        const wallet = ctx.createFundedAccount();

        await createMint(ctx, payer, ownerMint, mintAuthority);
        await createMint(ctx, payer, nestedMint, mintAuthority);

        // Create owner ATA (wallet → ownerMint)
        const [ownerAta] = await findAssociatedTokenPda({ owner: wallet, tokenProgram: tokenClient.programAddress, mint: ownerMint });
        const createOwnerAtaIx = await ataClient.methods
            .create()
            .accounts({ fundingAddress: payer, associatedAccountAddress: ownerAta, walletAddress: wallet, tokenMintAddress: ownerMint })
            .instruction();
        ctx.sendInstruction(createOwnerAtaIx, [payer]);

        // Create nested ATA (ownerAta → nestedMint) — tokens sent here accidentally
        const [nestedAta] = await findAssociatedTokenPda({ owner: ownerAta, tokenProgram: tokenClient.programAddress, mint: nestedMint });
        const createNestedAtaIx = await ataClient.methods
            .create()
            .accounts({ fundingAddress: payer, associatedAccountAddress: nestedAta, walletAddress: ownerAta, tokenMintAddress: nestedMint })
            .instruction();
        ctx.sendInstruction(createNestedAtaIx, [payer]);

        // Mint tokens to nested ATA
        const amount = BigInt(1_000_000);
        const mintToIx = await tokenClient.methods
            .mintTo({ amount })
            .accounts({ mint: nestedMint, token: nestedAta, mintAuthority })
            .instruction();
        ctx.sendInstruction(mintToIx, [payer, mintAuthority]);

        // Create destination ATA (wallet → nestedMint)
        const [destinationAta] = await findAssociatedTokenPda({ owner: wallet, tokenProgram: tokenClient.programAddress, mint: nestedMint });
        const createDestAtaIx = await ataClient.methods
            .create()
            .accounts({ fundingAddress: payer, associatedAccountAddress: destinationAta, walletAddress: wallet, tokenMintAddress: nestedMint })
            .instruction();
        ctx.sendInstruction(createDestAtaIx, [payer]);

        // Recover nested tokens
        const recoverIx = await ataClient.methods
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
        ctx.sendInstruction(recoverIx, [payer, wallet]);

        // Verify tokens moved to destination
        const destAccount = ctx.requireEncodedAccount(destinationAta);
        const destTokenData = getTokenDecoder().decode(destAccount.data);
        expect(destTokenData.amount).toBe(amount);
    });
});
