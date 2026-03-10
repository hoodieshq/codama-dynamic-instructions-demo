# Codama Dynamic Instructions Demo

A visitor-based library that builds Solana program instructions at runtime from [Codama](https://github.com/codama-idl/codama) IDLs. See [PLAN.md](./PLAN.md) for design and roadmap.

## Prerequisites

- **Node.js** — see [package.json](./package.json) `engines.node`
- **pnpm** — see [package.json](./package.json) `packageManager`; install: `npm install -g pnpm` or use [corepack](https://nodejs.org/api/corepack.html): `corepack enable && corepack prepare pnpm@<version> --activate` (version in [package.json](./package.json))

To run the full test suite (including Anchor E2E tests):

- **Rust** (stable)
- **Solana CLI** — [install](https://docs.solana.com/cli/install-solana-cli-tools); Recommended version `^3.1`
- **Anchor CLI** — see [tests/anchor/programs/example/Cargo.toml](./packages/dynamic-instructions/tests/anchor/programs/example/Cargo.toml) `anchor-lang`; install via [AVM](https://www.anchor-lang.com/docs/installation):  
  `cargo install --git https://github.com/coral-xyz/anchor avm --locked` then `avm install <version> && avm use <version>` (version in Cargo.toml)

## Getting started

```bash
# Clone and enter the repo
cd codama-dynamic-instrucitons-demo

# Install dependencies (from repo root)
pnpm install

# Build all packages
pnpm build
```

## Development

| Command         | Description                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm build`    | Build all packages (Turbo).                                                                            |
| `pnpm test`     | Run full test pipeline (Anchor build, IDL generation, typecheck, build, tree-shake check, unit tests). |
| `pnpm lint`     | Lint all packages.                                                                                     |
| `pnpm lint:fix` | Fix lint and format with Prettier.                                                                     |

### Working on the library only

From repo root:

```bash
# Build the dynamic-instructions package
pnpm --filter @hoodieshq/dynamic-instructions build

# Run tests (requires Anchor + Solana CLI; builds Anchor program and generates IDL first)
pnpm --filter @hoodieshq/dynamic-instructions test

# Watch mode: run unit tests on change (no Anchor build)
pnpm --filter @hoodieshq/dynamic-instructions dev
```

From `packages/dynamic-instructions`:

```bash
cd packages/dynamic-instructions

pnpm build
pnpm test          # full pipeline
pnpm dev           # vitest watch (unit tests only)
pnpm lint
pnpm lint:fix
```

### First-time test setup

The test suite builds the Anchor example program and generates a Codama IDL from it. Ensure Anchor and Solana CLI are on your `PATH`, then:

```bash
pnpm test
```

This will:

1. Run `anchor build` in `packages/dynamic-instructions/tests/anchor/`
2. Generate Codama IDLs from the Anchor IDL for Anchor programs in `tests` folder
3. Generate client type files in `tests/generated/*-types.ts` used by the tests
4. Typecheck, build the library, run tree-shakability checks, then run unit and E2E tests (LiteSVM)

### Lint / typecheck without full test

```bash
pnpm build
pnpm lint
```

Typecheck only (in the library package):

```bash
cd packages/dynamic-instructions
pnpm test:setup        # or: pnpm generate-program-types
pnpm test:types
```

## Features

### Strongly-Typed Program Client

Generate strongly-typed clients from Codama IDLs using the CLI:

```bash
npx @hoodieshq/dynamic-instructions generate-program-client-types ./idl.json ./generated
```

Or programmatically:

```typescript
import { generateProgramClientType } from '@hoodieshq/dynamic-instructions';
import { readFileSync, writeFileSync } from 'node:fs';

const idl = JSON.parse(readFileSync('./idl.json', 'utf-8'));
writeFileSync('./generated/my-program-types.ts', generateProgramClientType(idl));
```

Then use the generated types with `createProgramClient`:

```typescript
import { createProgramClient } from '@hoodieshq/dynamic-instructions';
import type { ExampleProgramClient } from './generated/example-idl-types';
import idl from './my-program-idl.json';

// Create strongly-typed client
const client = createProgramClient<ExampleProgramClient>(idl);

const ix = await client.methods
    .yourInstruction({ arg1: 42 }) // typed methods and arguments
    .accounts({ account1: address }) // typed accounts
    .instruction();
```

**Benefits:**

- ✅ Full type safety - catches errors at compile time
- ✅ Works with runtime-loaded IDLs
- ✅ Autocomplete for methods, arguments, and accounts
- ✅ Generated from your IDL

**Documentation:**

- [README.md](./packages/dynamic-instructions/README.md)
- [tests](./packages/dynamic-instructions/tests/) - Working examples

## Project structure

- **Root** — Monorepo: pnpm workspace, Turbo, ESLint, Prettier, Vitest base config.
- **`packages/dynamic-instructions/`** — The library: `createProgramClient(idl)`, instruction encoding (visitors, PDA, accounts, arguments), CLI.
- **`packages/dynamic-instructions/tests/`** — Tests folder, contains tests for multiple programs.

## License

See repository license.
