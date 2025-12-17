# Codama Dynamic Instructions - Visitor-Based Multi-Program Support

## Goal
Build a **visitor-based** system to invoke Solana program instructions at runtime using Codama IDLs, with auto-derived PDA addresses.

**Target API**:
```typescript
const program = createProgramClient(tokenMetadataIdl);

// Step 1: Calculate PDA address using standard Solana tools
// Initially, use @solana/addresses or similar:
import { getProgramDerivedAddress } from '@solana/addresses';
const [metadataAddress] = await getProgramDerivedAddress({
  programAddress: TOKEN_METADATA_PROGRAM_ID,
  seeds: ['metadata', TOKEN_METADATA_PROGRAM_ID, mintAddress],
});

// Step 2 (future): When optional PDA API is implemented, use convenience helper instead:
// const metadataAddress = await program.pda.metadata({ mint: mintAddress });

// Step 3: Build instruction - ALL accounts must be explicitly provided
const ix = await program.createMetadataAccountV3(
  { data: metadataData, isMutable: true },
  { metadata: metadataAddress, mint: mintAddress, mintAuthority: authority, payer: payerAddress }
);
```

**Key Design Principle**: The instruction builder requires **all accounts to be explicitly provided**. The `program.pda.*` helpers are an **optional convenience API** (Phase 1.5) for calculating PDA addresses, but they are separate from instruction building. Users can:
1. Use standard Solana tools (`@solana/addresses`, `getProgramDerivedAddress`) - **required initially**
2. Use `program.pda.*` helpers when implemented - **optional future convenience**
3. Use pre-known addresses directly

This explicit approach avoids hidden magic and makes the data flow clear.

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
- Validation exists (superstruct) but should be optional/pluggable

---

## Implementation Plan

### Phase 0: Project Setup
- [ ] 0.1 Set up pnpm workspace structure (resemble `codama-idl/codama` monorepo)
- [ ] 0.2 Create `packages/dynamic-instructions` package for publishing
- [ ] 0.3 Configure `solana-test-validator` for test suite
- [ ] 0.4 Set up test runner (vitest)
- [ ] 0.5 Create test utilities (airdrop, transaction helpers, etc.)
- [ ] 0.6 Document environment setup for contributors

### Phase 1: Visitor Foundation + System Program
- [ ] 1.1 Create `DefaultValueEncoderVisitor` in `codama/lib/visitors/`
- [ ] 1.2 Create `PdaSeedValueVisitor` in `codama/lib/visitors/`
- [ ] 1.3 Create `AccountDefaultValueVisitor` in `codama/lib/visitors/`
- [ ] 1.4 Create PDA Derivation API (`program.pda.<name>(seeds)`)
- [ ] 1.5 Create `createProgramClient()` factory in `codama/lib/client.ts`
- [ ] 1.6 Add `@solana-program/system` dependency
- [ ] 1.7 Create `tests/system-program.spec.ts` with E2E tests (local validator)

### Phase 1.5: PDA Derivation Spike
Investigate how to provide `program.pda.<name>(seeds)` API for calculating PDA addresses from IDL.
- [ ] 1.5.1 **(Spike)** Investigate how to derive PDA addresses from Codama IDL seed definitions
- [ ] 1.5.2 Document findings for ATA, Token Metadata, Program Metadata PDAs
- [ ] 1.5.3 Implement `program.pda.<name>(seeds)` API for PDA address calculation

### Phase 2: Token Program (SPL)
- [ ] 2.1 Extend visitors to handle `sizeDiscriminatorNode` (1-byte instruction tag)
- [ ] 2.2 Add `@solana-program/token` dependency
- [ ] 2.3 Create `tests/token-program.spec.ts` with E2E tests (local validator)

### Phase 3: Token-2022 Program
- [ ] 3.1 Add support for Token Extensions in visitors
- [ ] 3.2 Add `@solana-program/token-2022` dependency
- [ ] 3.3 Create `tests/token-2022.spec.ts` with E2E tests (local validator)

