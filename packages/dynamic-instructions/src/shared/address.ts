import { address } from '@solana/addresses';
import type { Address } from '@solana/addresses';

/**
 * Accept both modern Address strings and legacy PublicKey-like objects.
 * We intentionally use duck-typing to avoid hard dependency on @solana/web3.js types.
 */
export type PublicKeyLike = { toBase58(): string };

export type AddressInput = Address | string | PublicKeyLike;

export function isPublicKeyLike(value: unknown): value is PublicKeyLike {
    return (
        typeof value === 'object' &&
        value !== null &&
        'toBase58' in (value as any) &&
        typeof (value as any).toBase58 === 'function'
    );
}

export function toAddress(input: AddressInput): Address {
    if (typeof input === 'string') return address(input);
    if (isPublicKeyLike(input)) return address(input.toBase58());
    // If it is already a branded Address (string), address(...) above also handles it.
    return input as Address;
}
