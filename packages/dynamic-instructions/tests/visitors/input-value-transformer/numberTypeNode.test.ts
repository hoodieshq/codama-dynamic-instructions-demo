import { numberTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('numberTypeNode', () => {
    test('should pass number unchanged', () => {
        const numberTransformer = createInputValueTransformer(numberTypeNode('u32'), rootNodeMock);
        expect(numberTransformer(42)).toBe(42);
    });

    test('should pass bigint unchanged', () => {
        const numberTransformer = createInputValueTransformer(numberTypeNode('u64'), rootNodeMock);
        expect(numberTransformer(999n)).toBe(999n);
    });
});
