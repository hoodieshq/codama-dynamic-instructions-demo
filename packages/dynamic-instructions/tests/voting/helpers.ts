import path from 'node:path';

import { getNodeCodec } from '@codama/dynamic-codecs';
import type { Option } from '@solana/codecs';
import { unwrapOption } from '@solana/codecs';
import type { RootNode } from 'codama';

import type { VotingProgramClient } from '../generated/codama-voting-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

export const programClient = createTestProgramClient<VotingProgramClient>('codama-voting-idl.json');

export function createTestContext() {
    const ctx = new SvmTestContext({ defaultPrograms: true });
    ctx.loadProgram(programClient.programAddress, path.resolve(__dirname, '..', 'dumps', 'voting.so'));
    const payer = ctx.createFundedAccount();

    return { ctx, payer };
}

export function decodePollAccount(
    root: RootNode,
    data: Uint8Array,
): {
    allowedCandidates: Array<{ name: string }> | null;
    candidateAmount: bigint;
    description: string;
    pollEnd: bigint;
    pollId: bigint;
    pollStart: bigint;
} {
    const accountNode = root.program.accounts.find(a => a.name === 'poll');
    if (!accountNode) {
        throw new Error('Could not find account node "poll" in IDL');
    }

    const codec = getNodeCodec([root, root.program, accountNode]);
    const decoded = codec.decode(Uint8Array.from(data)) as {
        allowedCandidates: Option<Array<{ name: string }>>;
        candidateAmount: bigint;
        description: string;
        pollEnd: bigint;
        pollId: bigint;
        pollStart: bigint;
    };

    return {
        allowedCandidates: unwrapOption(decoded.allowedCandidates),
        candidateAmount: decoded.candidateAmount,
        description: decoded.description,
        pollEnd: decoded.pollEnd,
        pollId: decoded.pollId,
        pollStart: decoded.pollStart,
    };
}
