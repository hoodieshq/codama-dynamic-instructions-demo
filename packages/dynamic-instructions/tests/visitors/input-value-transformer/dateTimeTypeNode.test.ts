import { dateTimeTypeNode, numberTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('dateTimeTypeNode', () => {
    test('should handle dateTimeTypeNode', () => {
        const dateNode = dateTimeTypeNode(numberTypeNode('i64'));
        const transformer = createInputValueTransformer(dateNode, rootNodeMock);

        const input = new Date('2024-01-01');
        expect(transformer(input)).toEqual(input);
    });
});
