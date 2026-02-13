import { numberTypeNode, solAmountTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('solAmountTypeNode', () => {
    test('should handle solAmountTypeNode', () => {
        const solNode = solAmountTypeNode(numberTypeNode('u64'));
        const transformer = createInputValueTransformer(solNode, rootNodeMock);

        const input = 5000000000n; // 5 SOL in lamports
        expect(transformer(input)).toBe(5000000000n);
    });
});
