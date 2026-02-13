import {
    bytesTypeNode,
    constantValueNodeFromBytes,
    hiddenSuffixTypeNode,
    structFieldTypeNode,
    structTypeNode,
} from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('hiddenSuffixTypeNode', () => {
    test('should transform bytes with hidden suffix', () => {
        const hiddenNode = hiddenSuffixTypeNode(bytesTypeNode(), [constantValueNodeFromBytes('base16', 'ffee')]);
        const transformer = createInputValueTransformer(hiddenNode, rootNodeMock, { bytesEncoding: 'base16' });

        // 'suffix' as bytes: [115, 117, 102, 102, 105, 120] -> base16: '737566666978'
        const input = new Uint8Array([115, 117, 102, 102, 105, 120]);
        expect(transformer(input)).toEqual(['base16', '737566666978']);
    });

    test('should handle struct with hidden suffix', () => {
        const hiddenNode = hiddenSuffixTypeNode(
            structTypeNode([structFieldTypeNode({ name: 'key', type: bytesTypeNode() })]),
            [constantValueNodeFromBytes('base16', '0000')],
        );
        const transformer = createInputValueTransformer(hiddenNode, rootNodeMock, { bytesEncoding: 'base16' });

        const input = { key: new Uint8Array([0xcd, 0xef]) };
        expect(transformer(input)).toEqual({ key: ['base16', 'cdef'] });
    });
});
