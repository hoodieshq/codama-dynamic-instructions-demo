import { bytesTypeNode, constantValueNodeFromBytes, sentinelTypeNode, stringTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('sentinelTypeNode', () => {
    test('should transform bytes with sentinel', () => {
        const sentinelNode = sentinelTypeNode(bytesTypeNode(), constantValueNodeFromBytes('base16', '00'));
        const transformer = createInputValueTransformer(sentinelNode, rootNodeMock, { bytesEncoding: 'base58' });

        // 'sentinel' as bytes: [115, 101, 110, 116, 105, 110, 101, 108] -> base58: 'LJVJ8vVefAb'
        const input = new Uint8Array([115, 101, 110, 116, 105, 110, 101, 108]);
        expect(transformer(input)).toEqual(['base58', 'LJVJ8vVefAb']);
    });

    test('should handle string with sentinel', () => {
        const sentinelNode = sentinelTypeNode(stringTypeNode('utf8'), constantValueNodeFromBytes('base16', '00'));
        const transformer = createInputValueTransformer(sentinelNode, rootNodeMock);

        const input = 'test string';
        expect(transformer(input)).toBe('test string');
    });
});
