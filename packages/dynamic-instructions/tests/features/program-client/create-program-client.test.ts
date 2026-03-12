import { describe, expect, test } from 'vitest';

import { DynamicInstructionsError } from '../../../src/shared/errors';
import type { SystemProgramClient } from '../../generated/system-program-idl-types';
import { createTestProgramClient } from '../../test-utils';

describe('createProgramClient', () => {
    describe('methods', () => {
        const programClient = createTestProgramClient('system-program-idl.json');

        test('throws when accessing a non-existent instruction', () => {
            expect(() => programClient.methods.nonExistentMethod).toThrow(DynamicInstructionsError);
            expect(() => programClient.methods.nonExistentMethod).toThrow(
                /Instruction "nonExistentMethod" not found in IDL/,
            );
        });

        test('error message lists available instructions', () => {
            expect(() => programClient.methods.nonExistentMethod).toThrow(/Available instructions:/);
            expect(() => programClient.methods.nonExistentMethod).toThrow(/transferSol/);
        });

        test('returns a builder for a valid instruction', () => {
            const typedClient = createTestProgramClient<SystemProgramClient>('system-program-idl.json');
            const builder = typedClient.methods.transferSol({ amount: 1000 });
            expect(builder).toBeDefined();
            expect(typeof builder.accounts).toBe('function');
            expect(typeof builder.instruction).toBe('function');
        });

        test('supports "in" operator for existing instructions', () => {
            expect('transferSol' in programClient.methods).toBe(true);
            expect('nonExistentMethod' in programClient.methods).toBe(false);
        });

        test('should preserve standard object semantics for prototype properties with "in" operator', () => {
            expect('toString' in programClient.methods).toBe(true);
            expect('valueOf' in programClient.methods).toBe(true);
            expect('constructor' in programClient.methods).toBe(true);
            expect('hasOwnProperty' in programClient.methods).toBe(true);
        });

        test('does not throw when awaited directly', async () => {
            // eslint-disable-next-line @typescript-eslint/await-thenable
            const result = await programClient.methods;
            expect(result).toBeDefined();
        });

        test('does not throw when serialized with JSON.stringify', () => {
            expect(() => JSON.stringify(programClient.methods)).not.toThrow();
        });
    });

    describe('pdas', () => {
        const pdaClient = createTestProgramClient('mpl-token-metadata-idl.json');

        test('throws when accessing a non-existent PDA', () => {
            expect(() => pdaClient.pdas.nonExistentPda).toThrow(DynamicInstructionsError);
            expect(() => pdaClient.pdas.nonExistentPda).toThrow(/PDA "nonExistentPda" not found in IDL/);
        });

        test('error message lists available PDAs', () => {
            expect(() => pdaClient.pdas.nonExistentPda).toThrow(/Available PDAs:/);
        });

        test('supports "in" operator for existing PDAs', () => {
            expect('metadata' in pdaClient.pdas).toBe(true);
            expect('nonExistentPda' in pdaClient.pdas).toBe(false);
        });

        test('should preserve standard object semantics for prototype properties with "in" operator', () => {
            expect('toString' in pdaClient.pdas).toBe(true);
            expect('valueOf' in pdaClient.pdas).toBe(true);
            expect('constructor' in pdaClient.pdas).toBe(true);
            expect('hasOwnProperty' in pdaClient.pdas).toBe(true);
        });

        test('does not throw when awaited directly', async () => {
            // eslint-disable-next-line @typescript-eslint/await-thenable
            const result = await pdaClient.pdas;
            expect(result).toBeDefined();
        });

        test('does not throw when serialized with JSON.stringify', () => {
            expect(() => JSON.stringify(pdaClient.pdas)).not.toThrow();
        });
    });
});
