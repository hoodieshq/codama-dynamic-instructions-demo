import { bytesTypeNode, numberTypeNode, preOffsetTypeNode, structFieldTypeNode, structTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('preOffsetTypeNode', () => {
    test('should transform bytes with pre-offset', () => {
        const offsetNode = preOffsetTypeNode(bytesTypeNode(), 4);
        const transformer = createInputValueTransformer(offsetNode, rootNodeMock, { bytesEncoding: 'base16' });

        // 'offset' as bytes: [111, 102, 102, 115, 101, 116] -> base16: '6f6666736574'
        const input = new Uint8Array([111, 102, 102, 115, 101, 116]);
        expect(transformer(input)).toEqual(['base16', '6f6666736574']);
    });

    test('should handle struct with pre-offset', () => {
        const offsetNode = preOffsetTypeNode(
            structTypeNode([
                structFieldTypeNode({ name: 'id', type: numberTypeNode('u64') }),
                structFieldTypeNode({ name: 'data', type: bytesTypeNode() }),
            ]),
            8,
        );
        const transformer = createInputValueTransformer(offsetNode, rootNodeMock, { bytesEncoding: 'base16' });

        const input = { data: new Uint8Array([0x11, 0x22]), id: 999n };
        expect(transformer(input)).toEqual({ data: ['base16', '1122'], id: 999n });
    });
});
