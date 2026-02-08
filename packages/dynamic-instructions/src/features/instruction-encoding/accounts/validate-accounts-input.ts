import type { InstructionNode } from 'codama';
import type { StructError } from 'superstruct';
import { assert } from 'superstruct';

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
        const { key, value, message } = error as StructError;
        // TODO: ensure this error is user friendly
        if (!value) {
            throw new AccountError(`Missing required account: ${key}. ${message}`);
        } else {
            throw new AccountError(`Invalid address of "${key}" account: ${value}`);
        }
    }
}