import { numberTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './input-value-transformer-test-utils';

describe('numberTypeNode', () => {
    test('should pass through number values', () => {
        const transformer = createInputValueTransformer(numberTypeNode('u64'), rootNodeMock);
        expect(transformer(0)).toBe(0);
        expect(transformer(42)).toBe(42);
        expect(transformer(-1)).toBe(-1);
        expect(transformer(3.14)).toBe(3.14);
        expect(transformer(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    });
});