### Phase 4: Associated Token Program
- [ ] 4.1 Implement ATA PDA derivation (`program.pda.associatedToken({ wallet, mint })`)
- [ ] 4.2 Handle `programLinkNode` for cross-program seeds
- [ ] 4.3 Add `@solana-program/associated-token-account` dependency
- [ ] 4.4 Create `tests/associated-token.spec.ts` with E2E tests (local validator)

### Phase 5: Token Metadata Program
- [ ] 5.1 Implement Token Metadata PDA derivation (`program.pda.metadata({ mint })`)
- [ ] 5.2 Add `@solana-program/token-metadata` dependency
- [ ] 5.3 Create `tests/token-metadata.spec.ts` with E2E tests (local validator)

### Phase 6: Metaplex Token Metadata (Optional)
- [ ] 6.1 Implement complex PDA derivation (`metadata`, `edition`)
- [ ] 6.2 Add `@metaplex-foundation/mpl-token-metadata` dependency
- [ ] 6.3 Create `tests/metaplex.spec.ts` with E2E tests (local validator)

### Phase 7: Program Metadata Program
- [ ] 7.1 Add `@solana-program/program-metadata` dependency
- [ ] 7.2 Implement PDA derivation (based on Phase 1.5 spike)
- [ ] 7.3 Create `tests/program-metadata.spec.ts` with E2E tests (local validator)

### Phase 8: Validation (Optional/Pluggable)
- [ ] 8.1 Design pluggable validation interface (barebone impl should work without validator)
- [ ] 8.2 Implement superstruct-based validator as optional plugin
- [ ] 8.3 Add validation hooks to `createProgramClient()` options
- [ ] 8.4 Create `tests/validation.spec.ts` with validation enabled/disabled tests

### Phase 9: Polish & Refactor
- [ ] 9.1 Refactor `arguments.ts` to use `DefaultValueEncoderVisitor`
- [ ] 9.2 Refactor `pda.ts` to use `PdaSeedValueVisitor`
- [ ] 9.3 Refactor `accounts.ts` to use `AccountDefaultValueVisitor`
- [ ] 9.4 Complete visitor coverage (`conditionalValueNode`, `resolverValueNode`, `accountBumpValueNode`)
- [ ] 9.5 Add TypeScript type generation from IDL

---

## Project Structure (pnpm Workspace + Feature-Sliced Design)

```
# Monorepo structure (resembles codama-idl/codama)
packages/
├── dynamic-instructions/           # Main publishable package
│   ├── src/
│   │   ├── index.ts                # Public API exports
│   │   │
│   │   ├── entities/               # Core domain entities
│   │   │   ├── visitors/           # Visitor implementations
│   │   │   │   ├── index.ts
│   │   │   │   ├── default-value-encoder.ts
│   │   │   │   ├── pda-seed-value.ts
│   │   │   │   └── account-default-value.ts
│   │   │   ├── builders/           # Internal instruction builders
│   │   │   │   ├── index.ts
│   │   │   │   └── instruction-builder.ts
│   │   │   └── validators/         # Validation logic
│   │   │       ├── index.ts
│   │   │       └── type-validators.ts
│   │   │
│   │   ├── features/               # Feature modules
│   │   │   ├── pda-derivation/
│   │   │   │   ├── index.ts
│   │   │   │   ├── derive-pda.ts
│   │   │   │   └── seed-resolver.ts
│   │   │   ├── instruction-encoding/
│   │   │   │   ├── index.ts
│   │   │   │   ├── encode-arguments.ts
│   │   │   │   └── encode-accounts.ts
│   │   │   └── program-client/
│   │   │       ├── index.ts
│   │   │       └── create-program-client.ts
│   │   │
│   │   └── shared/                 # Shared utilities
│   │       ├── types.ts
│   │       ├── errors.ts
│   │       └── util.ts
│   │
│   ├── package.json
│   └── tsconfig.json

tests/                              # E2E tests (root level)
├── system-program.spec.ts
├── token-program.spec.ts
├── token-2022.spec.ts
├── associated-token.spec.ts
├── token-metadata.spec.ts
├── program-metadata.spec.ts
└── metaplex.spec.ts (optional)

pnpm-workspace.yaml                 # Workspace config
```

