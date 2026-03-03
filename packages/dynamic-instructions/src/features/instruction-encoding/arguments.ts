import { getNodeCodec } from '@codama/dynamic-codecs';
import type { ReadonlyUint8Array } from '@solana/codecs';
import type { InstructionArgumentNode, InstructionNode, RootNode } from 'codama';
import { visitOrElse } from 'codama';
import type { Failure, StructError } from 'superstruct';
import { assert } from 'superstruct';

import { createDefaultValueEncoderVisitor } from '../../entities/visitors';
import { createInputValueTransformer } from '../../entities/visitors/input-value-transformer';
import { concatBytes } from '../../shared/bytes-encoding';
import { ArgumentError, ValidationError } from '../../shared/errors';
import type { ArgumentsInput } from '../../shared/types';
import { createIxArgumentsValidator } from './validators';

export function encodeInstructionArguments(
    root: RootNode,
    ix: InstructionNode,
    argumentsInput: ArgumentsInput = {},
): ReadonlyUint8Array {
    const chunks = ix.arguments.reduce<ReadonlyUint8Array[]>((chunks, ixArgumentNode) => {
        const nodeCodec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
        const input = argumentsInput?.[ixArgumentNode.name];
        let encodedValue: ReadonlyUint8Array;
        if (isIxArgumentOmitted(ixArgumentNode)) {
            // Omitted argument means it must always use the default value (e.g discriminator)
            const defaultValue = ixArgumentNode.defaultValue;
            if (defaultValue === undefined) {
                throw new ArgumentError(`Omitted argument ${ixArgumentNode.name} has no default value`);
            }
            const visitor = createDefaultValueEncoderVisitor(nodeCodec);
            encodedValue = visitOrElse(defaultValue, visitor, node => {
                throw new ArgumentError(
                    `Not supported encoding for ${ixArgumentNode.name} argument of "${ixArgumentNode.type.kind}" kind (defaultValue: ${node.kind})`,
                );
            });
        } else if (isOptionalArgument(ixArgumentNode, input)) {
            // optional null/undefined argument
            encodedValue = nodeCodec.encode(null);
        } else {
            if (input === undefined) {
                throw new ArgumentError(`Missing required argument: ${ixArgumentNode.name}`);
            }
            // Transform user input to codamaCodec-compatible format
            const transformer = createInputValueTransformer(ixArgumentNode.type, root, {
                bytesEncoding: 'base16',
            });
            const transformedInput = transformer(input);
            encodedValue = nodeCodec.encode(transformedInput);
        }
        chunks.push(encodedValue);
        return chunks;
    }, []);

    return concatBytes(chunks);
}

function isOptionalArgument(ixArgumentNode: InstructionArgumentNode, input: unknown) {
    return (
        ['optionTypeNode', 'remainderOptionTypeNode'].includes(ixArgumentNode.type.kind) &&
        (input === null || input === undefined)
    );
}

export function validateArgumentsInput(root: RootNode, ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
    const requiredArguments = getRequiredIxArguments(ixNode);

    // Ensure arguments with "omitted" defaultValueStrategy are not provided in argumentsInput
    validateOmittedArguments(ixNode, argumentsInput);

    if (!requiredArguments.length) return;

    // Strip remaining account argument names so superstruct's object() doesn't reject them as extra keys
    const remainingAccountArgNames = getRemainingAccountArgNames(ixNode);
    const filteredInput = remainingAccountArgNames.length
        ? Object.fromEntries(Object.entries(argumentsInput).filter(([key]) => !remainingAccountArgNames.includes(key)))
        : argumentsInput;

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
    let raw: string;
    if (typeof value === 'object') {
        try {
            raw = JSON.stringify(value, (_key, v: unknown) => (typeof v === 'bigint' ? String(v) : v));
        } catch {
            return '[object]';
        }
    } else {
        raw = String(value as unknown);
    }
    return raw.length > MAX_VALUE_LENGTH ? `${raw.slice(0, MAX_VALUE_LENGTH)}…` : raw;
}

// Required arguments that should be validated and provided or be null/undefined if optional
function getRequiredIxArguments(ixNode: InstructionNode) {
    return ixNode.arguments.filter(arg => arg?.defaultValueStrategy !== 'omitted');
}

// Arguments with "omitted" defaultValueStrategy must not be provided (e.g discriminator)
// https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionArgumentNode.md#data
function validateOmittedArguments(ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
    ixNode.arguments.filter(isIxArgumentOmitted).forEach(ixNode => {
        if (Object.hasOwn(argumentsInput, ixNode.name)) {
            throw new ValidationError(`Argument ${ixNode.name} cannot be provided`);
        }
    });
}

function isIxArgumentOmitted(node: InstructionArgumentNode) {
    return node.defaultValueStrategy === 'omitted';
}

function getRemainingAccountArgNames(ixNode: InstructionNode): string[] {
    return (ixNode.remainingAccounts ?? [])
        .filter(node => node.value.kind === 'argumentValueNode')
        .map(node => node.value.name);
}
