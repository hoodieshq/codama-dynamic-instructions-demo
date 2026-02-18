import path from 'node:path';

import { type Address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import {
    decodeBufferAccount,
    encodeSeedForPda,
    loadPmpProgram,
    PMP_PROGRAM_ID,
    setUpgradeableProgramAccounts,
} from './helpers';

describe('Program Metadata: close', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should close canonical PDA buffer', async () => {
        const authority = ctx.createFundedAccount();
        const destination = ctx.createFundedAccount();
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
        const [bufferPda] = await getProgramDerivedAddress({
            programAddress: PMP_PROGRAM_ID,
            seeds: [addressEncoder.encode(programAddress), seed16Bytes],
        });

        ctx.airdropToAddress(bufferPda, BigInt(10_000_000_000));

        const allocateIx = await programClient.methods
            .allocate({ seed })
            .accounts({
                authority,
                buffer: bufferPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(allocateIx, [authority]);

        const bufferAccount = ctx.requireEncodedAccount(bufferPda);
        expect(bufferAccount).not.toBeNull();

        const destinationBalanceBefore = ctx.getBalanceOrZero(destination);

        const closeIx = await programClient.methods
            .close()
            .accounts({
                account: bufferPda,
                authority,
                destination,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(closeIx, [authority]);

        const closedAccount = ctx.fetchEncodedAccount(bufferPda);
        expect(closedAccount).toBeNull();

        const destinationBalanceAfter = ctx.getBalanceOrZero(destination);
        expect(destinationBalanceAfter).toBeGreaterThan(destinationBalanceBefore);
    });

    test('should close mutable metadata', async () => {
        const authority = ctx.createFundedAccount();
        const destination = ctx.createFundedAccount();
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

        const destinationBalanceBefore = ctx.getBalanceOrZero(destination);

        const closeIx = await programClient.methods
            .close()
            .accounts({
                account: metadataPda,
                authority,
                destination,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(closeIx, [authority]);

        const closedAccount = ctx.fetchEncodedAccount(metadataPda);
        expect(closedAccount).toBeNull();

        const destinationBalanceAfter = ctx.getBalanceOrZero(destination);
        expect(destinationBalanceAfter).toBeGreaterThan(destinationBalanceBefore);
    });

    test('should close keypair buffer', async () => {
        const feePayer = ctx.createFundedAccount();
        const bufferAndAuthority = ctx.createFundedAccount();
        const destination = ctx.createFundedAccount();

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

        const buffer = ctx.requireEncodedAccount(bufferAndAuthority);
        const decoded = decodeBufferAccount(buffer.data);
        expect(decoded.canonical).toBe(false);

        const destinationBalanceBefore = ctx.getBalanceOrZero(destination);

        const closeIx = await programClient.methods
            .close()
            .accounts({
                account: bufferAndAuthority,
                authority: bufferAndAuthority,
                destination,
                program: null,
                programData: null,
            })
            .instruction();

        ctx.sendInstruction(closeIx, [feePayer, bufferAndAuthority]);

        const destinationBalanceAfter = ctx.getBalanceOrZero(destination);
        expect(destinationBalanceAfter).toBeGreaterThan(destinationBalanceBefore);
    });

    test('should fail to close immutable metadata', async () => {
        const authority = ctx.createFundedAccount();
        const destination = ctx.createFundedAccount();
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

        const setImmutableIx = await programClient.methods
            .setImmutable()
            .accounts({
                authority,
                metadata: metadataPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(setImmutableIx, [authority]);

        const closeIx = await programClient.methods
            .close()
            .accounts({
                account: metadataPda,
                authority,
                destination,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        expect(() => ctx.sendInstruction(closeIx, [authority])).toThrow(/Transaction failed/);
    });

    test('should throw AccountError when destination is missing', async () => {
        const authority = ctx.createFundedAccount();

        await expect(
            programClient.methods
                .close()
                .accounts({
                    account: authority,
                    authority,
                    destination: undefined as unknown as Address,
                    program: null,
                    programData: null,
                })
                .instruction(),
        ).rejects.toThrow(/Missing required account: destination/);
    });
});
