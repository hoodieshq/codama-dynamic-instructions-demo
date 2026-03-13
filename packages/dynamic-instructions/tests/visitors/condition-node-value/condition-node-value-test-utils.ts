import type { InstructionNode } from 'codama';
import { camelCase, programNode, rootNode } from 'codama';

import { createConditionNodeValueVisitor } from '../../../src/entities/visitors/condition-node-value';

const rootNodeMock = rootNode(programNode({ name: 'test', publicKey: '11111111111111111111111111111111' }));
const ixNodeStub: InstructionNode = {
    accounts: [],
    arguments: [],
    docs: [],
    kind: 'instructionNode',
    name: camelCase('test_instruction'),
};

export function makeVisitor(overrides?: Partial<Parameters<typeof createConditionNodeValueVisitor>[0]>) {
    return createConditionNodeValueVisitor({
        accountsInput: undefined,
        argumentsInput: undefined,
        ixNode: ixNodeStub,
        resolutionPath: [],
        resolversInput: undefined,
        root: rootNodeMock,
        ...overrides,
    });
}
