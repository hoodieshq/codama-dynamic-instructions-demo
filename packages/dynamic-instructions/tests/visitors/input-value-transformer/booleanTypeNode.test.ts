import { booleanTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('booleanTypeNode', () => {
    test('should pass boolean unchanged', () => {
        const booleanTransformer = createInputValueTransformer(booleanTypeNode(), rootNodeMock);
        expect(booleanTransformer(true)).toBe(true);
        expect(booleanTransformer(false)).toBe(false);
    });
});
