import { bytesTypeNode, publicKeyTypeNode, remainderOptionTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('remainderOptionTypeNode', () => {
    // Based on pmp-idl.json
    test('should transform bytes inside remainderOptionTypeNode with Some value', () => {
        const transformer = createInputValueTransformer(remainderOptionTypeNode(bytesTypeNode()), rootNodeMock, {
            bytesEncoding: 'base16',
        });

        const input = new Uint8Array([1, 2, 3]);
        expect(transformer(input)).toEqual(['base16', '010203']);
    });

    test('should pass through null for remainderOptionTypeNode', () => {
        const transformer = createInputValueTransformer(remainderOptionTypeNode(bytesTypeNode()), rootNodeMock);
        expect(transformer(null)).toBe(null);
    });

    test('should pass through undefined for remainderOptionTypeNode', () => {
        const transformer = createInputValueTransformer(remainderOptionTypeNode(bytesTypeNode()), rootNodeMock);
        expect(transformer(undefined)).toBe(undefined);
    });

    test('should transform publicKey inside remainderOptionTypeNode', () => {
        const transformer = createInputValueTransformer(remainderOptionTypeNode(publicKeyTypeNode()), rootNodeMock);

        const publicKey = '11111111111111111111111111111111';
        expect(transformer(publicKey)).toBe(publicKey);
        expect(transformer(null)).toBe(null);
    });
});
