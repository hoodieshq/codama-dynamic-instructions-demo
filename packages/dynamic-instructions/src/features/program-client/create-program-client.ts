import type { Address } from '@solana/addresses';
import { address } from '@solana/addresses';
import type { Instruction } from '@solana/instructions';
import type { InstructionNode, RootNode } from 'codama';
import { createFromJson } from 'codama';

import type { AddressInput } from '../../shared/address';
import { toAddress } from '../../shared/address';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';
import { MethodsBuilder } from './methods-builder';

export type IdlInput = object | string;

export type CreateProgramClientOptions = {
    /**
     * Optional override for the program id.
     * If not provided, uses `root.program.publicKey` from the IDL.
     */
    programId?: AddressInput;
};

export type ProgramClient = {
    /** Quick lookup by instruction name. */
    instructions: Map<string, InstructionNode>;
    /** Anchor-like facade namespace for building instructions. */
    methods: Record<string, (args?: ArgumentsInput) => ProgramMethodBuilder>;
    /** Program id as an `Address`. */
    programAddress: Address;
    /** Parsed Codama root node for advanced use-cases. */
    root: RootNode;
};

export type ProgramMethodBuilder = {
    accounts(accounts: AccountsInput): ProgramMethodBuilder;
    instruction(): Promise<Instruction>;
};

/**
 * Creates a program client from a Codama IDL.
 *
 * For type safety, generate types with `pnpm generate-program-types` and pass as a generic:
 * ```typescript
 * import type { MyProgramClient } from './generated/my-program-types';
 * const client = createProgramClient<MyProgramClient>(idl);
 * ```
 */
export function createProgramClient<TClient = ProgramClient>(
    idl: IdlInput,
    options: CreateProgramClientOptions = {},
): TClient {
    const json = typeof idl === 'string' ? idl : JSON.stringify(idl);
    const root = createFromJson(json).getRoot();

    const programAddress = options.programId ? toAddress(options.programId) : address(root.program.publicKey);

    const instructions = new Map<string, InstructionNode>();
    for (const ix of root.program.instructions) {
        instructions.set(ix.name, ix);
    }

    const methods = new Proxy(
        {},
        {
            get(_target, prop) {
                // Avoid thenable behavior when people `await program.methods`.
                if (prop === 'then') return undefined;
                if (typeof prop !== 'string') return undefined;

                const ixNode = instructions.get(prop);
                if (!ixNode) return undefined;

                return (args?: ArgumentsInput) => new MethodsBuilder(root, ixNode, args) as ProgramMethodBuilder;
            },
        },
    ) as ProgramClient['methods'];

    return {
        instructions,
        methods,
        programAddress,
        root,
    } as unknown as TClient;
}
