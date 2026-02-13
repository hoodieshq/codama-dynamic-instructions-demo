import {
    arrayTypeNode,
    booleanTypeNode,
    bytesTypeNode,
    definedTypeLinkNode,
    definedTypeNode,
    fixedCountNode,
    numberTypeNode,
    programNode,
    publicKeyTypeNode,
    rootNode,
    stringTypeNode,
    structFieldTypeNode,
    structTypeNode,
    tupleTypeNode,
} from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../src/entities/visitors/input-value-transformer';
import { uint8ArrayToEncodedString } from '../../src/shared/bytes-encoding';

// Helper functions for encoding/decoding
const textToBytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const encodeToBase16 = (bytes: Uint8Array): string => uint8ArrayToEncodedString(bytes, 'base16');
const encodeToBase58 = (bytes: Uint8Array): string => uint8ArrayToEncodedString(bytes, 'base58');
const encodeToBase64 = (bytes: Uint8Array): string => uint8ArrayToEncodedString(bytes, 'base64');
const encodeToUtf8 = (bytes: Uint8Array): string => uint8ArrayToEncodedString(bytes, 'utf8');

describe('Input Value Transformer', () => {
    const rootNodeMock = rootNode(
        programNode({
            name: 'test',
            publicKey: '11111111111111111111111111111111',
        }),
    );

    test('should transform Uint8Array to tuple for bytesTypeNode', () => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock, { bytesEncoding: 'base16' });

        const input = textToBytes('Hello');
        const expectedEncoded = encodeToBase16(input);
        const result = transformer(input);

        expect(result).toEqual(['base16', expectedEncoded]);
    });

    // Test 2: All encoding types
    test.each([
        ['base16', new Uint8Array([0xde, 0xad]), ['base16', encodeToBase16(new Uint8Array([0xde, 0xad]))]],
        ['base58', new Uint8Array([0, 0]), ['base58', encodeToBase58(new Uint8Array([0, 0]))]],
        ['base64', textToBytes('Hel'), ['base64', encodeToBase64(textToBytes('Hel'))]],
        ['utf8', textToBytes('Hello'), ['utf8', encodeToUtf8(textToBytes('Hello'))]],
    ])('supports %s encoding', (encoding, input, expected) => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock, {
            bytesEncoding: encoding as 'base16' | 'base58' | 'base64' | 'utf8',
        });

        expect(transformer(input)).toEqual(expected);
    });

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

    test('should transform struct with bytes field', () => {
        const transformer = createInputValueTransformer(
            structTypeNode([
                structFieldTypeNode({ name: 'name', type: stringTypeNode('utf8') }),
                structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
            ]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            data: new Uint8Array([1, 2, 3]),
            name: 'test',
        };

        expect(transformer(input)).toEqual({
            data: ['base16', encodeToBase16(input.data)],
            name: 'test',
        });
    });

    test('should transform tuple with bytes element', () => {
        const transformer = createInputValueTransformer(
            tupleTypeNode([numberTypeNode('u32'), bytesTypeNode(), stringTypeNode('utf8')]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const toHexValue = new Uint8Array([1, 2, 3]);
        const input = [42, toHexValue, 'hello'];

        expect(transformer(input)).toEqual([42, ['base16', encodeToBase16(toHexValue)], 'hello']);
    });

    test('should pass primitive types unchanged', () => {
        const numberTransformer = createInputValueTransformer(numberTypeNode('u32'), rootNodeMock);
        expect(numberTransformer(42)).toBe(42);

        const booleanTransformer = createInputValueTransformer(booleanTypeNode(), rootNodeMock);
        expect(booleanTransformer(true)).toBe(true);

        const stringTransformer = createInputValueTransformer(stringTypeNode('utf8'), rootNodeMock);
        expect(stringTransformer('hello')).toBe('hello');

        const publicKeyTransformer = createInputValueTransformer(publicKeyTypeNode(), rootNodeMock);
        expect(publicKeyTransformer('69n1tbDsJFjUFBXsmZ3ToKm1xcmtBHCZkgzjXkcr5ov1')).toBe(
            '69n1tbDsJFjUFBXsmZ3ToKm1xcmtBHCZkgzjXkcr5ov1',
        );
    });

    test('should resolve definedTypeLinkNode', () => {
        const root = rootNode(
            programNode({
                definedTypes: [
                    definedTypeNode({
                        name: 'MyData',
                        type: bytesTypeNode(),
                    }),
                ],
                name: 'test',
                publicKey: '11111111111111111111111111111111',
            }),
        );

        const transformer = createInputValueTransformer(definedTypeLinkNode('MyData'), root, {
            bytesEncoding: 'base16',
        });

        const input = new Uint8Array([1, 2]);
        const expectedEncoded = encodeToBase16(input);
        expect(transformer(input)).toEqual(['base16', expectedEncoded]);
    });

    test('should throw error on unresolvable definedTypeLinkNode', () => {
        expect(() => {
            createInputValueTransformer(definedTypeLinkNode('NonExistent'), rootNodeMock, { bytesEncoding: 'base16' });
        }).toThrow('Cannot resolve defined type link: nonExistent');
    });

    // Test 9: Backward compatibility - non-Uint8Array passes through
    test('should pass through non-Uint8Array for bytesTypeNode', () => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock, { bytesEncoding: 'base16' });

        const alreadyTransformed = ['base16', 'deadbeef'];
        expect(transformer(alreadyTransformed)).toBe(alreadyTransformed);

        // String input passes through
        expect(transformer('somestring')).toBe('somestring');
    });

    test('should transform complex nested structure with bytes in array', () => {
        const transformer = createInputValueTransformer(
            structTypeNode([
                structFieldTypeNode({ name: 'id', type: numberTypeNode('u32') }),
                structFieldTypeNode({
                    name: 'items',
                    type: arrayTypeNode(
                        structTypeNode([
                            structFieldTypeNode({ name: 'name', type: stringTypeNode('utf8') }),
                            structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
                        ]),
                        fixedCountNode(2),
                    ),
                }),
            ]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            id: 123,
            items: [
                { data: new Uint8Array([1, 2, 3]), name: 'item1' },
                { data: new Uint8Array([4, 5]), name: 'item2' },
            ],
        };

        expect(transformer(input)).toEqual({
            id: 123,
            items: [
                { data: ['base16', encodeToBase16(input.items[0]!.data)], name: 'item1' },
                { data: ['base16', encodeToBase16(input.items[1]!.data)], name: 'item2' },
            ],
        });
    });

    test('should pass non-array input for arrayTypeNode', () => {
        const transformer = createInputValueTransformer(
            arrayTypeNode(bytesTypeNode(), fixedCountNode(2)),
            rootNodeMock,
            {
                bytesEncoding: 'base16',
            },
        );

        expect(transformer(null)).toBe(null);
        expect(transformer(undefined)).toBe(undefined);
        expect(transformer('not an array')).toBe('not an array');
    });

    test('should pass non-object input for structTypeNode', () => {
        const transformer = createInputValueTransformer(
            structTypeNode([structFieldTypeNode({ name: 'data', type: bytesTypeNode() })]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        expect(transformer(null)).toBe(null);
        expect(transformer(undefined)).toBe(undefined);
        expect(transformer('not an object')).toBe('not an object');
    });

    test('should use base16 as default encoding', () => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock);

        const deadbeefBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
        const input = deadbeefBytes;
        const result = transformer(input);

        expect(result).toEqual(['base16', encodeToBase16(deadbeefBytes)]);
    });

    test('should transform empty Uint8Array', () => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock, { bytesEncoding: 'base16' });

        const input = new Uint8Array([]);
        const result = transformer(input);

        expect(result).toEqual(['base16', encodeToBase16(input)]);
    });

    test('should transform multiple bytes fields in struct', () => {
        const transformer = createInputValueTransformer(
            structTypeNode([
                structFieldTypeNode({ name: 'key', type: bytesTypeNode() }),
                structFieldTypeNode({ name: 'value', type: bytesTypeNode() }),
                structFieldTypeNode({ name: 'id', type: numberTypeNode('u32') }),
            ]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            id: 999,
            key: new Uint8Array([1, 2]),
            value: new Uint8Array([3, 4, 5]),
        };

        expect(transformer(input)).toEqual({
            id: 999,
            key: ['base16', encodeToBase16(input.key)],
            value: ['base16', encodeToBase16(input.value)],
        });
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
            ['first', ['base16', encodeToBase16(input[0]![1])]],
            ['second', ['base16', encodeToBase16(input[1]![1])]],
        ]);
    });
});
