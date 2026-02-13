import { bytesTypeNode, numberTypeNode, optionTypeNode, structFieldTypeNode, structTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('optionTypeNode', () => {
    // Based on mpl-token-metadata-idl.json: collectionAuthorityRecord.updateAuthority field
    test('should transform bytes inside optionTypeNode with Some value', () => {
        const transformer = createInputValueTransformer(optionTypeNode(bytesTypeNode()), rootNodeMock, {
            bytesEncoding: 'base16',
        });

        const input = new Uint8Array([1, 2, 3]);
        expect(transformer(input)).toEqual(['base16', '010203']);
    });

    test('should pass through null for optionTypeNode', () => {
        const transformer = createInputValueTransformer(optionTypeNode(bytesTypeNode()), rootNodeMock);
        expect(transformer(null)).toBe(null);
    });

    test('should pass through undefined for optionTypeNode', () => {
        const transformer = createInputValueTransformer(optionTypeNode(bytesTypeNode()), rootNodeMock);
        expect(transformer(undefined)).toBe(undefined);
    });

    test('should transform nested struct with bytes inside optionTypeNode', () => {
        const transformer = createInputValueTransformer(
            optionTypeNode(
                structTypeNode([
                    structFieldTypeNode({ name: 'id', type: numberTypeNode('u32') }),
                    structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
                ]),
            ),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            data: new Uint8Array([0xde, 0xad]),
            id: 42,
        };

        expect(transformer(input)).toEqual({
            data: ['base16', 'dead'],
            id: 42,
        });
    });

    test('should handle option with number type (pass-through primitive)', () => {
        const transformer = createInputValueTransformer(optionTypeNode(numberTypeNode('u32')), rootNodeMock);

        // Numbers pass through unchanged
        expect(transformer(123)).toBe(123);
        expect(transformer(null)).toBe(null);
        expect(transformer(undefined)).toBe(undefined);
    });
});
