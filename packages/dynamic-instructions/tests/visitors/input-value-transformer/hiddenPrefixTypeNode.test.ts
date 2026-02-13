import {
    bytesTypeNode,
    constantValueNodeFromBytes,
    hiddenPrefixTypeNode,
    structFieldTypeNode,
    structTypeNode,
} from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('hiddenPrefixTypeNode', () => {
    test('should transform bytes with hidden prefix', () => {
        const hiddenNode = hiddenPrefixTypeNode(bytesTypeNode(), [constantValueNodeFromBytes('base16', 'ffee')]);
        const transformer = createInputValueTransformer(hiddenNode, rootNodeMock, { bytesEncoding: 'base58' });

        // 'data' as bytes: [100, 97, 116, 97] -> base58: '3ZpVkU'
        const input = new Uint8Array([100, 97, 116, 97]);
        expect(transformer(input)).toEqual(['base58', '3ZpVkU']);
    });

    test('should handle struct with hidden prefix', () => {
        const hiddenNode = hiddenPrefixTypeNode(
            structTypeNode([structFieldTypeNode({ name: 'value', type: bytesTypeNode() })]),
            [constantValueNodeFromBytes('base16', 'aabb')],
        );
        const transformer = createInputValueTransformer(hiddenNode, rootNodeMock, { bytesEncoding: 'base16' });

        const input = { value: new Uint8Array([0x12, 0x34]) };
        expect(transformer(input)).toEqual({ value: ['base16', '1234'] });
    });
});
