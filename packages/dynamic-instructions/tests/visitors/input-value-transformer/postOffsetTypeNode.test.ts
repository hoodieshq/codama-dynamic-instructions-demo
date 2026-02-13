import { booleanTypeNode, bytesTypeNode, postOffsetTypeNode, structFieldTypeNode, structTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('postOffsetTypeNode', () => {
    test('should transform bytes with post-offset', () => {
        const offsetNode = postOffsetTypeNode(bytesTypeNode(), 4);
        const transformer = createInputValueTransformer(offsetNode, rootNodeMock, { bytesEncoding: 'base64' });

        // 'post' as bytes: [112, 111, 115, 116] -> base64: 'cG9zdA=='
        const input = new Uint8Array([112, 111, 115, 116]);
        expect(transformer(input)).toEqual(['base64', 'cG9zdA==']);
    });

    test('should handle struct with post-offset', () => {
        const offsetNode = postOffsetTypeNode(
            structTypeNode([
                structFieldTypeNode({ name: 'value', type: bytesTypeNode() }),
                structFieldTypeNode({ name: 'flag', type: booleanTypeNode() }),
            ]),
            2,
        );
        const transformer = createInputValueTransformer(offsetNode, rootNodeMock, { bytesEncoding: 'base16' });

        const input = { flag: true, value: new Uint8Array([0xab, 0xcd]) };
        expect(transformer(input)).toEqual({ flag: true, value: ['base16', 'abcd'] });
    });
});
