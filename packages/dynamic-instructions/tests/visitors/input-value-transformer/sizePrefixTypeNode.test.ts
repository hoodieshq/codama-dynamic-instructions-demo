import { bytesTypeNode, numberTypeNode, sizePrefixTypeNode, structFieldTypeNode, structTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('sizePrefixTypeNode', () => {
    test('should transform bytes within size-prefixed wrapper', () => {
        const sizeNode = sizePrefixTypeNode(bytesTypeNode(), numberTypeNode('u32'));
        const transformer = createInputValueTransformer(sizeNode, rootNodeMock, { bytesEncoding: 'base64' });

        // 'test' as bytes: [116, 101, 115, 116] -> base64: 'dGVzdA=='
        const input = new Uint8Array([116, 101, 115, 116]);
        expect(transformer(input)).toEqual(['base64', 'dGVzdA==']);
    });

    test('should handle nested struct with size prefix', () => {
        const sizeNode = sizePrefixTypeNode(
            structTypeNode([
                structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
                structFieldTypeNode({ name: 'count', type: numberTypeNode('u32') }),
            ]),
            numberTypeNode('u32'),
        );
        const transformer = createInputValueTransformer(sizeNode, rootNodeMock, { bytesEncoding: 'base16' });

        const input = { count: 10, data: new Uint8Array([0xaa, 0xbb]) };
        expect(transformer(input)).toEqual({ count: 10, data: ['base16', 'aabb'] });
    });
});
