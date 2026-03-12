import { getAddressEncoder } from '@solana/addresses';
import { programIdValueNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { SvmTestContext } from '../../svm-test-context';
import { makeVisitor } from './pda-seed-value-test-utils';

describe('pda-seed-value: visitProgramIdValue', () => {
    test('should encode the context programId as 32-byte address', async () => {
        const svm = new SvmTestContext();
        const randomAddress = svm.createAccount();
        const result = await makeVisitor({
            programId: randomAddress,
        }).visitProgramIdValue(programIdValueNode());
        expect(result).toEqual(getAddressEncoder().encode(randomAddress));
    });

    test('should throw an error for invalid programId', () => {
        const invalidVisitors = [
            makeVisitor({
                // @ts-expect-error testing invalid programId value
                programId: 42,
            }),
            makeVisitor({
                // @ts-expect-error testing invalid programId value
                programId: 'invalid-address',
            }),
            makeVisitor({
                // @ts-expect-error testing invalid programId value
                programId: [1, 2, 3],
            }),
            makeVisitor({
                // @ts-expect-error testing invalid programId value
                programId: null,
            }),
        ];
        invalidVisitors.forEach(visitor => {
            expect(() => visitor.visitProgramIdValue(programIdValueNode())).toThrow(/Expected base58-encoded address/);
        });
    });
});
