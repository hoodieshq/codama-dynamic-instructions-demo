import { bytesTypeNode, publicKeyTypeNode, structFieldTypeNode, structTypeNode, zeroableOptionTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('zeroableOptionTypeNode', () => {
    // Based on pmp-idl.json: buffer account authority field
    test('should transform bytes inside zeroableOptionTypeNode with Some value', () => {
        const transformer = createInputValueTransformer(zeroableOptionTypeNode(bytesTypeNode()), rootNodeMock, {
            bytesEncoding: 'base16',
        });

        const input = new Uint8Array([1, 2, 3]);
        expect(transformer(input)).toEqual(['base16', '010203']);
    });

    test('should pass through null for zeroableOptionTypeNode', () => {
        const transformer = createInputValueTransformer(zeroableOptionTypeNode(bytesTypeNode()), rootNodeMock);
        expect(transformer(null)).toBe(null);
    });

    test('should pass through undefined for zeroableOptionTypeNode', () => {
        const transformer = createInputValueTransformer(zeroableOptionTypeNode(bytesTypeNode()), rootNodeMock);
        expect(transformer(undefined)).toBe(undefined);
    });

    test('should transform publicKey inside zeroableOptionTypeNode', () => {
        const transformer = createInputValueTransformer(zeroableOptionTypeNode(publicKeyTypeNode()), rootNodeMock);

        const publicKey = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
        expect(transformer(publicKey)).toBe(publicKey);
        expect(transformer(null)).toBe(null);
    });

    test('should transform struct with zeroable option field containing bytes', () => {
        const transformer = createInputValueTransformer(
            structTypeNode([
                structFieldTypeNode({ name: 'program', type: zeroableOptionTypeNode(publicKeyTypeNode()) }),
                structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
            ]),
            rootNodeMock,
            { bytesEncoding: 'base16' },
        );

        const input = {
            data: new Uint8Array([1, 2]),
            program: '11111111111111111111111111111111',
        };

        expect(transformer(input)).toEqual({
            data: ['base16', '0102'],
            program: '11111111111111111111111111111111',
        });
    });
});
