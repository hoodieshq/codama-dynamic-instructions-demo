import { arrayTypeNode, bytesTypeNode, fixedCountNode, numberTypeNode, stringTypeNode, tupleTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('tupleTypeNode', () => {
    test('should transform tuple with bytes element', () => {
        const transformer = createInputValueTransformer(
            tupleTypeNode([numberTypeNode('u32'), bytesTypeNode(), stringTypeNode('utf8')]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = [42, new Uint8Array([1, 2, 3]), 'hello'];

        expect(transformer(input)).toEqual([42, ['base16', '010203'], 'hello']);
    });

    test('should transform array of tuples containing bytes', () => {
        const transformer = createInputValueTransformer(
            arrayTypeNode(tupleTypeNode([stringTypeNode('utf8'), bytesTypeNode()]), fixedCountNode(2)),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input: [string, Uint8Array][] = [
            ['first', new Uint8Array([1, 2])],
            ['second', new Uint8Array([3, 4])],
        ];

        expect(transformer(input)).toEqual([
            ['first', ['base16', '0102']],
            ['second', ['base16', '0304']],
        ]);
    });

    test('should throw error for non-array input', () => {
        const transformer = createInputValueTransformer(
            tupleTypeNode([numberTypeNode('u32'), bytesTypeNode()]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        expect(() => transformer(null)).toThrow('Expected an array for tupleTypeNode');
        expect(() => transformer(undefined)).toThrow('Expected an array for tupleTypeNode');
        expect(() => transformer('not an array')).toThrow('Expected an array for tupleTypeNode');
        expect(() => transformer(123)).toThrow('Expected an array for tupleTypeNode');
        expect(() => transformer({ key: 'value' })).toThrow('Expected an array for tupleTypeNode');
    });

    test('should throw error for tuple length mismatch', () => {
        const transformer = createInputValueTransformer(
            tupleTypeNode([numberTypeNode('u32'), bytesTypeNode(), stringTypeNode('utf8')]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        expect(() => transformer([42])).toThrow('Expected tuple of length 3');
        expect(() => transformer([42, new Uint8Array([1, 2])])).toThrow('Expected tuple of length 3');
        expect(() => transformer([42, new Uint8Array([1, 2]), 'hello', 'extra'])).toThrow('Expected tuple of length 3');
        expect(() => transformer([])).toThrow('Expected tuple of length 3');
    });
});
