import path from 'node:path';

import { type Address, getAddressEncoder, getProgramDerivedAddress } from '@solana/addresses';
import type { Some } from '@solana/codecs';
import { beforeEach, describe, expect, test } from 'vitest';

import type { ProgramMetadataProgramClient } from '../generated/pmp-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';
import { decodeMetadataAccount, encodeSeedForPda, loadPmpProgram, setUpgradeableProgramAccounts } from './helpers';

describe('Program Metadata: setAuthority', () => {
    const programClient = createTestProgramClient<ProgramMetadataProgramClient>('pmp-idl.json');
    const exampleProgramPath = path.join(__dirname, '../dumps/pmp.so');
    const PMP_PROGRAM_ID = programClient.programAddress;
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        loadPmpProgram(ctx, programClient.programAddress);
    });

    test('should set new authority on canonical metadata', async () => {
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
        expect(metadataBefore.authority).toEqual({ __option: 'None' });
        expect(metadataBefore.canonical).toBe(true);

        // Set new authority
        const newAuthority = ctx.createAccount();
        const expectedAccounts = [metadataPda, authority, programAddress, programDataAddress];
        const setAuthorityIx = await programClient.methods
            .setAuthority({ newAuthority })
            .accounts({
                account: metadataPda,
                authority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        expect(setAuthorityIx.accounts?.length).toBe(4);
        setAuthorityIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(setAuthorityIx, [authority]);
        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);
        expect((metadataAfter.authority as Some<Address>).value).toBe(newAuthority);
    });

    test('should remove authority from canonical metadata', async () => {
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

        // Set authority
        const someAuthority = ctx.createAccount();
        const setAuthorityIx = await programClient.methods
            .setAuthority({ newAuthority: someAuthority })
            .accounts({
                account: metadataPda,
                authority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        ctx.sendInstruction(setAuthorityIx, [authority]);
        const accountWithAuthority = ctx.requireEncodedAccount(metadataPda);
        const metadataWithAuthority = decodeMetadataAccount(accountWithAuthority.data);
        expect((metadataWithAuthority.authority as Some<Address>).value).toBe(someAuthority);

        // Remove the authority
        const expectedAccounts = [metadataPda, authority, programAddress, programDataAddress];
        const removeAuthorityIx = await programClient.methods
            .setAuthority({ newAuthority: null })
            .accounts({
                account: metadataPda,
                authority,
                program: programAddress,
                programData: programDataAddress,
            })
            .instruction();

        expect(removeAuthorityIx.accounts?.length).toBe(4);
        removeAuthorityIx.accounts?.forEach((ixAccount, i) => {
            expect(expectedAccounts[i], `Invalid account: [${i}]`).toBe(ixAccount.address);
        });

        ctx.sendInstruction(removeAuthorityIx, [authority]);
        const accountAfter = ctx.requireEncodedAccount(metadataPda);
        const metadataAfter = decodeMetadataAccount(accountAfter.data);
        expect(metadataAfter.authority).toEqual({ __option: 'None' });
    });
});
