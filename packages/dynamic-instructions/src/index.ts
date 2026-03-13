export type { ProgramDerivedAddress } from '@solana/addresses';

export { isPublicKeyLike, toAddress } from './shared/address';
export type { AddressInput, PublicKeyLike } from './shared/address';

export { DynamicInstructionsError, ValidationError, AccountError, ArgumentError } from './shared/errors';

export type { AccountsInput, ArgumentsInput } from './shared/types';

export { createProgramClient } from './features/program-client/create-program-client';
export type {
    CreateProgramClientOptions,
    IdlInput,
    ProgramClient,
    ProgramMethodBuilder,
} from './features/program-client/create-program-client';

export { generateClientTypes } from './cli/commands/generate-client-types/generate-client-types';
export type { IdlRoot } from './cli/commands/generate-client-types/generate-client-types';
