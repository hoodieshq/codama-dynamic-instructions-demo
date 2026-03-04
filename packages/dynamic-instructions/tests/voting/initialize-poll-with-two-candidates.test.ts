import { type Address, getProgramDerivedAddress } from '@solana/addresses';
import { getU64Encoder } from '@solana/codecs';
import { beforeEach, describe, expect, test } from 'vitest';

import { SvmTestContext } from '../test-utils';
import { createTestContext, decodePollAccount, programClient } from './helpers';

describe('voting: initializePollWithTwoCandidates', () => {
    let ctx: SvmTestContext;
    let payer: Address;

    beforeEach(() => {
        ({ ctx, payer } = createTestContext());
    });

    test('should build instruction with correct accounts and data', async () => {
        const ix = await programClient.methods
            .initializePollWithTwoCandidates({
                candidates: ['Alice', 'Bob'],
                description: 'Test poll',
                pollEnd: 1000,
                pollId: 1,
                pollStart: 0,
            })
            .accounts({ signer: payer })
            .instruction();

        expect(ix.accounts).toBeDefined();
        expect(ix.accounts?.length).toBe(3);

        // signer
        expect(ix.accounts![0]!.address).toBe(payer);
        expect(ix.accounts![1]!.address).toBe(ctx.SYSTEM_PROGRAM_ADDRESS);

        const [expectedPda] = await getProgramDerivedAddress({
            programAddress: programClient.programAddress,
            seeds: [getU64Encoder().encode(1)],
        });
        expect(ix.accounts![2]!.address).toBe(expectedPda);
    });

    test('should execute instruction and create poll account on-chain', async () => {
        const ix = await programClient.methods
            .initializePollWithTwoCandidates({
                candidates: ['Alice', 'Bob'],
                description: 'Test poll',
                pollEnd: 1000,
                pollId: 1,
                pollStart: 0,
            })
            .accounts({ signer: payer })
            .instruction();

        ctx.sendInstruction(ix, [payer]);

        const [pollPda] = await getProgramDerivedAddress({
            programAddress: programClient.programAddress,
            seeds: [getU64Encoder().encode(1)],
        });

        const account = ctx.requireEncodedAccount(pollPda);
        expect(account.owner).toBe(programClient.programAddress);

        const decoded = decodePollAccount(programClient.root, account.data);
        expect(decoded.pollId).toBe(1n);
        expect(decoded.description).toBe('Test poll');
        expect(decoded.pollStart).toBe(0n);
        expect(decoded.pollEnd).toBe(1000n);
        expect(decoded.candidateAmount).toBe(0n);
        expect(decoded.allowedCandidates).not.toBeNull();
        expect(decoded.allowedCandidates!.map(c => c.name)).toEqual(['Alice', 'Bob']);
    });

    test('should throw validation error for indalid argument', async () => {
        await expect(
            programClient.methods
                .initializePollWithTwoCandidates({
                    candidates: ['Alice', undefined as unknown as string],
                    description: 'Test poll',
                    pollEnd: 1000,
                    pollId: 1,
                    pollStart: 0,
                })
                .accounts({ signer: payer })
                .instruction(),
        ).rejects.toThrowError(/Invalid argument "candidates\[1\]", value: undefined. Expected a string/);

        await expect(
            programClient.methods
                .initializePollWithTwoCandidates({
                    candidates: undefined as unknown as string[],
                    description: 'Test poll',
                    pollEnd: 1000,
                    pollId: 1,
                    pollStart: 0,
                })
                .accounts({ signer: payer })
                .instruction(),
        ).rejects.toThrowError(/Invalid argument "candidates", value: undefined. Expected an array value/);

        await expect(
            programClient.methods
                .initializePollWithTwoCandidates({
                    candidates: [],
                    description: 'Test poll',
                    pollEnd: 1000,
                    pollId: 1,
                    pollStart: 0,
                })
                .accounts({ signer: payer })
                .instruction(),
        ).rejects.toThrowError(/Invalid argument "candidates", value: \[\]. Expected a array with a length of `2`/);

        await expect(
            programClient.methods
                .initializePollWithTwoCandidates({
                    candidates: ['a', 'b'],
                    description: 300n as unknown as string,
                    pollEnd: 1000,
                    pollId: 1,
                    pollStart: 0,
                })
                .accounts({ signer: payer })
                .instruction(),
        ).rejects.toThrowError(/Invalid argument "description", value: 300. Expected a string/);

        await expect(
            programClient.methods
                .initializePollWithTwoCandidates({
                    candidates: ['a', 'b'],
                    description: 'description',
                    pollEnd: 1000,
                    pollId: 1,
                    pollStart: 'start' as unknown as bigint,
                })
                .accounts({ signer: payer })
                .instruction(),
        ).rejects.toThrowError(/Invalid argument "pollStart", value: start. Expected a number or bigint/);
    });
});
