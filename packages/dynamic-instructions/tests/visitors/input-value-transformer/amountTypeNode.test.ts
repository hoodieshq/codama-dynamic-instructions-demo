import { amountTypeNode, numberTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('amountTypeNode', () => {
    test('should handle amountTypeNode', () => {
        const amountNode = amountTypeNode(numberTypeNode('u64'), 9);
        const transformer = createInputValueTransformer(amountNode, rootNodeMock);

        const input = 1000000000n;
        expect(transformer(input)).toBe(1000000000n);
    });
});
