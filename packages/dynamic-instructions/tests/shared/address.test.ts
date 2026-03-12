import { type Address, address } from '@solana/addresses';
import { describe, expect, expectTypeOf, test } from 'vitest';

import { type AddressInput, isPublicKeyLike, type PublicKeyLike, toAddress } from '../../src/shared/address';

describe('isPublicKeyLike', () => {
    test('should return true for objects with toBase58 method', () => {
        const publicKey = { toBase58: () => '11111111111111111111111111111111' };
        expect(isPublicKeyLike(publicKey)).toBe(true);
    });

    test('should narrow type to PublicKeyLike', () => {
        const value: unknown = { toBase58: () => '11111111111111111111111111111111' };
        if (isPublicKeyLike(value)) {
            expectTypeOf(value).toExtend<PublicKeyLike>();
        }
    });

    test('should return false for plain strings', () => {
        expect(isPublicKeyLike('11111111111111111111111111111111')).toBe(false);
    });

    test('should return false for null', () => {
        expect(isPublicKeyLike(null)).toBe(false);
    });

    test('should return false for undefined', () => {
        expect(isPublicKeyLike(undefined)).toBe(false);
    });

    test('should return false for numbers', () => {
        expect(isPublicKeyLike(42)).toBe(false);
    });

    test('should return false for objects without toBase58', () => {
        expect(isPublicKeyLike({ toString: () => 'hello' })).toBe(false);
    });

    test('should return false for objects where toBase58 is not a function', () => {
        expect(isPublicKeyLike({ toBase58: 'not-a-function' })).toBe(false);
    });
});

describe('toAddress', () => {
    const VALID_ADDRESS = '11111111111111111111111111111111';

    test('should convert a string to Address', () => {
        const result = toAddress(VALID_ADDRESS);
        expect(result).toBe(VALID_ADDRESS);
        expectTypeOf(result).toExtend<Address>();
    });

    test('should convert a PublicKeyLike to Address', () => {
        const publicKey = { toBase58: () => VALID_ADDRESS };
        const result = toAddress(publicKey);
        expect(result).toBe(VALID_ADDRESS);
    });

    test('should pass through an existing Address', () => {
        const addr = address(VALID_ADDRESS);
        const result = toAddress(addr);
        expect(result).toBe(VALID_ADDRESS);
    });
});

describe('AddressInput type', () => {
    test('should accept Address', () => {
        expectTypeOf(address('11111111111111111111111111111111')).toExtend<AddressInput>();
    });

    test('should accept string', () => {
        expectTypeOf<string>().toExtend<AddressInput>();
    });

    test('should accept PublicKeyLike', () => {
        expectTypeOf<PublicKeyLike>().toExtend<AddressInput>();
    });
});
