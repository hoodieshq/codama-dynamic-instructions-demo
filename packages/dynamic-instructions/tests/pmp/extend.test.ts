import path from 'node:path';

import { type Address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
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

describe('Program Metadata: extend', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should extend buffer capacity', async () => {
        const feePayer = ctx.createFundedAccount();
        const bufferAndAuthority = ctx.createFundedAccount();

        const allocateIx = await programClient.methods
            .allocate({ seed: null })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                program: null,
                programData: null,
            })
            .instruction();

        ctx.sendInstruction(allocateIx, [bufferAndAuthority]);

        const accountBefore = ctx.requireEncodedAccount(bufferAndAuthority);
        const sizeBefore = accountBefore.data.length;

        const extendLength = 500;
        const extendIx = await programClient.methods
            .extend({ length: extendLength })
            .accounts({
                account: bufferAndAuthority,
                authority: bufferAndAuthority,
                program: null,
                programData: null,
            })
            .instruction();

        ctx.sendInstruction(extendIx, [feePayer, bufferAndAuthority]);

        const accountAfter = ctx.requireEncodedAccount(bufferAndAuthority);
        expect(accountAfter.data.length).toBe(sizeBefore + extendLength);
    });

    test('should extend canonical metadata capacity', async () => {
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
        const sizeBefore = accountBefore.data.length;

        const extendLength = 500;
        const extendIx = await programClient.methods
            .extend({ length: extendLength })
            .accounts({
                account: metadataPda,
                authority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(extendIx, [authority]);

        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        expect(accountAfter.data.length).toBe(sizeBefore + extendLength);

        const metadata = decodeMetadataAccount(accountAfter.data);
        expect(metadata.canonical).toBe(true);
    });

    test('should fail to extend with wrong authority', async () => {
        const authority = ctx.createFundedAccount();
        const wrongAuthority = ctx.createFundedAccount();
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

        const extendIx = await programClient.methods
            .extend({ length: 500 })
            .accounts({
                account: metadataPda,
                authority: wrongAuthority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        expect(() => ctx.sendInstruction(extendIx, [wrongAuthority])).toThrow(/Transaction failed/);
    });

    test('should throw ArgumentError when length argument is missing', async () => {
        const authority = ctx.createFundedAccount();

        await expect(
            programClient.methods
                .extend({ length: undefined as unknown as number })
                .accounts({
                    account: authority,
                    authority,
                    program: null,
                    programData: null,
                })
                .instruction(),
        ).rejects.toThrow(/Invalid argument "length", "value": undefined/);
    });

    test('should throw AccountError when required account is missing', async () => {
        await expect(
            programClient.methods
                .extend({ length: 100 })
                .accounts({
                    account: undefined as unknown as Address,
                    authority: undefined as unknown as Address,
                    program: null,
                    programData: null,
                })
                .instruction(),
        ).rejects.toThrow(/Missing required account: account/);
    });
});
