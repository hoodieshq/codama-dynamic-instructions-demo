import type { InstructionArgumentNode } from 'codama';

export function isOmittedArgument(node: InstructionArgumentNode) {
    return node.defaultValueStrategy === 'omitted';
}

export function isOptionalArgument(ixArgumentNode: InstructionArgumentNode, input: unknown) {
    return ixArgumentNode.type.kind.search(/optionTypeNode/i) !== -1 && (input === null || input === undefined);
}
