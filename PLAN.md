# Codama Dynamic Instructions - Visitor-Based Multi-Program Support

## Goal

Build a **visitor-based** system to invoke Solana program instructions at runtime using Codama IDLs, with auto-derived PDA addresses.

**Target API**:

```typescript
const program = createProgramClient(tokenMetadataIdl);

// Step 1: Calculate PDA address using standard Solana tools
// Initially, use getProgramDerivedAddress from @solana/addresses:
import { getProgramDerivedAddress, getUtf8Encoder, getAddressEncoder } from '@solana/addresses';
const { address: metadataAddress } = await getProgramDerivedAddress({
    programAddress: TOKEN_METADATA_PROGRAM_ID,
    seeds: [
        getUtf8Encoder().encode('metadata'),
        getAddressEncoder().encode(TOKEN_METADATA_PROGRAM_ID),
        getAddressEncoder().encode(mintAddress),
    ],
});

// Step 2 (future): When optional PDA API is implemented, use convenience helper instead:
// const metadataAddress = await program.pda.metadata({ mint: mintAddress });

// Step 3: Build instruction - ALL accounts must be explicitly provided
const ix = await program.createMetadataAccountV3(
    { data: metadataData, isMutable: true },
    { metadata: metadataAddress, mint: mintAddress, mintAuthority: authority, payer: payerAddress },
);
```

**Key Design Principles**:

1. **Explicit Accounts**: The instruction builder requires **all accounts to be explicitly provided**. The `program.pda.*` helpers are an **optional convenience API** (Phase 1.5) for calculating PDA addresses, but they are separate from instruction building.

2. **Type Compatibility**: The library uses `@solana/kit` internally but accepts both legacy and modern types:
    - Accepts: `Address` (from `@solana/addresses`) or `PublicKey` (from `@solana/web3.js`)
    - Internally converts `PublicKey` → `Address` using kit helpers
    - Returns: `@solana/kit` types (e.g., `Address`, `IInstruction`)

```typescript
// Example: Accept both Address and PublicKey
import { Address, address } from '@solana/addresses';
import { PublicKey } from '@solana/web3.js';

type AddressInput = Address | PublicKey;

function toAddress(input: AddressInput): Address {
    if (typeof input === 'string') return input as Address;
    if ('toBase58' in input) return address(input.toBase58());
    return input;
}

// Usage - both work:
program.createMetadataAccountV3(args, {
    mint: mintAddress, // Address type
    payer: legacyPublicKey, // PublicKey type - auto-converted
});
```

This approach allows gradual migration from `@solana/web3.js` to `@solana/kit`.

## Scope

**Important**: This project scope covers building **the instruction-building tool only**. The deliverable is a library that can dynamically construct Solana program instructions from Codama IDLs at runtime.

**What is included**:

- Visitor-based instruction builder with PDA address calculation helpers
- Runtime API: `program.<instruction>(args, accounts)` and `program.pda.<name>(seeds)`
- Support for common programs, one by one:
    - System Program,
    - Token Program,
    - Token-2022,
    - ATA,
    - Program Metadata,
    - Token Metadata is pending (waiting for Macroses)
    - ...
- E2E tests against LiteSVM
- Programmatic type safety (validations deferred)

**What is NOT included**:

- Integration with the Explorer

This is a **standalone library**. Integration into Explorer should be done as a separate task.

## Priority

1. Core example (existing Anchor demo)
2. Support SystemProgram
3. PDA derivation (better abstraction)
4. Explorer integration (future, out of scope) aka Demo
5. Type safety (programmatic)
6. Validations for the client (optional, deferred)

## Problem We're Solving

### The Challenge

Currently, to interact with a Solana program, developers either:

1. **Use pre-generated clients** (e.g., `@solana-program/token`) - convenient but requires a package for each program
2. **Manually construct instructions** - error-prone, requires deep knowledge of each program's layout

### Our Solution

Build a **runtime instruction builder** that:

- Takes any Codama IDL as input
- Dynamically generates instruction builders (no code generation needed)
- Auto-derives PDA addresses from the IDL definition
- Works like Anchor's familiar API: `program.methodName(args, accounts)`

### Why Visitor Pattern?

Codama represents programs as a **tree of nodes** (instructions, arguments, accounts, types). The visitor pattern lets us:

- Traverse this tree systematically
- Handle each node type (e.g., `bytesValueNode`, `publicKeyValueNode`) appropriately
- Add new node type support without modifying existing code
- Replace brittle switch-case statements with extensible visitors

## Current State

- Working instruction builder for Anchor programs
- PDA derivation partially implemented (missing value node types)
- Argument encoding via `@codama/dynamic-codecs`
- Builder pattern can be used as internal implementation

