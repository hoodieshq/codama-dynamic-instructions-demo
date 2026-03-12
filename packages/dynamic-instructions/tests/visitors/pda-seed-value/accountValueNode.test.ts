import { address, getAddressEncoder } from '@solana/addresses';
import type { InstructionNode } from 'codama';
import { accountValueNode, instructionAccountNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { ixNodeStub, makeVisitor } from './pda-seed-value-test-utils';

const SOME_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

describe('pda-seed-value: visitAccountValue', () => {
    const ixNodeWithAccount: InstructionNode = {
        ...ixNodeStub,
        accounts: [
            instructionAccountNode({
                isSigner: false,
                isWritable: false,
                name: 'authority',
            }),
        ],
    };

    test('should encode provided account address', async () => {
        const visitor = makeVisitor({
            accountsInput: { authority: SOME_ADDRESS },
            ixNode: ixNodeWithAccount,
        });
        const result = await visitor.visitAccountValue(accountValueNode('authority'));
        expect(result).toEqual(getAddressEncoder().encode(address(SOME_ADDRESS)));
    });

    test('should throw for unknown account reference', async () => {
        const visitor = makeVisitor({ ixNode: ixNodeWithAccount });
        await expect(visitor.visitAccountValue(accountValueNode('nonexistent'))).rejects.toThrow(
            /PDA seed references unknown account/,
        );
    });

    test('should throw on circular dependency', async () => {
        const visitor = makeVisitor({
            ixNode: ixNodeWithAccount,
            resolutionPath: ['authority'],
        });
        await expect(visitor.visitAccountValue(accountValueNode('authority'))).rejects.toThrow(
            /Circular dependency detected/,
        );
    });
});
