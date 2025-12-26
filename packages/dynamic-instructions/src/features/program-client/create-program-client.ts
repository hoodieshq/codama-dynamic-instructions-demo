import { createFromJson } from 'codama';
import type { InstructionNode, RootNode } from 'codama';
import { address } from '@solana/addresses';
import type { Address } from '@solana/addresses';
import { toAddress } from '../../shared/address';
import type { AddressInput } from '../../shared/address';
import { MethodsBuilder } from './methods-builder';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';
import type { Instruction } from '@solana/instructions';

export type IdlInput = string | object;

export type CreateProgramClientOptions = {
    /**
     * Optional override for the program id.
     * If not provided, uses `root.program.publicKey` from the IDL.
     */
    programId?: AddressInput;
};

export type ProgramClient = {
    /** Parsed Codama root node for advanced use-cases. */
    root: RootNode;
    /** Program id as an `Address`. */
    programAddress: Address;
    /** Quick lookup by instruction name. */
    instructions: Map<string, InstructionNode>;
    /** Anchor-like facade namespace for building instructions. */
    methods: Record<string, (args?: ArgumentsInput) => ProgramMethodBuilder>;
};

export type ProgramMethodBuilder = {
    accounts(accounts: AccountsInput): ProgramMethodBuilder;
    instruction(): Promise<Instruction>;
};

export function createProgramClient(idl: IdlInput, options: CreateProgramClientOptions = {}): ProgramClient {
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
        root,
        programAddress,
        instructions,
        methods,
    };
}
