import path from 'node:path';

import { type Address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import type { Some } from '@solana/codecs';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import { decodeMetadataAccount, encodeSeedForPda, loadPmpProgram, setUpgradeableProgramAccounts } from './helpers';

describe('Program Metadata: setImmutable', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');
    const PMP_PROGRAM_ID = programClient.programAddress;
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should make canonical metadata immutable', async () => {
        const authority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();

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

        const testData = new TextEncoder().encode('{"name":"test"}');
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

        const accountBefore = ctx.requireEncodedAccount(metadataPda);
        const metadataBefore = decodeMetadataAccount(accountBefore.data);
        expect(metadataBefore.mutable).toBe(true);
        expect(metadataBefore.canonical).toBe(true);

        // Make immutable
        const expectedAccounts = [metadataPda, authority, programAddress, programDataAddress];

        const setImmutableIx = await programClient.methods
            .setImmutable()
            .accounts({
                authority,
                metadata: metadataPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        expect(setImmutableIx.accounts?.length).toBe(4);
        setImmutableIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(setImmutableIx, [authority]);

        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);
        expect(metadataAfter.mutable).toBe(false);
    });

    test('should make non-canonical metadata immutable', async () => {
        const authority = ctx.createFundedAccount();
        const programDataAuthority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();

        const { programAddress } = await setUpgradeableProgramAccounts(
            ctx,
            exampleProgramPath,
            testProgramAddress,
            programDataAuthority,
        );

        const seed = 'idl';
        const seed16Bytes = encodeSeedForPda(seed);
        const addressEncoder = getAddressEncoder();
        const [metadataPda] = await getProgramDerivedAddress({
            programAddress: PMP_PROGRAM_ID,
            seeds: [addressEncoder.encode(programAddress), addressEncoder.encode(authority), seed16Bytes],
        });

        ctx.airdropToAddress(metadataPda, BigInt(10_000_000_000));

        const testData = new TextEncoder().encode('non-canonical data');
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
                programData: null,
            })
            .instruction();

        ctx.sendInstruction(initIx, [authority]);

        // Verify non-canonical and mutable
        const accountBefore = ctx.requireEncodedAccount(metadataPda);
        const metadataBefore = decodeMetadataAccount(accountBefore.data);
        expect(metadataBefore.canonical).toBe(false);
        expect(metadataBefore.mutable).toBe(true);
        expect((metadataBefore.authority as Some<Address>).value).toBe(authority);

        // Make immutable
        const expectedAccounts = [metadataPda, authority, PMP_PROGRAM_ID, PMP_PROGRAM_ID];

        const setImmutableIx = await programClient.methods
            .setImmutable()
            .accounts({
                authority,
                metadata: metadataPda,
                program: null,
                programData: null,
            })
            .instruction();

        expect(setImmutableIx.accounts?.length).toBe(4);
        setImmutableIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(setImmutableIx, [authority]);

        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);
        expect(metadataAfter.mutable).toBe(false);
        expect(metadataAfter.canonical).toBe(false);
        expect((metadataAfter.authority as Some<Address>).value).toBe(authority);
    });
});
