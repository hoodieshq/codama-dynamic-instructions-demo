import {
    bytesTypeNode,
    mapTypeNode,
    numberTypeNode,
    prefixedCountNode,
    stringTypeNode,
    structFieldTypeNode,
    structTypeNode,
} from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('mapTypeNode', () => {
    // Based on mpl-token-metadata-idl.json and token-2022-idl.json: additionalMetadata field
    test('should transform bytes values in mapTypeNode', () => {
        const transformer = createInputValueTransformer(
            mapTypeNode(stringTypeNode('utf8'), bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            key1: new Uint8Array([1, 2]),
            key2: new Uint8Array([3, 4, 5]),
        };

        expect(transformer(input)).toEqual({
            key1: ['base16', '0102'],
            key2: ['base16', '030405'],
        });
    });

    test('should transform nested struct values in mapTypeNode', () => {
        const transformer = createInputValueTransformer(
            mapTypeNode(
                stringTypeNode('utf8'),
                structTypeNode([
                    structFieldTypeNode({ name: 'id', type: numberTypeNode('u32') }),
                    structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
                ]),
                prefixedCountNode(numberTypeNode('u32')),
            ),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            item1: { data: new Uint8Array([1, 2]), id: 100 },
            item2: { data: new Uint8Array([3, 4, 5]), id: 200 },
        };

        expect(transformer(input)).toEqual({
            item1: { data: ['base16', '0102'], id: 100 },
            item2: { data: ['base16', '030405'], id: 200 },
        });
    });

    test('should throw error for non-object input', () => {
        const transformer = createInputValueTransformer(
            mapTypeNode(stringTypeNode('utf8'), bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
        );

        expect(() => transformer(null)).toThrow('Expected a plain object for mapTypeNode');
        expect(() => transformer(undefined)).toThrow('Expected a plain object for mapTypeNode');
        expect(() => transformer('not an object')).toThrow('Expected a plain object for mapTypeNode');
        expect(() => transformer(123)).toThrow('Expected a plain object for mapTypeNode');
        expect(() => transformer([1, 2, 3])).toThrow('Expected a plain object for mapTypeNode');
    });

    test('should throw error for Date, Map, and Set inputs', () => {
        const transformer = createInputValueTransformer(
            mapTypeNode(stringTypeNode('utf8'), bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
        );

        expect(() => transformer(new Date())).toThrow('Expected a plain object for mapTypeNode');
        expect(() => transformer(new Map())).toThrow('Expected a plain object for mapTypeNode');
        expect(() => transformer(new Set())).toThrow('Expected a plain object for mapTypeNode');
    });

    test('should handle empty map', () => {
        const transformer = createInputValueTransformer(
            mapTypeNode(stringTypeNode('utf8'), bytesTypeNode(), prefixedCountNode(numberTypeNode('u32'))),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        expect(transformer({})).toEqual({});
    });
});
