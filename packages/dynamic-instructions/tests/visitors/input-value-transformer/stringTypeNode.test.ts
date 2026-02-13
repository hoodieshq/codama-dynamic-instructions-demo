import { stringTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('stringTypeNode', () => {
    test('should pass string unchanged', () => {
        const stringTransformer = createInputValueTransformer(stringTypeNode('utf8'), rootNodeMock);
        expect(stringTransformer('hello')).toBe('hello');
    });

    test('should pass empty string unchanged', () => {
        const stringTransformer = createInputValueTransformer(stringTypeNode('utf8'), rootNodeMock);
        expect(stringTransformer('')).toBe('');
    });
});
