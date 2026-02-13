import {
    bytesTypeNode,
    numberTypeNode,
    prefixedCountNode,
    setTypeNode,
    structFieldTypeNode,
    structTypeNode,
} from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('setTypeNode', () => {
    test('should transform bytes items in setTypeNode', () => {
        const transformer = createInputValueTransformer(
            setTypeNode(bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];

        expect(transformer(input)).toEqual([
            ['base16', '0102'],
            ['base16', '0304'],
        ]);
    });

    test('should throw error for non-array input', () => {
        const transformer = createInputValueTransformer(
            setTypeNode(bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
        );

        expect(() => transformer(null)).toThrow('Expected an array for setTypeNode');
        expect(() => transformer(undefined)).toThrow('Expected an array for setTypeNode');
        expect(() => transformer('not an array')).toThrow('Expected an array for setTypeNode');
        expect(() => transformer(123)).toThrow('Expected an array for setTypeNode');
        expect(() => transformer({ key: 'value' })).toThrow('Expected an array for setTypeNode');
    });

    test('should transform set of structs with bytes', () => {
        const transformer = createInputValueTransformer(
            setTypeNode(
                structTypeNode([
                    structFieldTypeNode({ name: 'id', type: numberTypeNode('u8') }),
                    structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
                ]),
                prefixedCountNode(numberTypeNode('u32')),
            ),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = [
            { data: new Uint8Array([1, 2]), id: 1 },
            { data: new Uint8Array([3, 4]), id: 2 },
        ];

        expect(transformer(input)).toEqual([
            { data: ['base16', '0102'], id: 1 },
            { data: ['base16', '0304'], id: 2 },
        ]);
    });

    test('should handle empty set', () => {
        const transformer = createInputValueTransformer(
            setTypeNode(bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        expect(transformer([])).toEqual([]);
    });
});