---

## Success Criteria

| Criteria | Description |
|----------|-------------|
| Visitor Pattern | All default value encoding uses visitors, not switch-case |
| Instruction API | `program.<instruction>(args, accounts)` for each instruction |
| Internal Architecture | Builder pattern used as internal implementation |
| PDA Derivation API | `program.pda.<name>(seeds)` to calculate PDA addresses from seeds |
| E2E Test Suites | Each program has tests running against local validator |

---

## Program Support Matrix

| Program | Package | Priority |
|---------|---------|----------|
| System Program | `@solana-program/system` | Mandatory |
| Token Program | `@solana-program/token` | Mandatory |
| Token-2022 | `@solana-program/token-2022` | Mandatory |
| Associated Token | `@solana-program/associated-token-account` | Mandatory |
| Token Metadata | `@solana-program/token-metadata` | Mandatory |
| Program Metadata | `@solana-program/program-metadata` | Mandatory |
| Metaplex Token Metadata | `@metaplex-foundation/mpl-token-metadata` | Optional |
| Bubblegum | `@metaplex-foundation/mpl-bubblegum` | TBD |
| Candy Machine | `@metaplex-foundation/mpl-candy-machine` | TBD |

*Note: Metaplex programs are optional as Metaplex maintains their own clients*

---

# Explanations

## Architecture: Visitor Pattern

Use Codama's visitor pattern to traverse IDL nodes and build instructions. The visitor receives the IDL and returns an instance with each instruction accessible.

```typescript
// Visitor for encoding default values
export function createDefaultValueEncoderVisitor(codec: any): Visitor<ReadonlyUint8Array> {
  return {
    visitBytesValue: (node) => codec.encode([node.encoding, node.data]),
    visitBooleanValue: (node) => codec.encode(node.value),
    visitNumberValue: (node) => codec.encode(node.value),
    visitDefault: (node) => {
      throw new Error(`Encoding for "${node.kind}" not yet supported`);
    },
  };
}
```

### Visitor Hierarchy
1. **DefaultValueEncoderVisitor** - Encode argument default values
2. **PdaSeedValueVisitor** - Resolve PDA seed values from accounts/arguments
3. **AccountDefaultValueVisitor** - Resolve account default values (PDAs, pubkeys)
4. **InstructionBuilderVisitor** - Traverse instruction node and build full instruction

---

## Phase Details

### Phase 0: Project Setup

**0.1-0.2: pnpm Workspace Structure**
Set up monorepo structure resembling `codama-idl/codama` for easy migration:
```
packages/
├── dynamic-instructions/     # Main package for publishing
│   ├── src/
│   │   ├── entities/
│   │   ├── features/
│   │   └── shared/
│   ├── package.json
│   └── tsconfig.json
└── ...                       # Future packages if needed
```
- Enables publishing as `@codama/dynamic-instructions` or similar
- Allows easy migration to Codama fork if needed

**0.3: Local Validator Setup**
- Use `solana-test-validator` (TypeScript requires full Solana RPC compatibility)
- Set up scripts in `package.json`

**0.4-0.5: Test Infrastructure**
- Use `vitest` for test runner
- Create helpers: `airdrop()`, `sendTransaction()`, `waitForConfirmation()`

**0.6: Documentation**
- Document how to run tests locally
- CI/CD configuration if needed

### Phase 1: Visitor Foundation + System Program

**1.1-1.3: Create Visitors**
Replace switch-case logic with proper visitor pattern:
- `DefaultValueEncoderVisitor` - replaces switch in `arguments.ts`
- `PdaSeedValueVisitor` - replaces switch in `pda.ts`
- `AccountDefaultValueVisitor` - replaces switch in `accounts.ts`

**1.4: PDA Derivation API**
Expose `findProgramAddress` for each PDA defined in the IDL:
- Parse `pdas` array from IDL's `ProgramNode`
- Generate methods like `program.pda.metadata({ mint })`
- Handle all seed types: constant, variable (account/argument based)

