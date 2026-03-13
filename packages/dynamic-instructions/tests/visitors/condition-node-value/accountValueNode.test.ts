import type { InstructionNode } from 'codama';
import { accountValueNode, camelCase, instructionAccountNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../../svm-test-context';
import { makeVisitor } from './condition-node-value-test-utils';

describe('condition-node-value: visitAccountValue', () => {
    const ixNodeWithAccount: InstructionNode = {
        accounts: [
            instructionAccountNode({
                isOptional: true,
                isSigner: false,
                isWritable: false,
                name: 'myAccount',
            }),
        ],
        arguments: [],
        docs: [],
        kind: 'instructionNode',
        name: camelCase('test_instruction'),
    };

    test('should return null when user provides null', async () => {
        const visitor = makeVisitor({
            accountsInput: { myAccount: null },
            ixNode: ixNodeWithAccount,
        });
        const result = await visitor.visitAccountValue(accountValueNode('myAccount'));
        expect(result).toBeNull();
    });

    test('should return address when user provides address', async () => {
        const accAddress = SvmTestContext.generateAddress();
        const visitor = makeVisitor({
            accountsInput: { myAccount: accAddress },
            ixNode: ixNodeWithAccount,
        });
        const result = await visitor.visitAccountValue(accountValueNode('myAccount'));
        expect(result).toBe(accAddress);
    });

    test('should throw for unknown account reference', async () => {
        const visitor = makeVisitor();
        await expect(visitor.visitAccountValue(accountValueNode('unknown'))).rejects.toThrow(
            /Referenced account "unknown" not found in instruction "testInstruction"/,
        );
    });

    test('should throw on circular dependency', async () => {
        const visitor = makeVisitor({
            ixNode: ixNodeWithAccount,
            resolutionPath: ['myAccount'],
        });
        await expect(visitor.visitAccountValue(accountValueNode('myAccount'))).rejects.toThrow(
            /Circular dependency detected/,
        );
    });
});