---

## Implementation Plan

### Phase 0: Project Setup

- [x] 0.1 Set up pnpm workspace structure (resemble `codama-idl/codama` monorepo)
- [x] 0.2 Create `packages/dynamic-instructions` package for publishing
- [x] 0.3 Configure LiteSVM for test suite
- [x] 0.4 Set up test runner (vitest)
- [ ] 0.5 Flatten src/ structure to plain layout (remove entities/features/shared nesting)
- [ ] 0.6 Document environment setup for contributors

### Phase 1: Visitor Foundation + System Program

- [ ] 1.1 Add `@solana-program/system` dependency
- [x] 1.2 Create `DefaultValueEncoderVisitor` (DONE - exists)
- [x] 1.3 Create `PdaSeedValueVisitor` (DONE - exists)
- [ ] 1.4 Create `AccountDefaultValueVisitor` in `packages/dynamic-instructions/src/`
- [ ] 1.5 Create `createProgramClient()` factory in `packages/dynamic-instructions/src/`
- [ ] 1.6 Create `tests/system-program.spec.ts` with E2E tests (LiteSVM)

### Phase 1.5: PDA Derivation Abstraction

Implement a better abstraction for PDA derivation from Codama IDL seed definitions.

- [ ] 1.5.1 Design PDA derivation abstraction over current `pda.ts` implementation
- [ ] 1.5.2 Implement `program.<method?>.pda.<name>(seeds)` API for PDA address calculation
- [ ] 1.5.3 Add tests for PDA derivation across seed types

> **Note**: The `program.<method?>.pda.<name>(seeds, accounts?, arguments?)` API shape might change. We should decide on the best abstraction before committing to a specific structure.

### Phase 2: Token Program (SPL)

- [ ] 2.1 Extend visitors to handle `sizeDiscriminatorNode` (1-byte instruction tag)
- [ ] 2.2 Add `@solana-program/token` dependency
- [ ] 2.3 Create `tests/token-program.spec.ts` with E2E tests (LiteSVM)

### Phase 3: Token-2022 Program

- [ ] 3.1 Add support for Token Extensions in visitors
- [ ] 3.2 Add `@solana-program/token-2022` dependency
- [ ] 3.3 Create `tests/token-2022.spec.ts` with E2E tests (LiteSVM)

### Phase 4: Associated Token Program

- [ ] 4.1 Implement ATA PDA derivation
- [ ] 4.2 Handle `programLinkNode` for cross-program seeds
- [ ] 4.3 Add `@solana-program/associated-token-account` dependency
- [ ] 4.4 Create `tests/associated-token.spec.ts` with E2E tests (LiteSVM)

### Phase 5: Program Metadata

- [ ] 5.1 Add `@solana-program/program-metadata` dependency
- [ ] 5.2 Implement PDA derivation (based on Phase 1.5)
- [ ] 5.3 Create `tests/program-metadata.spec.ts` with E2E tests (LiteSVM)

### Phase 6: Type Safety & Validation (Deferred)

_Note: Omit validations at first. Focus on programmatic type safety._

- [ ] 6.1 Design pluggable validation interface
- [ ] 6.2 Add validation hooks to `createProgramClient()` options
- [ ] 6.3 Create `tests/validation.spec.ts` with validation enabled/disabled tests

### Phase 7: Polish & Refactor

- [ ] 7.1 Refactor `accounts.ts` to use `AccountDefaultValueVisitor`
- [ ] 7.2 Complete visitor coverage (`conditionalValueNode`, `resolverValueNode`, `accountBumpValueNode`)
- [ ] 7.3 Add TypeScript type generation from IDL

### Phase 9: Token Metadata (Pending — Waiting for Macroses)

_Blocked with external project. Will implement once their results are available._

- [ ] 9.1 Implement Token Metadata PDA derivation
- [ ] 9.2 Add `@solana-program/token-metadata` dependency
- [ ] 9.3 Create `tests/token-metadata.spec.ts` with E2E tests (LiteSVM)

---

## Project Structure

**Note**: Structure is plain — files at the root of `src/`. A submodule can live in a subdirectory if it grows large enough to warrant one (similar to Rust project conventions). No FSD (entities/features/shared) hierarchy.

---

## Success Criteria

| Criteria              | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| Visitor Pattern       | All default value encoding uses visitors, not switch-case         |
| Instruction API       | `program.<instruction>(args, accounts)` for each instruction      |
| Internal Architecture | Builder pattern used as internal implementation                   |
| PDA Derivation API    | `program.pda.<name>(seeds)` to calculate PDA addresses from seeds |
| E2E Test Suites       | Each program has tests running against LiteSVM                    |

---

## Program Support Matrix

