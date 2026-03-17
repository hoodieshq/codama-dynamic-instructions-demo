import type { InstructionNode } from 'codama';
import { accountValueNode, instructionAccountNode, publicKeyValueNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../../svm-test-context';
import { ixNodeStub, makeVisitor } from './account-default-value-test-utils';

describe('account-default-value: visitAccountValue', () => {
    const refAddress = SvmTestContext.generateAddress();
    const ixNodeWithAccount: InstructionNode = {
        ...ixNodeStub,
        accounts: [
            instructionAccountNode({
                isOptional: false,
                isSigner: false,
                isWritable: false,
                name: 'refAccount',
            }),
        ],
    };

    test('should return address when user provides address in accountsInput', async () => {
        const visitor = makeVisitor({
            accountsInput: { refAccount: refAddress },
            ixNode: ixNodeWithAccount,
        });
        const result = await visitor.visitAccountValue(accountValueNode('refAccount'));
        expect(result).toBe(refAddress);
    });

    test('should return null for optional account with null input and omitted strategy', async () => {
        const ixNodeWithOptional: InstructionNode = {
            ...ixNodeStub,
            accounts: [
                instructionAccountNode({
                    isOptional: true,
                    isSigner: false,
                    isWritable: false,
                    name: 'refAccount',
                }),
            ],
            optionalAccountStrategy: 'omitted',
        };
        const visitor = makeVisitor({
            accountsInput: { refAccount: null },
            ixNode: ixNodeWithOptional,
        });
        const result = await visitor.visitAccountValue(accountValueNode('refAccount'));
        expect(result).toBeNull();
    });

    test('should resolve referenced account defaultValue', async () => {
        const expectedDefaultAddress = SvmTestContext.generateAddress();
        const ixNodeWithDefault: InstructionNode = {
            ...ixNodeStub,
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(expectedDefaultAddress),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'refAccount',
                }),
            ],
        };
        const visitor = makeVisitor({ ixNode: ixNodeWithDefault });
        const result = await visitor.visitAccountValue(accountValueNode('refAccount'));
        expect(result).toBe(expectedDefaultAddress);
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
            resolutionPath: ['refAccount'],
        });
        await expect(visitor.visitAccountValue(accountValueNode('refAccount'))).rejects.toThrow(
            /Circular dependency detected/,
        );
    });
});
