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

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        !(value instanceof Map) &&
        !(value instanceof Set)
    );
}
