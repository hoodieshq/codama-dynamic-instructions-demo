import { AccountError } from './errors';
import type { ResolutionPath } from './types';

export function invariant(condition: boolean, message: string) {
    if (!condition) throw new Error(message);
}

export function detectCircularDependency(nodeName: string, resolutionPath: ResolutionPath) {
    if (resolutionPath.includes(nodeName)) {
        throw new AccountError(`Circular dependency detected: ${[...resolutionPath, nodeName].join(' -> ')}`);
    }
}
/**
 * Checks if a value is a plain object record (struct-like).
 */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

export function formatValueType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array (length ${value.length})`;
    if (value instanceof Uint8Array) return `Uint8Array (length ${value.length})`;
    if (typeof value === 'object') return 'object';
    return typeof value;
}
