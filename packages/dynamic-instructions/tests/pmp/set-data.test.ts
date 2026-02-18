import path from 'node:path';

import { type Address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import type { Some } from '@solana/codecs';
import { Compression, DataSource, Encoding, Format } from '@solana-program/program-metadata';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import { decodeMetadataAccount, encodeSeedForPda, loadPmpProgram, setUpgradeableProgramAccounts } from './helpers';

describe('Program Metadata: setData', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');
    const PMP_PROGRAM_ID = programClient.programAddress;
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should update canonical metadata with inline data', async () => {
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

        const initialData = new TextEncoder().encode('{"name":"initial"}');
        const initIx = await programClient.methods
            .initialize({
                compression: 'none',
                data: initialData,
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

        // Verify initial state
        const accountBefore = ctx.requireEncodedAccount(metadataPda);
        const metadataBefore = decodeMetadataAccount(accountBefore.data);
        expect(metadataBefore.encoding).toBe(Encoding.Utf8);
        expect(metadataBefore.format).toBe(Format.Json);

        // Update metadata with new data and properties
        const newData = new TextEncoder().encode('{"name":"updated"}');
        const expectedAccounts = [metadataPda, authority, PMP_PROGRAM_ID, programAddress, programDataAddress];

        const setDataIx = await programClient.methods
            .setData({
                compression: 'zlib',
                data: newData,
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

        expect(setDataIx.accounts?.length).toBe(5);
        setDataIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(setDataIx, [authority]);

        // Verify metadata updated
        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);

        const writtenData = metadataAfter.data.slice(0, newData.length);
        expect(writtenData).toEqual(newData);
        expect(metadataAfter.encoding).toBe(Encoding.Utf8);
        expect(metadataAfter.compression).toBe(Compression.Zlib);
        expect(metadataAfter.format).toBe(Format.Json);
        expect(metadataAfter.dataSource).toBe(DataSource.Direct);

        // Unchanged fields
        expect(metadataAfter.canonical).toBe(true);
        expect(metadataAfter.program).toBe(programAddress);
        expect(metadataAfter.authority).toEqual({ __option: 'None' });
        expect(metadataAfter.seed).toBe(seed);
        expect(metadataAfter.mutable).toBe(true);
    });

    test('should update canonical metadata from buffer', async () => {
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

        const initialData = new TextEncoder().encode('{"name":"initial"}');
        const initIx = await programClient.methods
            .initialize({
                compression: 'none',
                data: initialData,
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

        const bufferAndAuthority = ctx.createFundedAccount();
        const allocateBufferIx = await programClient.methods
            .allocate({ seed: null })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                program: null,
                programData: null,
            })
            .instruction();

        const bufferData = new TextEncoder().encode('{"from":"buffer"}');
        const writeBufferIx = await programClient.methods
            .write({ data: bufferData, offset: 0 })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                sourceBuffer: null,
            })
            .instruction();

        ctx.sendInstructions([allocateBufferIx, writeBufferIx], [bufferAndAuthority]);

        // Update metadata from buffer
        const expectedAccounts = [metadataPda, authority, bufferAndAuthority, programAddress, programDataAddress];

        const setDataIx = await programClient.methods
            .setData({
                compression: 'none',
                data: null,
                dataSource: 'direct',
                encoding: 'utf8',
                format: 'json',
            })
            .accounts({
                authority,
                buffer: bufferAndAuthority,
                metadata: metadataPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        expect(setDataIx.accounts?.length).toBe(5);
        setDataIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(setDataIx, [authority]);

        // Verify metadata data matches buffer
        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);

        const writtenData = metadataAfter.data.slice(0, bufferData.length);
        expect(writtenData).toEqual(bufferData);
    });

    test('should update non-canonical metadata with inline data', async () => {
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

        const initialData = new TextEncoder().encode('non-canonical initial');
        const initIx = await programClient.methods
            .initialize({
                compression: 'none',
                data: initialData,
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

        // Verify non-canonical
        const accountBefore = ctx.requireEncodedAccount(metadataPda);
        const metadataBefore = decodeMetadataAccount(accountBefore.data);
        expect(metadataBefore.canonical).toBe(false);
        expect((metadataBefore.authority as Some<Address>).value).toBe(authority);

        // Update non-canonical metadata
        const newData = new TextEncoder().encode('non-canonical updated');
        const expectedAccounts = [metadataPda, authority, PMP_PROGRAM_ID, programAddress, PMP_PROGRAM_ID];

        const setDataIx = await programClient.methods
            .setData({
                compression: 'gzip',
                data: newData,
                dataSource: 'direct',
                encoding: 'utf8',
                format: 'json',
            })
            .accounts({
                authority,
                buffer: null,
                metadata: metadataPda,
                program: programAddress,
                programData: null,
            })
            .instruction();

        expect(setDataIx.accounts?.length).toBe(5);
        setDataIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(setDataIx, [authority]);

        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);

        const writtenData = metadataAfter.data.slice(0, newData.length);
        expect(writtenData).toEqual(newData);
        expect(metadataAfter.encoding).toBe(Encoding.Utf8);
        expect(metadataAfter.compression).toBe(Compression.Gzip);
        expect(metadataAfter.format).toBe(Format.Json);
        expect(metadataAfter.dataSource).toBe(DataSource.Direct);
        expect((metadataAfter.authority as Some<Address>).value).toBe(authority);
    });
});
