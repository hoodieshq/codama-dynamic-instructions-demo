import type { Visitor } from 'codama';
import type { AccountValueNode, ArgumentValueNode, InstructionNode, ResolverValueNode, RootNode } from 'codama';

import { resolveAccountAddress } from '../../features/instruction-encoding/accounts/resolve-account-address';
import { toAddress } from '../../shared/address';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput, ResolutionPath } from '../../shared/types';

type ConditionNodeValueVisitorContext = {
    accountsInput: AccountsInput | undefined;
    argumentsInput: ArgumentsInput | undefined;
    ixNode: InstructionNode;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
};

/**
 * Visitor for resolving condition nodes in ConditionalValueNode.
 * Returns the runtime value of the condition (from accounts or arguments).
 */
export function createConditionNodeValueVisitor(
    ctx: ConditionNodeValueVisitorContext,
): Visitor<Promise<unknown>, 'accountValueNode' | 'argumentValueNode' | 'resolverValueNode'> {
    const { root, ixNode, argumentsInput, accountsInput, resolutionPath } = ctx;

    return {
        visitAccountValue: async (node: AccountValueNode) => {
            const ixAccountNode = ixNode.accounts.find(acc => acc.name === node.name);
            if (!ixAccountNode) {
                throw new AccountError(
                    `Missing instruction account node for conditionalValueNode condition: ${node.name}`,
                );
            }

            // if user explicitly provides null for conditional account, we should return it for conditionalValueNode ifFalse branch
            const accountAddressInput = accountsInput?.[ixAccountNode.name];
            if (accountAddressInput === null) {
                return null;
            }
            if (accountAddressInput !== undefined) {
                return toAddress(accountAddressInput);
            }

            // Fallback to resolving from default value
            const conditionalAddress = await resolveAccountAddress({
                accountAddressInput,
                accountsInput,
                argumentsInput,
                ixAccountNode,
                ixNode,
                resolutionPath,
                root,
            });
            return conditionalAddress;
        },

        visitArgumentValue: (node: ArgumentValueNode) => {
            const argInput = argumentsInput?.[node.name];
            return Promise.resolve(argInput);
        },

        visitResolverValue: (_node: ResolverValueNode) => {
            // TODO: may contain complex custom resolver, to be implemented later
            throw new AccountError('ResolverValueNode is not supported in conditionalValueNode yet');
        },
    };
}
