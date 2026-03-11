import { describe, expect, test } from 'vitest';

import {
    concatBytes,
    getCodecFromBytesEncoding,
    isUint8Array,
    uint8ArrayToEncodedString,
} from '../../src/shared/bytes-encoding';

describe('uint8ArrayToEncodedString', () => {
    const helloBytes = new Uint8Array([72, 101, 108, 108, 111]);

    test('encodes to base16', () => {
        expect(uint8ArrayToEncodedString(helloBytes, 'base16')).toBe('48656c6c6f');
    });

    test('encodes to base58', () => {
        expect(uint8ArrayToEncodedString(helloBytes, 'base58')).toBe('9Ajdvzr');
    });

    test('encodes to base64', () => {
        expect(uint8ArrayToEncodedString(helloBytes, 'base64')).toBe('SGVsbG8=');
    });

    test('encodes to utf8', () => {
        expect(uint8ArrayToEncodedString(helloBytes, 'utf8')).toBe('Hello');
    });

    test('handles empty bytes', () => {
        expect(uint8ArrayToEncodedString(new Uint8Array(), 'base16')).toBe('');
    });
});

describe('getCodecFromBytesEncoding', () => {
    test('returns codec for base16', () => {
        const codec = getCodecFromBytesEncoding('base16');
        expect(codec).toBeDefined();
        expect(codec.encode('ff')).toEqual(new Uint8Array([255]));
    });

    test('returns codec for base58', () => {
        const codec = getCodecFromBytesEncoding('base58');
        expect(codec).toBeDefined();
    });

    test('returns codec for base64', () => {
        const codec = getCodecFromBytesEncoding('base64');
        expect(codec).toBeDefined();
    });

    test('returns codec for utf8', () => {
        const codec = getCodecFromBytesEncoding('utf8');
        expect(codec).toBeDefined();
        expect(codec.encode('Hi')).toEqual(new Uint8Array([72, 105]));
    });

    test('throws for unsupported encoding', () => {
        // @ts-expect-error testing invalid input
        expect(() => getCodecFromBytesEncoding('rot13')).toThrow('Unsupported bytes encoding: rot13');
    });
});

describe('isUint8Array', () => {
    test('returns true for Uint8Array', () => {
        expect(isUint8Array(new Uint8Array([1, 2, 3]))).toBe(true);
        expect(isUint8Array(new Uint8Array())).toBe(true);
    });

    test('returns false for regular arrays', () => {
        expect(isUint8Array([1, 2, 3])).toBe(false);
    });

    test('returns false for strings', () => {
        expect(isUint8Array('hello')).toBe(false);
    });

    test('returns false for null and undefined', () => {
        expect(isUint8Array(null)).toBe(false);
        expect(isUint8Array(undefined)).toBe(false);
    });

    test('returns false for other typed arrays', () => {
        expect(isUint8Array(new Uint16Array([1, 2]))).toBe(false);
        expect(isUint8Array(new Int8Array([1, 2]))).toBe(false);
    });
});

describe('concatBytes', () => {
    test('concatenates multiple byte arrays', () => {
        const a = new Uint8Array([1, 2]);
        const b = new Uint8Array([3, 4]);
        const c = new Uint8Array([5]);
        expect(concatBytes([a, b, c])).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
    });

    test('returns empty array for empty input', () => {
        expect(concatBytes([])).toEqual(new Uint8Array());
    });

    test('returns copy of single chunk', () => {
        const single = new Uint8Array([1, 2, 3]);
        const result = concatBytes([single]);
        expect(result).toEqual(single);
        // should be a new array, not the same reference
        expect(result).not.toBe(single);
    });

    test('handles empty chunks', () => {
        const a = new Uint8Array([1]);
        const empty = new Uint8Array();
        const b = new Uint8Array([2]);
        expect(concatBytes([a, empty, b])).toEqual(new Uint8Array([1, 2]));
    });
});
