import type { InstructionNode, RootNode } from 'codama';
import type { AccountsInput, ArgumentsInput, BuildIxFn } from '../../shared/types';
import { address } from '@solana/addresses';
import { resolveAccountMetas, validateAccountsInput } from './accounts';
import { encodeInstructionArguments, validateArgumentsInput } from './arguments';

/**
 * @solana/kit
 * const buildix = createIxBuilder(root, root.program.instructions[0]);
 * const ix = await buildix({ id: 1, input: [1,2,3,4,5,6,7,8] }, { signer: signerPubkey });
 */
export async function createIxBuilder(root: RootNode, ixNode: InstructionNode): Promise<BuildIxFn> {
    const programAddress = address(root.program.publicKey);

    return async (argumentsInput, accountsInput) => {
        const { argumentsData, accountsData } = await resolveInstructionData(
            root,
            ixNode,
            argumentsInput,
            accountsInput
        );

        return {
            programAddress,
            data: argumentsData,
            accounts: accountsData,
        };
    };
}

export async function resolveInstructionData(
    root: RootNode,
    instructionNode: InstructionNode,
    argumentsInput?: ArgumentsInput,
    accountsInput?: AccountsInput
) {
    // Validate arguments according codama schema
    validateArgumentsInput(root, instructionNode, argumentsInput);

    // Ensure required accounts are present
    // Validate provided pubkey addresses
    validateAccountsInput(instructionNode, accountsInput);

    // Encodes arguments into buffer
    const argumentsData = encodeInstructionArguments(root, instructionNode, argumentsInput);

    const accountsData = await resolveAccountMetas(root, instructionNode, argumentsInput, accountsInput);

    return { argumentsData, accountsData };
}
