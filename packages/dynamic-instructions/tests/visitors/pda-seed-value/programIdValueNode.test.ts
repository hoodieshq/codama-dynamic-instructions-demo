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

    test('should throw an error for non-string programId', () => {
        const invalidValues = [42, [1, 2, 3], null];
        invalidValues.forEach(value => {
            // @ts-expect-error testing invalid programId value
            const visitor = makeVisitor({ programId: value });
            expect(() => visitor.visitProgramIdValue(programIdValueNode())).toThrow(/Expected base58-encoded Address/);
        });
    });

    test('should throw an error for invalid string programId', () => {
        const invalidValues = ['not-a-key', '123', '', '      '];
        invalidValues.forEach(value => {
            // @ts-expect-error testing invalid programId value
            const visitor = makeVisitor({ programId: value });
            expect(() => visitor.visitProgramIdValue(programIdValueNode())).toThrow(/Expected base58-encoded Address/);
        });
    });
});
