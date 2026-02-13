import {
    bytesTypeNode,
    definedTypeLinkNode,
    definedTypeNode,
    numberTypeNode,
    programNode,
    rootNode,
    structFieldTypeNode,
    structTypeNode,
} from 'codama';
import { describe, expect, test } from 'vitest';

import { createInputValueTransformer } from '../../../src/entities/visitors/input-value-transformer';
import { rootNodeMock } from './test-helpers';

describe('definedTypeLinkNode', () => {
    test('should resolve definedTypeLinkNode', () => {
        const root = rootNode(
            programNode({
                definedTypes: [
                    definedTypeNode({
                        name: 'MyData',
                        type: bytesTypeNode(),
                    }),
                ],
                name: 'test',
                publicKey: '11111111111111111111111111111111',
            }),
        );

        const transformer = createInputValueTransformer(definedTypeLinkNode('MyData'), root, {
            bytesEncoding: 'base16',
        });

        const input = new Uint8Array([1, 2]);
        expect(transformer(input)).toEqual(['base16', '0102']);
    });

    test('should throw error on unresolvable definedTypeLinkNode', () => {
        expect(() => {
            createInputValueTransformer(definedTypeLinkNode('nonExistent'), rootNodeMock, { bytesEncoding: 'base16' });
        }).toThrow('Cannot resolve defined type link: nonExistent');
    });

    test('should handle nested definedTypeLinkNode with bytes', () => {
        const root = rootNode(
            programNode({
                definedTypes: [
                    definedTypeNode({
                        name: 'NestedBytes',
                        type: structTypeNode([
                            structFieldTypeNode({ name: 'inner', type: bytesTypeNode() }),
                            structFieldTypeNode({ name: 'count', type: numberTypeNode('u32') }),
                        ]),
                    }),
                ],
                name: 'test',
                publicKey: '11111111111111111111111111111111',
            }),
        );

        const linkNode = definedTypeLinkNode('NestedBytes');
        const transformer = createInputValueTransformer(linkNode, root, { bytesEncoding: 'base16' });

        const input = { count: 5, inner: new Uint8Array([0x99, 0x88]) };
        expect(transformer(input)).toEqual({ count: 5, inner: ['base16', '9988'] });
    });
});