**1.5: ProgramClient Factory**
Main entry point that uses visitors internally and exposes:
- Instruction methods: `program.transfer(args, accounts)`
- PDA derivation: `program.pda.<pdaName>(seeds)`
- Uses builder pattern internally for abstraction

**1.7: System Program E2E Tests**
- Test `transfer` - basic SOL transfer
- Test `createAccount` - create new account with space
- Test `allocate` - allocate space to account

### Phase 2: Token Program

**2.1: Token Discriminator Format**
Token Program uses 1-byte instruction tag, not Anchor's 8-byte discriminator.
Extend visitors to handle `sizeDiscriminatorNode`.

**2.3: Token Program E2E Tests**
- Test `initializeMint`, `initializeAccount`, `transfer`, `mintTo`

### Phase 4: Associated Token Program

**4.1: ATA PDA Derivation**
- Seeds: `[wallet, TOKEN_PROGRAM_ID, mint]`
- Expose via `program.pda.associatedToken({ wallet, mint })`

**4.2: programLinkNode**
Handle cross-program seeds for PDAs that reference other programs.

### Phase 7: Metaplex Token Metadata

**7.1: Complex PDA Derivation**
- Metadata PDA: `["metadata", METADATA_PROGRAM_ID, mint]`
- Edition PDA: `["metadata", METADATA_PROGRAM_ID, mint, "edition"]`

---

## Technical Considerations

### Codama Dependency Strategy
We may need to work within a fork of Codama, but want to **minimize reliance on Codama internals**:
- Prefer public APIs from `codama`, `@codama/nodes`, `@codama/dynamic-codecs`
- Isolate internal dependencies behind abstraction layers
- Document any internal dependencies

### Validation Strategy
- `@codama/validation` package appears outdated
- **Validation is optional** for our scope
- Continue using `superstruct` for validation (see `validators.ts`)
- Validation can be enabled/disabled by users

### Code TODOs in `codama/lib/`

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

| Phase | Description | Min | Max | Notes |
|-------|-------------|-----|-----|-------|
| **Phase 0** | Project Setup | 1 day | 2 days | pnpm workspace + local validator |
| **Phase 1** | Visitor Foundation + System Program | 4 days | 6 days | Core architecture, most complex phase |
| **Phase 1.5** | PDA Auto-Derivation Spike | 2 days | 3 days | Investigate ATA, Token Metadata, Program Metadata |
| **Phase 2** | Token Program (SPL) | 1 day | 2 days | Extend discriminator handling |
| **Phase 3** | Token-2022 Program | 1 day | 2 days | Similar to Phase 2, add extensions |
| **Phase 4** | Associated Token Program | 1 day | 2 days | Cross-program PDA derivation |
| **Phase 5** | Token Metadata Program | 1 day | 2 days | Additional PDA patterns |
| **Phase 6** | Metaplex Token Metadata (Optional) | 1 day | 2 days | Complex PDAs, optional |
| **Phase 7** | Program Metadata Program | 1 day | 2 days | Uses Phase 1.5 spike findings |
| **Phase 8** | Validation (Optional/Pluggable) | 1 day | 2 days | Pluggable validator interface |
| **Phase 9** | Polish & Refactor | 2 days | 4 days | Refactoring, type safety, cleanup |
| | | | | |
| **Total (Mandatory)** | Phases 0-1.5, 2-5, 7, 9 | **14 days** | **26 days** | ~3-5 weeks |
| **Total (With Optional)** | All phases | **16 days** | **30 days** | ~3-6 weeks |

### Assumptions
- Single developer working on the project
- Familiarity with Solana development
- Local validator environment already set up
- No major blockers with Codama internals

### Risk Factors (may increase estimates)
- **High**: Undocumented Codama node types requiring reverse engineering
- **Medium**: Edge cases in PDA derivation for complex programs
- **Medium**: Breaking changes in `@solana-program/*` packages
- **Low**: Local validator flakiness in E2E tests
