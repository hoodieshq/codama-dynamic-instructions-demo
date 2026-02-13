import { AccountDiscriminator } from '@solana-program/program-metadata';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import { decodeBufferAccount, loadPmpProgram } from './helpers';

describe('Program Metadata: write', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should write inline data to buffer', async () => {
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

        const testData = new TextEncoder().encode('Hello, PMP!');
        const writeIx = await programClient.methods
            .write({ data: testData, offset: 0 })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                sourceBuffer: null,
            })
            .instruction();

        ctx.sendInstructions([allocateIx, writeIx], [bufferAndAuthority]);

        const account = ctx.requireEncodedAccount(bufferAndAuthority);
        const buffer = decodeBufferAccount(account.data);

        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);
        expect(buffer.canonical).toBe(false);

        const writtenData = buffer.data.slice(0, testData.length);
        expect(writtenData).toEqual(testData);
    });

    test('should write data at offset', async () => {
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

        const dataA = new TextEncoder().encode('AAAA');
        const writeIxA = await programClient.methods
            .write({ data: dataA, offset: 0 })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                sourceBuffer: null,
            })
            .instruction();

        const dataB = new TextEncoder().encode('BBBB');
        const dataBoffset = 10;
        const writeIxB = await programClient.methods
            .write({ data: dataB, offset: dataBoffset })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                sourceBuffer: null,
            })
            .instruction();

        ctx.sendInstructions([allocateIx, writeIxA, writeIxB], [bufferAndAuthority]);

        const account = ctx.requireEncodedAccount(bufferAndAuthority);
        const buffer = decodeBufferAccount(account.data);

        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);

        const writtenDataA = buffer.data.slice(0, dataA.length);
        expect(writtenDataA).toEqual(dataA);

        const writtenDataB = buffer.data.slice(dataBoffset, dataBoffset + dataB.length);
        expect(writtenDataB).toEqual(dataB);

        const untouchedBytes = buffer.data.slice(dataA.length, dataBoffset);
        expect(untouchedBytes).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0]));
    });

    test('should write data in chunks', async () => {
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

        const chunk1 = new TextEncoder().encode('Hello');
        const writeIx1 = await programClient.methods
            .write({ data: chunk1, offset: 0 })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                sourceBuffer: null,
            })
            .instruction();

        // Write chunk 2: "World" at offset 5
        const chunk2 = new TextEncoder().encode('World');
        const chunk2Offset = chunk1.length;
        const writeIx2 = await programClient.methods
            .write({ data: chunk2, offset: chunk2Offset })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                sourceBuffer: null,
            })
            .instruction();

        ctx.sendInstructions([allocateIx, writeIx1, writeIx2], [bufferAndAuthority]);

        const account = ctx.requireEncodedAccount(bufferAndAuthority);
        const buffer = decodeBufferAccount(account.data);

        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);

        const combinedData = buffer.data.slice(0, chunk1.length + chunk2.length);
        const expectedData = new TextEncoder().encode('HelloWorld');
        expect(combinedData).toEqual(expectedData);

        const resultString = new TextDecoder().decode(combinedData);
        expect(resultString).toBe('HelloWorld');
    });
});
