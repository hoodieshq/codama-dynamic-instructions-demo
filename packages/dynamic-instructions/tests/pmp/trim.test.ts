import path from 'node:path';

import { getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import {
    decodeMetadataAccount,
    encodeSeedForPda,
    loadPmpProgram,
    PMP_PROGRAM_ID,
    setUpgradeableProgramAccounts,
} from './helpers';

describe('Program Metadata: trim', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext({ defaultPrograms: true, sysvars: true });
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should trim metadata to reduced size', async () => {
        const authority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();
        const destination = ctx.createAccount();

        const { programAddress, programDataAddress } = await setUpgradeableProgramAccounts(
            ctx,
            exampleProgramPath,
            testProgramAddress,
            authority,
        );

        const seed = 'idl';
        const seed16Bytes = encodeSeedForPda(seed);
        const addressEncoder = getAddressEncoder();
        const [metadataPda] = await getProgramDerivedAddress({
            programAddress: PMP_PROGRAM_ID,
            seeds: [addressEncoder.encode(programAddress), seed16Bytes],
        });

        ctx.airdropToAddress(metadataPda, BigInt(10_000_000_000));

        const testData = new TextEncoder().encode('x'.repeat(200));
        const initIx = await programClient.methods
            .initialize({
                compression: 'none',
                data: testData,
                dataSource: 'direct',
                encoding: 'utf8',
                format: 'json',
                seed,
            })
            .accounts({
                authority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();
        ctx.sendInstruction(initIx, [authority]);

        const reducedData = new TextEncoder().encode('x'.repeat(100));
        const setDataIx = await programClient.methods
            .setData({
                compression: 'none',
                data: reducedData,
                dataSource: 'direct',
                encoding: 'utf8',
                format: 'json',
            })
            .accounts({
                authority,
                buffer: null,
                metadata: metadataPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();
        ctx.sendInstruction(setDataIx, [authority]);

        const balanceBefore = ctx.getBalanceOrZero(destination);
        expect(balanceBefore).toBe(0n);

        const expectedAccounts = [
            metadataPda,
            authority,
            programAddress,
            programDataAddress,
            destination,
            ctx.SYSVAR_RENT_ADDRESS,
        ];

        const trimIx = await programClient.methods
            .trim()
            .accounts({
                account: metadataPda,
                authority,
                destination,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();
        expect(trimIx.accounts?.length).toBe(6);
        trimIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });
        ctx.sendInstruction(trimIx, [authority]);

        const account = ctx.requireEncodedAccount(metadataPda);
        const metadata = decodeMetadataAccount(account.data);
        expect(metadata.data).toEqual(reducedData);

        const balanceAfter = ctx.getBalanceOrZero(destination);
        expect(balanceAfter).toBeGreaterThan(0n);
    });
});
