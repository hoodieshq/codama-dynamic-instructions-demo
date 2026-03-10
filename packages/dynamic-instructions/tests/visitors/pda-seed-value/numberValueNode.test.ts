import { address } from '@solana/addresses';
import type { InstructionNode } from 'codama';
import { numberValueNode, programNode, rootNode } from 'codama';
import { describe, expect, test } from 'vitest';

import { createPdaSeedValueVisitor } from '../../../src/entities/visitors/pda-seed-value';
import { AccountError } from '../../../src/shared/errors';

const DEFAULT_PUBLIC_KEY = '11111111111111111111111111111111';

describe('pda-seed-value: visitNumberValue', () => {

    const rootNodeMock = rootNode(programNode({ name: 'test', publicKey: DEFAULT_PUBLIC_KEY }));
    const stubIxNode = {
        accounts: [],
        arguments: [],
        docs: [],
        kind: 'instructionNode',
        name: '__test__',
    } as unknown as InstructionNode;

    function makeVisitor() {
        return createPdaSeedValueVisitor({
            ixNode: stubIxNode,
            programId: address(DEFAULT_PUBLIC_KEY),
            resolutionPath: undefined,
            resolversInput: undefined,
            root: rootNodeMock,
        });
    }

    test('should encode 0 as single byte', async () => {
        const result = await makeVisitor().visitNumberValue(numberValueNode(0));
        expect(result).toEqual(new Uint8Array([0]));
    });

    test('should encode 255 as single byte', async () => {
        const result = await makeVisitor().visitNumberValue(numberValueNode(255));
        expect(result).toEqual(new Uint8Array([255]));
    });

    test('should throw for value > 255', () => {
        expect(() => makeVisitor().visitNumberValue(numberValueNode(256))).toThrow(AccountError);
        expect(() => makeVisitor().visitNumberValue(numberValueNode(256))).toThrow(
            /cannot be encoded as a single byte/,
        );
    });

    test('should throw for negative value', () => {
        expect(() => makeVisitor().visitNumberValue(numberValueNode(-1))).toThrow(AccountError);
    });

    test('should throw for non-integer value', () => {
        expect(() => makeVisitor().visitNumberValue(numberValueNode(1.5))).toThrow(AccountError);
    });

    test('should throw for large value', () => {
        expect(() => makeVisitor().visitNumberValue(numberValueNode(70000))).toThrow(
            /cannot be encoded as a single byte/,
        );
    });
});
