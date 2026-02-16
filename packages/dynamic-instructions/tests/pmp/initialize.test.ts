import path from 'node:path';

import { type Address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import type { Some } from '@solana/codecs';
import { AccountDiscriminator, Compression, DataSource, Encoding, Format } from '@solana-program/program-metadata';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import {
    decodeBufferAccount,
    decodeMetadataAccount,
    encodeSeedForPda,
    loadPmpProgram,
    PMP_PROGRAM_ID,
    setUpgradeableProgramAccounts,
} from './helpers';

describe('Program Metadata: initialize', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should initialize canonical metadata with direct data (ifTrue condition branch)', async () => {
        const authority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();
        const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');

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

        const expectedAccounts = [
            metadataPda,
            authority,
            programAddress,
            programDataAddress,
            ctx.SYSTEM_PROGRAM_ADDRESS,
        ];

        const ix = await programClient.methods
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

        expect(ix.accounts?.length).toBe(5);
        ix.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(ix, [authority]);

        const account = ctx.requireEncodedAccount(metadataPda);
        expect(account.owner).toBe(PMP_PROGRAM_ID);

        const metadata = decodeMetadataAccount(account.data);
        expect(metadata.canonical).toBe(true);
        expect(metadata.program).toBe(programAddress);
        // Canonical metadata stores authority as zero (None)
        expect(metadata.authority).toEqual({ __option: 'None' });
        expect(metadata.seed).toBe(seed);

        const writtenData = metadata.data.slice(0, testData.length);
        expect(writtenData).toEqual(testData);
    });

    test('should initialize non-canonical metadata (ifFalse condition branch)', async () => {
        const authority = ctx.createFundedAccount();
        const programDataAuthority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();
        const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');

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

        const expectedAccounts = [
            metadataPda,
            authority,
            programAddress,
            PMP_PROGRAM_ID, // with "programId" optionalAccountStrategy address is resolved to root.programId
            ctx.SYSTEM_PROGRAM_ADDRESS,
        ];

        const ix = await programClient.methods
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
                programData: null, // this should use ifFalse branch in conditionalValueNode
            })
            .instruction();

        expect(ix.accounts?.length).toBe(5);
        ix.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(ix, [authority]);

        const account = ctx.requireEncodedAccount(metadataPda);
        expect(account.owner).toBe(PMP_PROGRAM_ID);

        const metadata = decodeMetadataAccount(account.data);
        expect(metadata.discriminator).toBe(AccountDiscriminator.Metadata);
        expect(metadata.canonical).toBe(false);
        expect(metadata.program).toBe(programAddress);
        expect((metadata.authority as Some<Address>).value).toBe(authority);
        expect(metadata.seed).toBe(seed);

        const writtenData = metadata.data.slice(0, testData.length);
        expect(writtenData).toEqual(testData);
    });

    test('should initialize metadata from pre-allocated buffer', async () => {
        const authority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();
        const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');

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

        // Allocate the metadata PDA as a canonical buffer
        const allocateIx = await programClient.methods
            .allocate({ seed })
            .accounts({
                authority,
                buffer: metadataPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        // Write data to the buffer at the metadata PDA address
        const testData = new TextEncoder().encode('{"from":"buffer"}');
        const writeIx = await programClient.methods
            .write({ data: testData, offset: 0 })
            .accounts({
                authority,
                buffer: metadataPda,
                sourceBuffer: null,
            })
            .instruction();

        ctx.sendInstructions([allocateIx, writeIx], [authority]);

        // Verify the buffer was written at the metadata PDA
        const bufferAccount = ctx.requireEncodedAccount(metadataPda);
        const buffer = decodeBufferAccount(bufferAccount.data);
        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);

        // Now initialize — the program sees the Buffer discriminator and uses existing data
        const initializeIx = await programClient.methods
            .initialize({
                compression: 'none',
                data: null,
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

        ctx.sendInstruction(initializeIx, [authority]);

        const account = ctx.requireEncodedAccount(metadataPda);
        expect(account.owner).toBe(PMP_PROGRAM_ID);

        const metadata = decodeMetadataAccount(account.data);
        expect(metadata.discriminator).toBe(AccountDiscriminator.Metadata);
        expect(metadata.canonical).toBe(true);
        expect(metadata.program).toBe(programAddress);
        expect(metadata.authority).toEqual({ __option: 'None' });
        const writtenData = metadata.data.slice(0, testData.length);
        expect(writtenData).toEqual(testData);
    });

    test('should initialize with different encoding and format', async () => {
        const authority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();
        const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');

        const { programAddress, programDataAddress } = await setUpgradeableProgramAccounts(
            ctx,
            exampleProgramPath,
            testProgramAddress,
            authority,
        );

        const seed = 'config';
        const seed16Bytes = encodeSeedForPda(seed);
        const addressEncoder = getAddressEncoder();
        const [metadataPda] = await getProgramDerivedAddress({
            programAddress: PMP_PROGRAM_ID,
            seeds: [addressEncoder.encode(programAddress), seed16Bytes],
        });

        ctx.airdropToAddress(metadataPda, BigInt(10_000_000_000));

        const testData = new TextEncoder().encode('dG9tbCBkYXRh');

        const ix = await programClient.methods
            .initialize({
                compression: 'zlib',
                data: testData,
                dataSource: 'url',
                encoding: 'base64',
                format: 'toml',
                seed,
            })
            .accounts({
                authority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(ix, [authority]);

        const account = ctx.requireEncodedAccount(metadataPda);
        expect(account.owner).toBe(PMP_PROGRAM_ID);

        const metadata = decodeMetadataAccount(account.data);
        expect(metadata.discriminator).toBe(AccountDiscriminator.Metadata);
        expect(metadata.canonical).toBe(true);
        expect(metadata.encoding).toBe(Encoding.Base64);
        expect(metadata.compression).toBe(Compression.Zlib);
        expect(metadata.format).toBe(Format.Toml);
        expect(metadata.dataSource).toBe(DataSource.Url);

        const writtenData = metadata.data.slice(0, testData.length);
        expect(writtenData).toEqual(testData);
    });
});
