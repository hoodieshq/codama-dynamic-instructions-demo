import type { Address } from '@solana/addresses';
import { address } from '@solana/addresses';
import type { Visitor } from 'codama';
import type {
    AccountBumpValueNode,
    AccountValueNode,
    ArgumentValueNode,
    ConditionalValueNode,
    IdentityValueNode,
    InstructionAccountNode,
    InstructionNode,
    PayerValueNode,
    PdaValueNode,
    ProgramIdValueNode,
    PublicKeyValueNode,
    ResolverValueNode,
    RootNode,
} from 'codama';
import { isNode, visitOrElse } from 'codama';

import { derivePDA } from '../../features/instruction-encoding/pda';
import type { AddressInput } from '../../shared/address';
import { toAddress } from '../../shared/address';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput, ResolutionPath } from '../../shared/types';
import { detectCircularDependency } from '../../shared/util';
import { createConditionNodeValueVisitor } from './condition-node-value';
import { createValueNodeVisitor } from './value-node-value';

type AccountDefaultValueVisitorContext = {
    accountAddressInput: AddressInput | null | undefined;
    accountsInput: AccountsInput | undefined;
    argumentsInput: ArgumentsInput | undefined;
    ixAccountNode: InstructionAccountNode;
    ixNode: InstructionNode;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
};

/**
 * Visitor for resolving InstructionInputValueNode types to Address values
 * for account resolution.
 */
export function createAccountDefaultValueVisitor(
    ctx: AccountDefaultValueVisitorContext,
): Visitor<
    Promise<Address>,
    | 'accountBumpValueNode'
    | 'accountValueNode'
    | 'argumentValueNode'
    | 'conditionalValueNode'
    | 'identityValueNode'
    | 'payerValueNode'
    | 'pdaValueNode'
    | 'programIdValueNode'
    | 'publicKeyValueNode'
    | 'resolverValueNode'
> {
    const { root, ixNode, ixAccountNode, accountAddressInput, argumentsInput, accountsInput } = ctx;
    const resolutionPath = ctx.resolutionPath ?? [];

    return {
        visitAccountBumpValue: (_node: AccountBumpValueNode) => {
            throw new AccountError(
                `AccountBumpValueNode not yet supported for ${ixAccountNode.name} account. ` +
                    `Bump seeds should be derived from PDA derivation.`,
            );
        },

        visitAccountValue: async (node: AccountValueNode) => {
            // AccountValueNode references another account in instruction
            // First try to resolve it from accountsInput
            const referencedAccountInput = accountsInput?.[node.name];
            if (referencedAccountInput !== undefined && referencedAccountInput !== null) {
                return toAddress(referencedAccountInput);
            }

            // Try to resolve it as a PDA from the instruction
            const referencedIxAccountNode = ixNode.accounts.find(acc => acc.name === node.name);
            if (!referencedIxAccountNode) {
                throw new AccountError(
                    `Referenced account not found in instruction: ${node.name} (referenced by ${ixAccountNode.name})`,
                );
            }

            if (referencedIxAccountNode.defaultValue) {
                detectCircularDependency(node.name, resolutionPath);

                const visitor = createAccountDefaultValueVisitor({
                    ...ctx,
                    accountAddressInput: referencedAccountInput,
                    ixAccountNode: referencedIxAccountNode,
                    resolutionPath: [...resolutionPath, node.name],
                });
                return await visitOrElse(referencedIxAccountNode.defaultValue, visitor, innerNode => {
                    throw new AccountError(`Cannot resolve referenced account ${node.name}: ${innerNode.kind}`);
                });
            }

            throw new AccountError(
                `Cannot resolve accountValueNode: ${node.name}. Account not provided and has no default value.`,
            );
        },

        visitArgumentValue: (node: ArgumentValueNode) => {
            // Reference to an instruction argument - should be an address
            const argValue = argumentsInput?.[node.name];
            if (argValue === undefined || argValue === null) {
                throw new AccountError(
                    `Missing required argument for account default: ${node.name} (used by ${ixAccountNode.name})`,
                );
            }

            try {
                return Promise.resolve(toAddress(argValue as AddressInput));
            } catch {
                throw new AccountError(
                    `Argument ${node.name} cannot be converted to Address for account ${ixAccountNode.name}`,
                );
            }
        },

        visitConditionalValue: async (conditionalValueNode: ConditionalValueNode) => {
            // ifTrue of ifFalse branch of ConditionalValueNode
            const resolvedInputValueNode = await resolveConditionalValueNodeCondition({
                accountsInput,
                argumentsInput,
                conditionalValueNode,
                ixAccountNode,
                ixNode,
                resolutionPath,
                root,
            });

            if (resolvedInputValueNode === undefined) {
                throw new AccountError(
                    `Conditional branch resolved to undefined in account ${ixAccountNode.name} of ${ixNode.name} instruction`,
                );
            }
            // Recursively resolve the chosen branch
            const visitor = createAccountDefaultValueVisitor(ctx);
            const addressValue = await visitOrElse(resolvedInputValueNode, visitor, (innerNode: { kind: string }) => {
                throw new AccountError(
                    `Cannot resolve conditional branch node: ${innerNode.kind} in account ${ixAccountNode.name}`,
                );
            });
            return addressValue;
        },

        visitIdentityValue: async (_node: IdentityValueNode) => {
            if (accountAddressInput === undefined || accountAddressInput === null) {
                throw new AccountError(
                    `Cannot resolve identity value for ${ixAccountNode.name}: account address not provided`,
                );
            }
            return await Promise.resolve(toAddress(accountAddressInput));
        },

        visitPayerValue: async (_node: PayerValueNode) => {
            if (accountAddressInput === undefined || accountAddressInput === null) {
                throw new AccountError(
                    `Cannot resolve payer value for ${ixAccountNode.name}: account address not provided`,
                );
            }
            return await Promise.resolve(toAddress(accountAddressInput));
        },

        visitPdaValue: async (node: PdaValueNode) => {
            const pda = await derivePDA({
                accountsInput,
                argumentsInput,
                ixAccountNode,
                ixNode,
                pdaValueNode: node,
                resolutionPath,
                root,
            });
            if (pda === null) {
                throw new AccountError(`Cannot derive PDA for account ${ixAccountNode.name}`);
            }
            return pda[0];
        },

        visitProgramIdValue: (_node: ProgramIdValueNode) => {
            return Promise.resolve(address(root.program.publicKey));
        },

        visitPublicKeyValue: (node: PublicKeyValueNode) => {
            return Promise.resolve(address(node.publicKey));
        },

        visitResolverValue: (_node: ResolverValueNode) => {
            throw new AccountError(
                `ResolverValueNode not yet supported for ${ixAccountNode.name} account. ` +
                    `Custom resolvers are not implemented.`,
            );
        },
    };
}

