import { some } from '@solana/codecs';
import { getMintDecoder, getMintSize } from '@solana-program/token-2022';
import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { systemClient, token2022Client } from './token-2022-test-utils';

describe('Token 2022 Program: pausable', () => {
    test('should initialize pausable config extension [initializePausableConfig]', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const mint = ctx.createAccount();
        const pauseAuthority = ctx.createFundedAccount();

        const size = getMintSize([{ __kind: 'PausableConfig', authority: pauseAuthority, paused: false }]);
        const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(size));
        const createAccountIx = await systemClient.methods
            .createAccount({ lamports, programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS, space: size })
            .accounts({ newAccount: mint, payer })
            .instruction();

        const initPausableIx = await token2022Client.methods
            .initializePausableConfig({ authority: pauseAuthority })
            .accounts({ mint })
            .instruction();

        const initMintIx = await token2022Client.methods
            .initializeMint2({ decimals: 9, mintAuthority: payer })
            .accounts({ mint })
            .instruction();

        ctx.sendInstructions([createAccountIx, initPausableIx, initMintIx], [payer, mint]);

        const mintData = getMintDecoder().decode(ctx.requireEncodedAccount(mint).data);
        expect(mintData.mintAuthority).toEqual({ __option: 'Some', value: payer });
        expect(mintData.extensions).toMatchObject(
            some([{ __kind: 'PausableConfig', authority: some(pauseAuthority), paused: false }]),
        );
    });

    test('should pause the mint [pause]', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const mint = ctx.createAccount();
        const pauseAuthority = ctx.createFundedAccount();

        const size = getMintSize([{ __kind: 'PausableConfig', authority: pauseAuthority, paused: false }]);
        const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(size));
        const createAccountIx = await systemClient.methods
            .createAccount({ lamports, programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS, space: size })
            .accounts({ newAccount: mint, payer })
            .instruction();

        const initPausableIx = await token2022Client.methods
            .initializePausableConfig({ authority: pauseAuthority })
            .accounts({ mint })
            .instruction();

        const initMintIx = await token2022Client.methods
            .initializeMint2({ decimals: 9, mintAuthority: payer })
            .accounts({ mint })
            .instruction();

        ctx.sendInstructions([createAccountIx, initPausableIx, initMintIx], [payer, mint]);

        const pauseIx = await token2022Client.methods
            .pause()
            .accounts({ authority: pauseAuthority, mint })
            .instruction();
        ctx.sendInstruction(pauseIx, [payer, pauseAuthority]);

        const mintData = getMintDecoder().decode(ctx.requireEncodedAccount(mint).data);
        expect(mintData.extensions).toMatchObject(
            some([{ __kind: 'PausableConfig', authority: some(pauseAuthority), paused: true }]),
        );
    });

    test('should resume the mint [resume]', async () => {
        const ctx = new SvmTestContext({ defaultPrograms: true });
        const payer = ctx.createFundedAccount();
        const mint = ctx.createAccount();
        const pauseAuthority = ctx.createFundedAccount();

        const size = getMintSize([{ __kind: 'PausableConfig', authority: pauseAuthority, paused: false }]);
        const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(size));
        const createAccountIx = await systemClient.methods
            .createAccount({ lamports, programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS, space: size })
            .accounts({ newAccount: mint, payer })
            .instruction();

        const initPausableIx = await token2022Client.methods
            .initializePausableConfig({ authority: pauseAuthority })
            .accounts({ mint })
            .instruction();

        const initMintIx = await token2022Client.methods
            .initializeMint2({ decimals: 9, mintAuthority: payer })
            .accounts({ mint })
            .instruction();

        ctx.sendInstructions([createAccountIx, initPausableIx, initMintIx], [payer, mint]);

        // Pause first
        const pauseIx = await token2022Client.methods
            .pause()
            .accounts({ authority: pauseAuthority, mint })
            .instruction();
        ctx.sendInstruction(pauseIx, [payer, pauseAuthority]);

        // Resume
        const resumeIx = await token2022Client.methods
            .resume()
            .accounts({ authority: pauseAuthority, mint })
            .instruction();
        ctx.sendInstruction(resumeIx, [payer, pauseAuthority]);

        const mintData = getMintDecoder().decode(ctx.requireEncodedAccount(mint).data);
        expect(mintData.extensions).toMatchObject(
            some([{ __kind: 'PausableConfig', authority: some(pauseAuthority), paused: false }]),
        );
    });
});
