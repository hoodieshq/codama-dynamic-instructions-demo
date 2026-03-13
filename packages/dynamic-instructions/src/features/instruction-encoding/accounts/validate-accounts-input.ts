import type { InstructionNode } from 'codama';
import { assert, StructError } from 'superstruct';

import { AccountError } from '../../../shared/errors';
import type { AccountsInput } from '../../../shared/types';
import { createIxAccountsValidator } from '../validators';
/**
 * Validates the accountsInput against the instruction's account definitions.
 * Ensures all required accounts are provided and have valid addresses.
 */
export function validateAccountsInput(ixNode: InstructionNode, accountsInput: AccountsInput = {}) {
    if (!ixNode.accounts.length) return;

    const AccountsInputValidator = createIxAccountsValidator(ixNode.accounts);
    try {
        assert(accountsInput, AccountsInputValidator);
    } catch (error) {
        if (error instanceof StructError) {
            const key = error.key as string;
            const value = error.value as unknown;
            if (value == null) {
                throw new AccountError(`Missing required account: ${key}. Expected a valid Solana address`);
            } else {
                throw new AccountError(`Invalid address of "${key}" account: ${value as string}`);
            }
        }
        throw new AccountError(`Unexpected account validation error`, { cause: error });
    }
}
