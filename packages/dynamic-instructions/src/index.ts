export { isPublicKeyLike, toAddress } from './shared/address';
export type { AddressInput, PublicKeyLike } from './shared/address';

export { CodamaError, ValidationError, AccountError, ArgumentError } from './shared/errors';

export type { AccountsInput, ArgumentsInput } from './shared/types';

export { createProgramClient } from './features/program-client/create-program-client';
export type {
    CreateProgramClientOptions,
    IdlInput,
    ProgramClient,
    ProgramMethodBuilder,
} from './features/program-client/create-program-client';

export { toLegacyAccountMeta, toLegacyTransactionInstruction, toVersionedTransaction } from './features/compat/web3js';
export type { ToVersionedTransactionOptions } from './features/compat/web3js';