type ConditionalValueNodeConditionContext = {
    accountsInput: AccountsInput | undefined;
    argumentsInput: ArgumentsInput | undefined;
    conditionalValueNode: ConditionalValueNode;
    ixAccountNode: InstructionAccountNode;
    ixNode: InstructionNode;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
};
/**
 * Helper function to resolve ConditionalValueNode.
 * Evaluates the condition and returns ifTrue or ifFalse branch.
 */
export async function resolveConditionalValueNodeCondition({
    root,
    ixNode,
    ixAccountNode,
    conditionalValueNode,
    argumentsInput,
    accountsInput,
    resolutionPath,
}: ConditionalValueNodeConditionContext) {
    if (!isNode(conditionalValueNode, 'conditionalValueNode')) {
        throw new AccountError(`Expected conditionalValueNode in account ${ixAccountNode.name}`);
    }
    const { condition, value: requiredValueNode, ifTrue, ifFalse } = conditionalValueNode;

    if (!requiredValueNode && !ifTrue && !ifFalse) {
        throw new AccountError('Invalid conditionalValueNode: missing value and branches');
    }

    // Resolve the condition value of ConditionalValueNode
    const conditionVisitor = createConditionNodeValueVisitor({
        accountsInput,
        argumentsInput,
        ixNode,
        resolutionPath: resolutionPath ?? [],
        root,
    });
    const providedValue = await visitOrElse(condition, conditionVisitor, condNode => {
        throw new AccountError(
            `Cannot resolve condition node: ${condNode.kind} in account ${ixAccountNode.name} of ${ixNode.name} instruction`,
        );
    });

    if (requiredValueNode) {
        // If provided, the condition must be equal to required value
        const valueVisitor = createValueNodeVisitor({ accountsInput, argumentsInput });
        const requiredValue = visitOrElse(requiredValueNode, valueVisitor, valueNode => {
            throw new AccountError(
                `Cannot resolve required value node: ${valueNode.kind} in account ${ixAccountNode.name}`,
            );
        });
        // FIXME: Deep equality check for complex types, like maps, structs, arrays, etc.
        return requiredValue.value === providedValue ? ifTrue : ifFalse;
    } else {
        return providedValue ? ifTrue : ifFalse;
    }
}