**Core Programs** (mandatory):

| Program          | Package                                    | Status  |
| ---------------- | ------------------------------------------ | ------- |
| System Program   | `@solana-program/system`                   | Planned |
| Token Program    | `@solana-program/token`                    | Planned |
| Token-2022       | `@solana-program/token-2022`               | Planned |
| Associated Token | `@solana-program/associated-token-account` | Planned |
| Program Metadata | `@solana-program/program-metadata`         | Planned |

**Pending — Blocked with External Project** (last, after refactor):

| Program        | Package                          | Status               |
| -------------- | -------------------------------- | -------------------- |
| Token Metadata | `@solana-program/token-metadata` | Waiting for Macroses |

**Future Directions** (not in current scope):

| Program                 | Package                                   | Status                                               |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Metaplex Token Metadata | `@metaplex-foundation/mpl-token-metadata` | Not a native program; Metaplex maintains own clients |

---

# Explanations

## Technical Considerations

### Codama Dependency Strategy

We may need to work within a fork of Codama, but want to **minimize reliance on Codama internals**:

- Prefer public APIs from `codama`, `@codama/nodes`, `@codama/dynamic-codecs`
- Isolate internal dependencies behind abstraction layers
- Document any internal dependencies

### Validation Strategy

- `@codama/validation` package appears outdated
- **Validation is deferred** — focus on programmatic type safety first
- We might not need superstruct — consider runtime type safety tools like `io-ts`, `typia`, or similar
- Validation hel;pers might be exported from the project to use where needed

### Code TODOs in `packages/dynamic-instructions/src/`

**`pda.ts`** - PDA Seed Resolution:

- Currently supports: `accountValueNode`, `argumentValueNode`
- Missing: `arrayValueNode`, `bytesValueNode`, `booleanValueNode`, `constantValueNode`, `enumValueNode`, `mapValueNode`, `noneValueNode`, `numberValueNode`, `publicKeyValueNode`, `setValueNode`, `someValueNode`, `stringValueNode`, `structValueNode`, `tupleValueNode`
- Docs: [ValueNodes](https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/valueNodes/README.md)

**`accounts.ts`** - Account Default Value Resolution:

- Currently supports: `pdaValueNode`, `publicKeyValueNode`
- Missing: `accountBumpValueNode`, `accountValueNode`, `argumentValueNode`, `conditionalValueNode`, `identityValueNode`, `payerValueNode`, `programIdValueNode`, `resolverValueNode`
- Docs: [InstructionAccountNode](https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionAccountNode.md)

**`arguments.ts`** - Argument Encoding:

- Currently supports: `bytesValueNode` (for discriminators)
- Missing: `accountBumpValueNode`, `accountValueNode`, `argumentValueNode`, `arrayValueNode`, `booleanValueNode`, `conditionalValueNode`, `constantValueNode`, `enumValueNode`
- Docs: [InstructionArgumentNode](https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionArgumentNode.md)

**`validators.ts`** - Type Validation:

- TODO: Handle `prefixedCountNode` for arrays/maps
- Missing type nodes: `amountTypeNode`, `solAmountTypeNode`, `hiddenPrefixTypeNode`, `hiddenSuffixTypeNode`, `remainderOptionTypeNode`, `sentinelTypeNode`, `postOffsetTypeNode`, `preOffsetTypeNode`, `sizePrefixTypeNode`, `enumTypeNode`
- Docs: [TypeNode](https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/README.md)

---

## Implementation Estimate

| Phase     | Description                         | Min    | Max    | Notes                |
| --------- | ----------------------------------- | ------ | ------ | -------------------- |
| Phase 0   | Project Setup                       | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 1   | Visitor Foundation + System Program | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 1.5 | PDA Derivation Abstraction          | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 2   | Token Program (SPL)                 | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 3   | Token-2022 Program                  | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 4   | Associated Token Program            | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 5   | Program Metadata                    | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 6   | Type Safety & Validation (Deferred) | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 7   | Polish & Refactor                   | \_\_\_ | \_\_\_ | \_\_\_               |
| Phase 9   | Token Metadata (Pending)            | \_\_\_ | \_\_\_ | Waiting for Macroses |

### Risk Factors (may increase estimates)

- **High**: Undocumented Codama node types requiring reverse engineering
- **Medium**: Edge cases in PDA derivation for complex programs
- **Medium**: Breaking changes in `@solana-program/*` packages

## What's Next / Future Directions

### Metaplex Token Metadata

_Not a native program. Metaplex maintains their own clients._

- Implement complex PDA derivation (metadata, edition)
- Add `@metaplex-foundation/mpl-token-metadata` dependency
- E2E tests (LiteSVM)
