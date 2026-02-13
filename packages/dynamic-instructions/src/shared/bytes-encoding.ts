import type { ReadonlyUint8Array } from '@codama/dynamic-codecs';
import { getBase16Codec, getBase58Codec, getBase64Codec, getUtf8Codec } from '@solana/codecs';
import type { BytesEncoding } from 'codama';

/**
 * Converts Uint8Array to encoded string based on encoding type.
 * Uses @solana/codecs encoders internally for consistent encoding/decoding.
 *
 * @param bytes - The Uint8Array to encode
 * @param encoding - The encoding format ('base16', 'base58', 'base64', or 'utf8')
 * @returns The encoded string representation
 *
 * @example
 * const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
 * uint8ArrayToEncodedString(bytes, 'base16'); // "48656c6c6f"
 * uint8ArrayToEncodedString(bytes, 'utf8');   // "Hello"
 */
export function uint8ArrayToEncodedString(bytes: Uint8Array, encoding: BytesEncoding): string {
    const codec = getCodecFromBytesEncoding(encoding);
    return codec.decode(bytes);
}

/**
 * Gets the appropriate codec for a given bytes encoding format.
 *
 * @param encoding - The encoding format
 * @returns The corresponding codec
 * @throws Error if encoding is not supported
 */
export function getCodecFromBytesEncoding(encoding: BytesEncoding) {
    switch (encoding) {
        case 'base16':
            return getBase16Codec();
        case 'base58':
            return getBase58Codec();
        case 'base64':
            return getBase64Codec();
        case 'utf8':
            return getUtf8Codec();
        default:
            throw new Error(`Unsupported bytes encoding: ${String(encoding as unknown)}`);
    }
}
/**
 * Type guard to check if a value is a Uint8Array.
 *
 * @param value - The value to check
 * @returns True if the value is a Uint8Array
 *
 * @example
 * isUint8Array(new Uint8Array([1, 2, 3])); // true
 * isUint8Array([1, 2, 3]);                 // false
 * isUint8Array("hello");                   // false
 */
export function isUint8Array(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
}

/**
 * Concatenates multiple byte arrays into a single Uint8Array.
 *
 * @param chunks - Array of byte arrays to concatenate
 * @returns A new Uint8Array containing all chunks concatenated in order
 */
export function concatBytes(chunks: ReadonlyUint8Array[]): Uint8Array {
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk as Uint8Array, offset);
        offset += chunk.length;
    }
    return out;
}
