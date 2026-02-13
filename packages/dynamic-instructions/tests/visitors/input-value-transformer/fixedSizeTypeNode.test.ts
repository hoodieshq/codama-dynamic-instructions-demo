import { bytesTypeNode, fixedSizeTypeNode, numberTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('fixedSizeTypeNode', () => {
    test('should transform bytes within fixed-size wrapper', () => {
        const fixedNode = fixedSizeTypeNode(bytesTypeNode(), 8);
        const transformer = createInputValueTransformer(fixedNode, rootNodeMock, { bytesEncoding: 'base16' });

        const input = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(transformer(input)).toEqual(['base16', '0102030405060708']);
    });

    test('should pass through non-Uint8Array input', () => {
        const fixedNode = fixedSizeTypeNode(numberTypeNode('u32'), 4);
        const transformer = createInputValueTransformer(fixedNode, rootNodeMock);

        const input = 42;
        expect(transformer(input)).toBe(42);
    });
});
