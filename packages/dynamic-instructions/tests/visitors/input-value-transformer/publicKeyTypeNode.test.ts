import { publicKeyTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('publicKeyTypeNode', () => {
    test('should pass public key string unchanged', () => {
        const publicKeyTransformer = createInputValueTransformer(publicKeyTypeNode(), rootNodeMock);
        expect(publicKeyTransformer('69n1tbDsJFjUFBXsmZ3ToKm1xcmtBHCZkgzjXkcr5ov1')).toBe(
            '69n1tbDsJFjUFBXsmZ3ToKm1xcmtBHCZkgzjXkcr5ov1',
        );
    });
});
