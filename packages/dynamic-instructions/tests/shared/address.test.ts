import { type Address, address } from '@solana/addresses';
import { describe, expect, expectTypeOf, test } from 'vitest';

import { type AddressInput, isPublicKeyLike, type PublicKeyLike, toAddress } from '../../src/shared/address';

describe('isPublicKeyLike', () => {
    test('returns true for objects with toBase58 method', () => {
        const publicKey = { toBase58: () => '11111111111111111111111111111111' };
        expect(isPublicKeyLike(publicKey)).toBe(true);
    });

    test('narrows type to PublicKeyLike', () => {
        const value: unknown = { toBase58: () => '11111111111111111111111111111111' };
        if (isPublicKeyLike(value)) {
            expectTypeOf(value).toExtend<PublicKeyLike>();
        }
    });

    test('returns false for plain strings', () => {
        expect(isPublicKeyLike('11111111111111111111111111111111')).toBe(false);
    });

    test('returns false for null', () => {
        expect(isPublicKeyLike(null)).toBe(false);
    });

    test('returns false for undefined', () => {
        expect(isPublicKeyLike(undefined)).toBe(false);
    });

    test('returns false for numbers', () => {
        expect(isPublicKeyLike(42)).toBe(false);
    });

    test('returns false for objects without toBase58', () => {
        expect(isPublicKeyLike({ toString: () => 'hello' })).toBe(false);
    });

    test('returns false for objects where toBase58 is not a function', () => {
        expect(isPublicKeyLike({ toBase58: 'not-a-function' })).toBe(false);
    });
});

describe('toAddress', () => {
    const VALID_ADDRESS = '11111111111111111111111111111111';

    test('converts a string to Address', () => {
        const result = toAddress(VALID_ADDRESS);
        expect(result).toBe(VALID_ADDRESS);
        expectTypeOf(result).toExtend<Address>();
    });

    test('converts a PublicKeyLike to Address', () => {
        const publicKey = { toBase58: () => VALID_ADDRESS };
        const result = toAddress(publicKey);
        expect(result).toBe(VALID_ADDRESS);
    });

    test('passes through an existing Address', () => {
        const addr = address(VALID_ADDRESS);
        const result = toAddress(addr);
        expect(result).toBe(VALID_ADDRESS);
    });
});

describe('AddressInput type', () => {
    test('accepts Address', () => {
        expectTypeOf(address('11111111111111111111111111111111')).toExtend<AddressInput>();
    });

    test('accepts string', () => {
        expectTypeOf<string>().toExtend<AddressInput>();
    });

    test('accepts PublicKeyLike', () => {
        expectTypeOf<PublicKeyLike>().toExtend<AddressInput>();
    });
});
