## Setup

```bash
pnpm i --frozen-lockfile
pnpm re-build
anchor t
```

## Current state

- Instruction builder
	- validates accounts and arguments
	- returns accountsData and argumentsData to build TransactionInstruction
- Test-suite and Reference program built with Anchor (example)
	- check that we can build Transactions with new builder in the runtime 


### Questions

- Are there reference programs with IDLs to test out our builder? 
	- reference implementation for pure Codama
		- we could build a reference program; what API should we cover?
	- reference implementation for Codama imported from Anchor
		- what API should we cover?


- Should we write a top-level visitor?
	- we have a visitor to extract specific instruction by name ( ./tests/test.spec.ts #142)
		- Is it a good idea to expand this into more complex visitor that will wrap them into a form of Anchor-like IDL (program.methods[methodName].accounts().signers().instruction())?


- Using "getResolvedInstructionInputsVisitor" to get the instruction inputs. DEMO
	- ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S :: InstructionNode :: write
		- Is it a right approach to use that visitor?

> It might be better to use existing visitor to extract accounts and arguments, but there is a mismatch for specific instruction.
> Right now we extract them from the InstructionNode manually


- Sync approach for writing validators: codama/lib/validators.ts
	- Current approach: create validator based on node.kind. Error prone
		- Could you suggest any existing way to create those validators? We investigating "getValidationtemsVisitor"
    		- Could getResolvedInstructionInputsVisitor from visitors-core help?
  

- Derivation for PDA accounts.
	- What could you suggest? Do we have existing mechanism in the core library we can use?
	- Current approach: try to resolve by type. Error prone ( ./codama/lib/pda.ts #L36 )

- Encode instruction arguments
	- What could you suggest? Is there a visitor we can use, or a helper that is able to produce a codec, better than getNodeCodec?
	- Current approach: use "getNodeCodec" and applying it according the InstructionArgumentNode.defaultValue.kind

