import { address } from '@solana/addresses';
import type { InstructionNode } from 'codama';
import { camelCase, programNode, rootNode } from 'codama';

import { createPdaSeedValueVisitor } from '../../../src/entities/visitors/pda-seed-value';

export const DEFAULT_PUBLIC_KEY = '11111111111111111111111111111111';

export const rootNodeMock = rootNode(programNode({ name: 'test', publicKey: DEFAULT_PUBLIC_KEY }));

export const ixNodeStub: InstructionNode = {
    accounts: [],
    arguments: [],
    docs: [],
    kind: 'instructionNode',
    name: camelCase('test_instruction'),
};

export function makeVisitor(overrides?: Partial<Parameters<typeof createPdaSeedValueVisitor>[0]>) {
    return createPdaSeedValueVisitor({
        ixNode: ixNodeStub,
        programId: address(DEFAULT_PUBLIC_KEY),
        resolutionPath: undefined,
        resolversInput: undefined,
        root: rootNodeMock,
        ...overrides,
    });
}
