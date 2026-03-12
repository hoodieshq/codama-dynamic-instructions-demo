import { getUtf8Codec } from '@solana/codecs';
import { stringValueNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { makeVisitor } from './pda-seed-value-test-utils';

describe('pda-seed-value: visitStringValue', () => {
    test('should encode non-empty string as UTF-8 bytes', async () => {
        const result = await makeVisitor().visitStringValue(stringValueNode('hello'));
        expect(result).toEqual(getUtf8Codec().encode('hello'));
    });

    test('should encode empty string as empty bytes', async () => {
        const result = await makeVisitor().visitStringValue(stringValueNode(''));
        expect(result).toEqual(getUtf8Codec().encode(''));
    });

    test('should throw for invalid string value', async () => {
        const invalidStringValues = [123, true, null, undefined, {}] as string[];
        const visitor = makeVisitor();

        for (const invalidStringValue of invalidStringValues) {
            const result = await visitor.visitStringValue(stringValueNode(invalidStringValue));
            expect(result).toEqual(getUtf8Codec().encode(invalidStringValue));
        }
    });
});
