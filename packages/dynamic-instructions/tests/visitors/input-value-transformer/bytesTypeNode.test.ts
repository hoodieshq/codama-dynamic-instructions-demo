import { bytesTypeNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('bytesTypeNode', () => {
    test('should transform Uint8Array to tuple for bytesTypeNode', () => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock, { bytesEncoding: 'base16' });

        // 'Hello' as bytes: [72, 101, 108, 108, 111] -> base16: '48656c6c6f'
        const input = new Uint8Array([72, 101, 108, 108, 111]);
        const result = transformer(input);

        expect(result).toEqual(['base16', '48656c6c6f']);
    });

    test('should throw error for non-Uint8Array input', () => {
        const transformer = createInputValueTransformer(bytesTypeNode(), rootNodeMock, { bytesEncoding: 'base16' });

        expect(() => transformer(null)).toThrow('Expected Uint8Array for bytesTypeNode');
        expect(() => transformer(undefined)).toThrow('Expected Uint8Array for bytesTypeNode');
        expect(() => transformer('not a Uint8Array')).toThrow('Expected Uint8Array for bytesTypeNode');
        expect(() => transformer(123)).toThrow('Expected Uint8Array for bytesTypeNode');
        expect(() => transformer({ data: [1, 2, 3] })).toThrow('Expected Uint8Array for bytesTypeNode');
        expect(() => transformer([1, 2, 3])).toThrow('Expected Uint8Array for bytesTypeNode');
    });
});
