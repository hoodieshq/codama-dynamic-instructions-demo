import type { Address } from '@solana/addresses';
import { address } from '@solana/addresses';
import type { InstructionAccountNode, InstructionNode, RootNode } from 'codama';
import { visitOrElse } from 'codama';

import { createAccountDefaultValueVisitor } from '../../../entities/visitors/account-default-value';
import type { AddressInput } from '../../../shared/address';
import { AccountError } from '../../../shared/errors';
import type { ResolutionPath } from '../../../shared/types';
import type { AccountsInput, ArgumentsInput } from '../../../shared/types';

type ResolveAccountAddressContext = {
    accountAddressInput?: AddressInput | null | undefined;
    accountsInput?: AccountsInput | undefined;
    argumentsInput?: ArgumentsInput | undefined;
    ixAccountNode: InstructionAccountNode;
    ixNode: InstructionNode;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
};

/**
 * Resolves the address of an instruction account node by evaluating its default value
 * using the AccountDefaultValueVisitor.
 */
export async function resolveAccountAddress(ctx: ResolveAccountAddressContext): Promise<Address | null> {
    const { root, ixNode, ixAccountNode, argumentsInput, accountsInput, resolutionPath, accountAddressInput } = ctx;
    // Undefined optional accounts are handled according on optionalAccountStrategy
    // With "programId" optionalStrategy, optional accounts are resolved to programId
    // With "omitted" optionalStrategy, optional accounts must be excluded from accounts list
    // By default, optional accounts are resolved to programId
    if (!accountAddressInput && ixAccountNode.isOptional) {
        switch (ixNode.optionalAccountStrategy) {
            case 'omitted':
                return null;
            case 'programId':
                return address(root.program.publicKey);
            default:
                throw new AccountError(
                    `Cannot resolve optional account: ${ixAccountNode.name} of ${ixNode.name} instruction with strategy: ${String(ixNode.optionalAccountStrategy)}`,
                );
        }
    }

    if (!ixAccountNode.defaultValue) {
        throw new AccountError(
            `Cannot resolve account ${ixAccountNode.name} of ${ixNode.name} instruction. Account doesn't have default value`,
        );
    }

    const visitor = createAccountDefaultValueVisitor({
        accountAddressInput,
        accountsInput,
        argumentsInput,
        ixAccountNode,
        ixNode,
        resolutionPath,
        root,
    });

    const addressValue = await visitOrElse(ixAccountNode.defaultValue, visitor, node => {
        throw new AccountError(
            `Cannot resolve account ${ixAccountNode.name}:${node.kind} of ${ixNode.name} instruction`,
        );
    });

    return addressValue;
}
