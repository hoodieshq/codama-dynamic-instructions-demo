import { arrayTypeNode, bytesTypeNode, fixedCountNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('arrayTypeNode', () => {
    test('should transform array of bytesTypeNode', () => {
        const transformer = createInputValueTransformer(
            arrayTypeNode(bytesTypeNode(), fixedCountNode(2)),
            rootNodeMock,
            {
                bytesEncoding: 'base16',
            },
        );

        const input = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];

        expect(transformer(input)).toEqual([
            ['base16', '0102'],
            ['base16', '0304'],
        ]);
    });

    test('should throw error for non-array input', () => {
        const transformer = createInputValueTransformer(
            arrayTypeNode(bytesTypeNode(), fixedCountNode(2)),
            rootNodeMock,
            {
                bytesEncoding: 'base16',
            },
        );

        expect(() => transformer(null)).toThrow('Expected an array for arrayTypeNode');
        expect(() => transformer(undefined)).toThrow('Expected an array for arrayTypeNode');
        expect(() => transformer('not an array')).toThrow('Expected an array for arrayTypeNode');
        expect(() => transformer(123)).toThrow('Expected an array for arrayTypeNode');
        expect(() => transformer({ key: 'value' })).toThrow('Expected an array for arrayTypeNode');
    });
});
