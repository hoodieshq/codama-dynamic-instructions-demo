import type { InstructionArgumentNode } from 'codama';

export function isOmittedArgument(node: InstructionArgumentNode) {
    return node.defaultValueStrategy === 'omitted';
}

const optionalNodeKinds = ['optionTypeNode', 'zeroableOptionTypeNode', 'remainderOptionTypeNode'];
export function isOptionalArgument(ixArgumentNode: InstructionArgumentNode, input: unknown) {
    return optionalNodeKinds.includes(ixArgumentNode.type.kind) && (input === null || input === undefined);
}
