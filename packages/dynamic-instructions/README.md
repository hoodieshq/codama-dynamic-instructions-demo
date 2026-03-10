# @hoodieshq/dynamic-instructions

Runtime Solana instruction builder from [Codama](https://github.com/codama-idl/codama) IDLs — no code generation required.

## Overview

Build type-safe `Instruction` objects (from `@solana/instructions`) at runtime from any Codama IDL. Designed for Explorer UIs where users interact with arbitrary Solana programs without pre-generated client code.

- Works with `@solana/kit` natively
- Auto-derives PDA accounts, resolves defaults, encodes discriminators
- Optional type generation for full TypeScript type safety

## Installation

```bash
pnpm add @hoodieshq/dynamic-instructions
```

## Quick Start

### Untyped (no code generation)

```typescript
import { createProgramClient } from '@hoodieshq/dynamic-instructions';
import idl from './my-program-idl.json';

const client = createProgramClient(idl);

const instruction = await client.methods
    .transferSol({ amount: 1_000_000_000 })
    .accounts({ source: senderAddress, destination: receiverAddress })
    .instruction();
```

### Typed (with generated types)

```typescript
import { createProgramClient } from '@hoodieshq/dynamic-instructions';
import type { MyProgramClient } from './generated/my-program-types';
import idl from './my-program-idl.json';

const client = createProgramClient<MyProgramClient>(idl);
// client.methods, .accounts(), args are now fully typed
```

## API Reference

### `createProgramClient<T>(idl, options?)`

Creates a program client from a Codama IDL.

| Parameter           | Type               | Description                               |
| ------------------- | ------------------ | ----------------------------------------- |
| `idl`               | `object \| string` | Codama IDL object or JSON string          |
| `options.programId` | `AddressInput`     | Override the program address from the IDL |

Returns a `ProgramClient` (or `T` when a type parameter is provided).

### `ProgramClient`

```typescript
type InstructionName = CamelCaseString;
type AccountName = CamelCaseString;

type ProgramClient = {
    methods: Record<InstructionName, (args?) => ProgramMethodBuilder>;
    pdas: Record<AccountName, (seeds?) => Promise<ProgramDerivedAddress>>;
    programAddress: Address;
    instructions: Map<InstructionName, InstructionNode>;
    root: RootNode;
};
```

### `ProgramMethodBuilder` (fluent API)

```typescript
client.methods
    .myInstruction(args) // provide instruction arguments
    .accounts(accounts) // provide account addresses
    .signers(['accountName']) // optionally mark ambiguous accounts as signers
    .resolvers({ customResolver: async (argumentsInput, accountsInput) => {} }) // optionally provide custom resolver according to resolverValueNode in IDL
    .instruction(); // Promise<Instruction>
```

### `AddressInput`

Accepts any of:

- `Address` (from `@solana/addresses`)
- Legacy `PublicKey` (any object with `.toBase58()`)
- Base58 string

## Accounts

### Automatic resolution rules

Accounts (pda, program ids) with `defaultValue` are resolved automatically, hence can be omitted.

| Account scenario                                             | Type in `.accounts()`                 | Auto resolution                                                                              |
| ------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Required account without `defaultValue`                      | `{ systemProgram: Address }`          | Must be provided                                                                             |
| Required account with `defaultValue` (PDA, programId, etc.)  | `{ systemProgram?: Address }`         | Auto-resolved to `defaultValue` if omitted                                                   |
| Optional account (`isOptional: true`) without `defaultValue` | `{ systemProgram: Address \| null }`  | Resolved via `optionalAccountStrategy`, when provided as `null`                              |
| Optional account (`isOptional: true`) with `defaultValue`    | `{ systemProgram?: Address \| null }` | - `null` resolves via `optionalAccountStrategy`<br>- `undefined` resolves via `defaultValue` |

### Auto-derived accounts

Accounts with `defaultValue` in the IDL are automatically resolved when omitted from `.accounts()`. This includes:

- **PDA accounts** — derived from seeds defined in the IDL
- **Program IDs** — resolved to known program addresses (e.g., System Program, Token Program)
- **Constants** — resolved from constant value nodes

You can always override auto-derived accounts by providing an explicit address.

### Optional accounts

Pass `null` for optional accounts to be resolved according to `optionalAccountStrategy` (either will be `omitted` or replaced on `programId`):

```typescript
.accounts({
    authority,
    program: programAddress,
    programData: null,  // optional - resolved via optionalAccountStrategy
})
```

### Ambiguous signers

When an account has `isSigner: 'either'` in the IDL, use `.signers()` to explicitly mark it:

```typescript
.accounts({ owner: ownerAddress })
.signers(['owner'])
```

### Custom resolvers

When an account or argument is `resolverValueNode` in the IDL, provide a custom resolver function `.resolvers({ [resolverName]: async fn })` to help with account/arguments resolution:

```typescript
client.methods
    .create({ tokenStandard: 'NonFungible' })
    .accounts({ owner: ownerAddress })
    .resolvers({
        resolveIsNonFungible: async (argumentsInput, accountsInput) => {
            return argumentsInput.tokenStandard === 'NonFungible';
        },
    });
```

## PDA Derivation

### Standalone

```typescript
const [address, bump] = await client.pdas.canonical({
    program: programAddress,
    seed: 'idl',
});
```

### Auto-derived in instructions

Accounts with `pdaValueNode` defaults are resolved automatically. Seeds are pulled from other accounts and arguments in the instruction:

```typescript
// metadata PDA is auto-derived from program + seed
const ix = await client.methods
    .initialize({ seed: 'idl', data: myData /* ... */ })
    .accounts({ authority, program: programAddress, programData })
    .instruction();
```

Nested/dependent PDAs (where one PDA seed references another PDA) are resolved recursively.

## Arguments

Arguments with `defaultValueStrategy: 'omitted'` (e.g., discriminators) are auto-encoded and should not be provided.

## Error Handling

All errors extend `DynamicInstructionsError`:

| Error             | When                                                                |
| ----------------- | ------------------------------------------------------------------- |
| `ValidationError` | Invalid argument type or missing required argument                  |
| `AccountError`    | Missing required account, circular dependency in account resolution |
| `ArgumentError`   | Argument encoding failure                                           |

```typescript
import { DynamicInstructionsError, AccountError } from '@hoodieshq/dynamic-instructions';

try {
    const ix = await client.methods.transferSol({ amount: 100 }).accounts({}).instruction();
} catch (err) {
    if (err instanceof AccountError) {
        console.error('Account resolution failed:', err.message);
    }
}
```

## CLI

The package includes a CLI for generating TypeScript types from Codama IDL files.

```bash
npx @hoodieshq/dynamic-instructions generate-program-client-types <codama-idl.json> <output-dir>
```

Example:

```bash
npx @hoodieshq/dynamic-instructions generate-program-client-types ./idl/codama.json ./generated
```

This reads the IDL file and writes a `*-types.ts` file to the output directory containing strongly-typed interfaces for all instructions, accounts, arguments, PDAs, and the program client.

### `generateProgramClientType(idl)`

The same is available as a typescript function:

```typescript
import { generateProgramClientType } from '@hoodieshq/dynamic-instructions';
import type { IdlRoot } from '@hoodieshq/dynamic-instructions';
import { readFileSync, writeFileSync } from 'node:fs';

const idl: IdlRoot = JSON.parse(readFileSync('./idl.json', 'utf-8'));
const typesSource = generateProgramClientType(idl);
writeFileSync('./generated/my-program-types.ts', typesSource);
```

## Utilities

```typescript
import { toAddress, isPublicKeyLike } from '@hoodieshq/dynamic-instructions';

// Convert any AddressInput to Address
const addr = toAddress('11111111111111111111111111111111');
const addr2 = toAddress(new PublicKey('...'));

// Type guard for legacy PublicKey objects
if (isPublicKeyLike(value)) {
    const addr = toAddress(value);
}
```
