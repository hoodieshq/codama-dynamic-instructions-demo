import type { Visitor } from 'codama';

import { toAddress } from '../../shared/address';
import { AccountError } from '../../shared/errors';
import { resolveAccountAddress } from '../resolvers/resolve-account-address';
import type { AccountValueNode, ArgumentValueNode, ResolverValueNode } from 'codama';

import { resolveAccountValueNodeAddress } from '../resolvers/resolve-account-value-node-address';
import type { BaseResolutionContext } from '../resolvers/types';

/**
 * Visitor for resolving condition nodes in ConditionalValueNode.
 * Returns the runtime value of the condition (from accounts or arguments).
 */
export function createConditionNodeValueVisitor(
    ctx: BaseResolutionContext,
): Visitor<Promise<unknown>, 'accountValueNode' | 'argumentValueNode' | 'resolverValueNode'> {
    const { root, ixNode, argumentsInput, accountsInput, resolutionPath, resolversInput } = ctx;

    return {
        visitAccountValue: async (node: AccountValueNode) => {
            const ixAccountNode = ixNode.accounts.find(acc => acc.name === node.name);
            if (!ixAccountNode) {
                throw new AccountError(
                    `Missing instruction account node for conditionalValueNode condition: ${node.name}`,
                );
            }

            // If the user explicitly provides null for a conditional account, return it for the conditionalValueNode ifFalse branch
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
                resolversInput,
                root,
            });
            return conditionalAddress;
        },

        visitArgumentValue: (node: ArgumentValueNode) => {
            const argInput = argumentsInput?.[node.name];
            return Promise.resolve(argInput);
        },

        visitResolverValue: async (node: ResolverValueNode) => {
            const resolverFn = resolversInput?.[node.name];
            if (!resolverFn) {
                // undefined directs to ifFalse branch
                return undefined;
            }
            return await resolverFn(argumentsInput ?? {}, accountsInput ?? {});
        },
    };
}
