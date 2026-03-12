import { getNodeCodec, type ReadonlyUint8Array } from '@codama/dynamic-codecs';
import type { InstructionNode, RootNode } from 'codama';
import { visitOrElse } from 'codama';

import { createDefaultValueEncoderVisitor, createInputValueTransformer } from '../../../entities/visitors';
import { concatBytes } from '../../../shared/bytes-encoding';
import { ArgumentError } from '../../../shared/errors';
import type { ArgumentsInput } from '../../../shared/types';
import { isOmittedArgument, isOptionalArgument } from './shared';

export function encodeInstructionArguments(
    root: RootNode,
    ix: InstructionNode,
    argumentsInput: ArgumentsInput = {},
): ReadonlyUint8Array {
    const chunks = ix.arguments.reduce<ReadonlyUint8Array[]>((chunks, ixArgumentNode) => {
        const input = argumentsInput?.[ixArgumentNode.name];
        if (isOmittedArgument(ixArgumentNode)) {
            chunks.push(encodeOmittedArgument(root, ix, ixArgumentNode));
        } else if (isOptionalArgument(ixArgumentNode, input)) {
            chunks.push(encodeOptionalArgument(root, ix, ixArgumentNode));
        } else {
            chunks.push(encodeRequiredArgument(root, ix, ixArgumentNode, input));
        }
        return chunks;
    }, []);

    return concatBytes(chunks);
}

function encodeOmittedArgument(
    root: RootNode,
    ix: InstructionNode,
    ixArgumentNode: InstructionNode['arguments'][number],
): ReadonlyUint8Array {
    const nodeCodec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
    const defaultValue = ixArgumentNode.defaultValue;
    if (defaultValue === undefined) {
        throw new ArgumentError(`Omitted argument ${ixArgumentNode.name} has no default value`);
    }

    const visitor = createDefaultValueEncoderVisitor(nodeCodec);
    return visitOrElse(defaultValue, visitor, node => {
        throw new ArgumentError(
            `Not supported encoding for ${ixArgumentNode.name} argument of "${ixArgumentNode.type.kind}" kind (defaultValue: ${node.kind})`,
        );
    });
}

function encodeOptionalArgument(
    root: RootNode,
    ix: InstructionNode,
    ixArgumentNode: InstructionNode['arguments'][number],
): ReadonlyUint8Array {
    const nodeCodec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
    return nodeCodec.encode(null);
}

function encodeRequiredArgument(
    root: RootNode,
    ix: InstructionNode,
    ixArgumentNode: InstructionNode['arguments'][number],
    input: ArgumentsInput[string],
): ReadonlyUint8Array {
    if (input === undefined) {
        throw new ArgumentError(`Missing required argument: ${ixArgumentNode.name}`);
    }

    const nodeCodec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
    const transformer = createInputValueTransformer(ixArgumentNode.type, root, {
        bytesEncoding: 'base16',
    });
    const transformedInput = transformer(input);
    return nodeCodec.encode(transformedInput);
}
