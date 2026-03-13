import type { InstructionNode } from 'codama';
import { isNode } from 'codama';

import type { AccountsInput, ArgumentsInput, ResolversInput } from '../../../shared/types';
import { isOmittedArgument } from './shared';

/**
 * Resolves argument defaults from user-provided resolvers.
 * For each argument that has a resolverValueNode and is not provided by argumentsInput,
 * try to invoke the corresponding resolver function and fill ArgumentsInput with the resolved values.
 */
export async function resolveArgumentDefaultsFromCustomResolvers(
    ixNode: InstructionNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {},
    resolversInput: ResolversInput = {},
): Promise<ArgumentsInput> {
    const resolvedArgumentsInput = { ...argumentsInput };

    const allArguments = [...ixNode.arguments, ...(ixNode.extraArguments ?? [])];
    for (const argumentNode of allArguments) {
        if (resolvedArgumentsInput[argumentNode.name] !== undefined) continue;
        if (isOmittedArgument(argumentNode)) continue;
        if (!isNode(argumentNode.defaultValue, 'resolverValueNode')) continue;

        const resolverFn = resolversInput[argumentNode.defaultValue.name];
        // If no resolver provided — skip and let the encoding step handle it:
        // Optional arguments will be encoded as none
        // Required arguments will emit error
        if (!resolverFn) continue;

        resolvedArgumentsInput[argumentNode.name] = await resolverFn(resolvedArgumentsInput, accountsInput);
    }

    return resolvedArgumentsInput;
}
