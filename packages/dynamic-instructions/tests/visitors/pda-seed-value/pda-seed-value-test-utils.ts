import { address } from '@solana/addresses';
import type { InstructionNode } from 'codama';
import { programNode, rootNode } from 'codama';

import { createPdaSeedValueVisitor } from '../../../src/entities/visitors/pda-seed-value';

export const DEFAULT_PUBLIC_KEY = '11111111111111111111111111111111';

export const rootNodeMock = rootNode(programNode({ name: 'test', publicKey: DEFAULT_PUBLIC_KEY }));

export const ixNodeStub = {
    accounts: [],
    arguments: [],
    docs: [],
    kind: 'instructionNode',
    name: '__test__',
} as unknown as InstructionNode;

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
