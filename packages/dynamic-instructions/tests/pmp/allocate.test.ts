import path from 'node:path';

import { type Address } from '@solana/addresses';
import type { Some } from '@solana/codecs';
import { AccountDiscriminator } from '@solana-program/program-metadata';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import { decodeBufferAccount, encodeSeedForPda, loadPmpProgram, setUpgradeableProgramAccounts } from './helpers';

describe('Program Metadata: allocate', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should allocate with seed null', async () => {
        const bufferAndAuthority = ctx.createFundedAccount();

        const ix = await programClient.methods
            .allocate({ seed: null })
            .accounts({
                authority: bufferAndAuthority,
                buffer: bufferAndAuthority,
                program: null,
                programData: null,
            })
            .instruction();

        ctx.sendInstruction(ix, [bufferAndAuthority]);

        const account = ctx.requireEncodedAccount(bufferAndAuthority);

        const buffer = decodeBufferAccount(account.data);
        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);
        expect(buffer.canonical).toBe(false);
        expect(buffer.program).toEqual({ __option: 'None' });
        expect((buffer.authority as Some<Address>).value).toBe(bufferAndAuthority);
    });

    test('should allocate canonical PDA buffer', async () => {
        // CANONICAL scenario: authority == ProgramData.upgrade_authority
        const authority = ctx.createFundedAccount();
        const testProgramAddress = ctx.createAccount();
        const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');

        const { programAddress, programDataAddress } = setUpgradeableProgramAccounts(
            ctx,
            exampleProgramPath,
            testProgramAddress,
            authority,
        );

        // Canonical seeds [program, seed] padded 16 bytes
        const seed = 'idl';
        const seed16Bytes = encodeSeedForPda(seed);
        const bufferPda = ctx.findProgramAddress(
            [
                { type: 'address', value: programAddress },
                { type: 'bytes', value: seed16Bytes },
            ],
            programClient.programAddress,
        );

        ctx.airdropToAddress(bufferPda, BigInt(10_000_000_000));
        const ix = await programClient.methods
            .allocate({ seed })
            .accounts({
                authority,
                buffer: bufferPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(ix, [authority]);

        const account = ctx.requireEncodedAccount(bufferPda);
        expect(account.owner).toBe(programClient.programAddress);
        expect(account.data.length).gt(0);

        const buffer = decodeBufferAccount(account.data);
        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);
        expect(buffer.canonical).toBe(true);
        expect(buffer.program).toEqual({ __option: 'Some', value: programAddress });
        expect(buffer.authority).toEqual({ __option: 'Some', value: authority });
        expect(buffer.seed).toBe(seed);
    });

    test('should allocate non-canonical PDA buffer', async () => {
        // NON-CANONICAL scenario: authority != ProgramData.upgrade_authority
        const authority = ctx.createFundedAccount();
        const programDataAuthority = ctx.createFundedAccount();

        const testProgramAddress = ctx.createAccount();
        const exampleProgramPath = path.join(__dirname, '../anchor/target/deploy/example.so'); // this can be any program

        const { programAddress, programDataAddress } = setUpgradeableProgramAccounts(
            ctx,
            exampleProgramPath,
            testProgramAddress,
            programDataAuthority,
        );

        // non-canonical seeds [program, authority, seed], padded to 16 bytes
        const seed = 'idl';
        const seed16Bytes = encodeSeedForPda(seed);
        const bufferPda = ctx.findProgramAddress(
            [
                { type: 'address', value: programAddress },
                { type: 'address', value: authority },
                { type: 'bytes', value: seed16Bytes },
            ],
            programClient.programAddress,
        );

        ctx.airdropToAddress(bufferPda, BigInt(10_000_000_000));
        const ix = await programClient.methods
            .allocate({ seed })
            .accounts({
                authority,
                buffer: bufferPda,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(ix, [authority]);

        const account = ctx.requireEncodedAccount(bufferPda);
        expect(account.owner).toBe(programClient.programAddress);
        expect(account.data.length).gt(0);

        const buffer = decodeBufferAccount(account.data);
        expect(buffer.discriminator).toBe(AccountDiscriminator.Buffer);
        expect(buffer.canonical).toBe(false);
        expect(buffer.program).toEqual({ __option: 'Some', value: programAddress });
        expect(buffer.authority).toEqual({ __option: 'Some', value: authority });
        expect(buffer.seed).toBe(seed);
    });
});
