import { getNodeCodec } from '@codama/dynamic-codecs';
import type { ReadonlyUint8Array } from '@solana/codecs';
import type { InstructionArgumentNode, InstructionNode, RootNode } from 'codama';
import { visitOrElse } from 'codama';
import type { StructError } from 'superstruct';
import { assert } from 'superstruct';

import { createDefaultValueEncoderVisitor } from '../../entities/visitors';
import { ArgumentError, ValidationError } from '../../shared/errors';
import type { ArgumentsInput } from '../../shared/types';
import { createIxArgumentsValidator } from './validators';

export function encodeInstructionArguments(
    root: RootNode,
    ix: InstructionNode,
    argumentsInput: ArgumentsInput = {}
): ReadonlyUint8Array {
    const chunks = ix.arguments.reduce<ReadonlyUint8Array[]>((chunks, ixArgumentNode) => {
        const codec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
        const input = argumentsInput?.[ixArgumentNode.name];
        let encodedValue: ReadonlyUint8Array;
        if (isIxArgumentOmitted(ixArgumentNode)) {
            // Omitted argument means it must always use the default value (e.g discriminator)
            const visitor = createDefaultValueEncoderVisitor(codec);
            encodedValue = visitOrElse(ixArgumentNode.defaultValue, visitor, node => {
                throw new ArgumentError(
                    `Not supported encoding for ${ixArgumentNode.name} argument of "${ixArgumentNode.type.kind}" kind (defaultValue: ${node.kind})`
                );
            });
        } else if (ixArgumentNode.type.kind === 'optionTypeNode' && (input === null || input === undefined)) {
            // optional null/undefined argument
            encodedValue = codec.encode(null);
        } else {
            if (input === undefined) {
                throw new ArgumentError(`Missing required argument: ${ixArgumentNode.name}`);
            }
            encodedValue = codec.encode(input);
        }
        chunks.push(encodedValue);
        return chunks;
    }, []);

    // Avoid `[...bytes]` spreading/flattening; that creates lots of intermediate arrays.
    let totalLength = 0;
    for (const chunk of chunks) totalLength += chunk.length;
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk as Uint8Array, offset);
        offset += chunk.length;
    }
    return out;
}

export function validateArgumentsInput(root: RootNode, ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
    const requiredArguments = getRequiredIxArguments(ixNode);

    // Ensure arguments with "omitted" defaultValueStrategy are not provided in argumentsInput
    validateOmittedArguments(ixNode, argumentsInput);

    if (!requiredArguments.length) return;

    const ArgumentsInputValidator = createIxArgumentsValidator(
        ixNode.name,
        requiredArguments,
        root.program.definedTypes
    );

    try {
        assert(argumentsInput, ArgumentsInputValidator);
    } catch (error) {
        const { failures } = error as StructError;
        const message = failures().map(failure => {
            return `Invalid argument "${failure.key}", "value": ${failure.value}. Message: ${failure.message}\n`;
        });
        throw new ValidationError(message.join(''));
    }
}

// Required arguments that should be validated and provided or be null/undefined if optional
function getRequiredIxArguments(ixNode: InstructionNode) {
    return ixNode.arguments.filter(arg => arg?.defaultValueStrategy !== 'omitted');
}

// Arguments with "omitted" defaultValueStrategy must not be provided (e.g discriminator)
// https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionArgumentNode.md#data
function validateOmittedArguments(ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
    ixNode.arguments.filter(isIxArgumentOmitted).forEach(ixNode => {
        if (argumentsInput.hasOwnProperty(ixNode.name)) {
            throw new ValidationError(`Argument ${ixNode.name} cannot be provided`);
        }
    });
}

function isIxArgumentOmitted(node: InstructionArgumentNode) {
    return node.defaultValueStrategy === 'omitted' && node.defaultValue;
}
