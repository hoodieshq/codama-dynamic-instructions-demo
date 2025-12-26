import type { Instruction } from '@solana/instructions';
import type { AddressInput } from './address';

// Note: optional accounts may be explicitly set to null.
export type AccountsInput = Partial<Record<string, AddressInput | null>>;
export type ArgumentsInput = Partial<Record<string, unknown>>;

type TBuildIxFn<TInstruction> = (
    argumentsInput?: ArgumentsInput,
    accountsInput?: AccountsInput
) => Promise<TInstruction>;
export type BuildIxFn = TBuildIxFn<Instruction>;
