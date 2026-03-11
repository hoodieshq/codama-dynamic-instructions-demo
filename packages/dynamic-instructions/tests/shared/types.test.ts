import type { Address } from '@solana/addresses';
import type { Instruction } from '@solana/instructions';
import { describe, expectTypeOf, test } from 'vitest';

import type { AddressInput } from '../../src/shared/address';
import type {
    AccountsInput,
    ArgumentsInput,
    BuildIxFn,
    EitherSigners,
    ResolutionPath,
    ResolverFn,
    ResolversInput,
} from '../../src/shared/types';

describe('AccountsInput', () => {
    test('accepts partial record of string to AddressInput | null', () => {
        expectTypeOf<AccountsInput>().toExtend<Partial<Record<string, AddressInput | null>>>();
    });

    test('allows null values for optional accounts', () => {
        expectTypeOf<{ mint: null }>().toExtend<AccountsInput>();
    });

    test('allows AddressInput values', () => {
        expectTypeOf<{ mint: Address }>().toExtend<AccountsInput>();
    });

    test('allows partial (missing keys)', () => {
        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        expectTypeOf<{}>().toExtend<AccountsInput>();
    });
});

describe('ArgumentsInput', () => {
    test('accepts partial record of string to unknown', () => {
        expectTypeOf<ArgumentsInput>().toExtend<Partial<Record<string, unknown>>>();
    });

    test('allows any value types', () => {
        expectTypeOf<{ amount: bigint; name: string }>().toExtend<ArgumentsInput>();
    });
});

describe('EitherSigners', () => {
    test('is an array of strings', () => {
        expectTypeOf<EitherSigners>().toEqualTypeOf<string[]>();
    });
});

describe('ResolutionPath', () => {
    test('is a readonly array of strings', () => {
        expectTypeOf<ResolutionPath>().toEqualTypeOf<readonly string[]>();
    });
});

describe('ResolverFn', () => {
    test('accepts arguments and accounts input and returns Promise<unknown>', () => {
        expectTypeOf<ResolverFn>().toBeFunction();
        expectTypeOf<ResolverFn>().parameters.toEqualTypeOf<[ArgumentsInput, AccountsInput]>();
        expectTypeOf<ResolverFn>().returns.toEqualTypeOf<Promise<unknown>>();
    });
});

describe('ResolversInput', () => {
    test('is a record of string to ResolverFn', () => {
        expectTypeOf<ResolversInput>().toEqualTypeOf<Record<string, ResolverFn>>();
    });
});

describe('BuildIxFn', () => {
    test('returns a Promise of Instruction', () => {
        expectTypeOf<BuildIxFn>().returns.toEqualTypeOf<Promise<Instruction>>();
    });

    test('all parameters are optional', () => {
        // Should be callable with no arguments
        expectTypeOf<BuildIxFn>().toBeCallableWith();
    });

    test('accepts all four parameters', () => {
        expectTypeOf<BuildIxFn>().toBeCallableWith({}, {}, [], {});
    });
});
