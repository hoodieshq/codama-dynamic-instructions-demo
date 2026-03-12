import type { InstructionNode, RootNode } from 'codama';
import type { Failure, StructError } from 'superstruct';
import { assert } from 'superstruct';

import { ValidationError } from '../../../shared/errors';
import type { ArgumentsInput } from '../../../shared/types';
import { safeStringify } from '../../../shared/util';
import { createIxArgumentsValidator } from '../validators';
import { isOmittedArgument } from './shared';

export function validateArgumentsInput(root: RootNode, ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
    const requiredArguments = getRequiredIxArguments(ixNode);

    // Ensure arguments with "omitted" defaultValueStrategy are not provided in argumentsInput
    validateOmittedArguments(ixNode, argumentsInput);

    if (!requiredArguments.length) return;

    const filteredInput = filterRemainingAccountArguments(ixNode, argumentsInput);

    const ArgumentsInputValidator = createIxArgumentsValidator(
        ixNode.name,
        requiredArguments,
        root.program.definedTypes,
    );

    try {
        assert(filteredInput, ArgumentsInputValidator);
    } catch (error) {
        const { failures } = error as StructError;
        const message = failures().map(failure => {
            const fieldPath = formatFailurePath(failure);
            const value = formatFailureValue(failure.value);
            return `Invalid argument "${fieldPath}", value: ${value}. ${failure.message}\n`;
        });
        throw new ValidationError(message.join(''));
    }
}

/** Formats a full dotted path from failure, e.g. "command", "innerStruct.pubkey", "enumsArray[1]" */
function formatFailurePath(failure: Failure): string {
    const path = failure.path;
    if (!path || path.length === 0) return String(failure.key ?? '');
    return path
        .map((segment, i) => {
            if (typeof segment === 'number') {
                return `[${segment}]`;
            }
            return `${i === 0 ? '' : '.'}${String(segment)}`;
        })
        .join('');
}

/**
 * Formats failure values for error messages, truncating long values and stringifying objects.
 */
const MAX_VALUE_LENGTH = 120;
function formatFailureValue(value: unknown): string {
    const raw = typeof value === 'object' ? safeStringify(value) : String(value as unknown);
    return raw.length > MAX_VALUE_LENGTH ? `${raw.slice(0, MAX_VALUE_LENGTH)}…` : raw;
}

// Required arguments that should be validated and provided or be null/undefined if optional
function getRequiredIxArguments(ixNode: InstructionNode) {
    return ixNode.arguments.filter(arg => arg?.defaultValueStrategy !== 'omitted');
}

// Arguments with "omitted" defaultValueStrategy must not be provided (e.g. discriminator)
// https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionArgumentNode.md#data
function validateOmittedArguments(ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
    ixNode.arguments.filter(isOmittedArgument).forEach(ixArgumentNode => {
        if (Object.hasOwn(argumentsInput, ixArgumentNode.name)) {
            throw new ValidationError(`Argument ${ixArgumentNode.name} cannot be provided`);
        }
    });
}

function getRemainingAccountArgNames(ixNode: InstructionNode): string[] {
    return (ixNode.remainingAccounts ?? [])
        .filter(node => node.value.kind === 'argumentValueNode')
        .map(node => node.value.name);
}

/**
 * Filters out remaining account argument names from the arguments input.
 * So superstruct's object() doesn't reject them as extra keys.
 */
function filterRemainingAccountArguments(ixNode: InstructionNode, argumentsInput: ArgumentsInput): ArgumentsInput {
    const remainingAccountArgNames = getRemainingAccountArgNames(ixNode);
    if (!remainingAccountArgNames.length) {
        return argumentsInput;
    }

    const remainingAccountArgNamesSet = new Set(remainingAccountArgNames);
    return Object.fromEntries(Object.entries(argumentsInput).filter(([key]) => !remainingAccountArgNamesSet.has(key)));
}
