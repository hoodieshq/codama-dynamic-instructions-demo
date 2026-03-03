import { address } from '@solana/addresses';
import type { InstructionNode, RootNode } from 'codama';

import type { AccountsInput, ArgumentsInput, BuildIxFn, EitherSigners, ResolversInput } from '../../shared/types';
import { resolveAccountMeta, validateAccountsInput } from './accounts';
import {
    encodeInstructionArguments,
    resolveArgumentDefaultsFromCustomResolvers,
    validateArgumentsInput,
} from './arguments';

/**
 * @solana/kit
 * const buildix = createIxBuilder(root, root.program.instructions[0]);
 * const ix = await buildix({ id: 1, input: [1,2,3,4,5,6,7,8] }, { signer: signerPubkey });
 */
export function createIxBuilder(root: RootNode, ixNode: InstructionNode): BuildIxFn {
    const programAddress = address(root.program.publicKey);

    return async (argumentsInput, accountsInput, signers, resolversInput) => {
        const { argumentsData, accountsData } = await resolveInstructionData(
            root,
            ixNode,
            argumentsInput,
            accountsInput,
            signers,
            resolversInput,
        );

        return {
            accounts: accountsData,
            data: argumentsData,
            programAddress,
        };
    };
}

export async function resolveInstructionData(
    root: RootNode,
    instructionNode: InstructionNode,
    argumentsInput?: ArgumentsInput,
    accountsInput?: AccountsInput,
    signers?: EitherSigners,
    resolversInput?: ResolversInput,
) {
    // Validate arguments according codama schema
    validateArgumentsInput(root, instructionNode, argumentsInput);

    // Ensure required accounts are present
    // Validate provided pubkey addresses
    validateAccountsInput(instructionNode, accountsInput);

    // Resolve arguments which depends on custom resolvers
    const enrichedArgumentsInput = await resolveArgumentDefaultsFromCustomResolvers(
        instructionNode,
        argumentsInput,
        accountsInput,
        resolversInput,
    );

    // Encodes arguments into buffer
    const argumentsData = encodeInstructionArguments(root, instructionNode, enrichedArgumentsInput);

    const accountsData = await resolveAccountMeta(
        root,
        instructionNode,
        enrichedArgumentsInput,
        accountsInput,
        signers,
        resolversInput,
    );

    return { accountsData, argumentsData };
}
