import { address } from '@solana/addresses';
import type { Visitor } from 'codama';
import type {
    ArrayValueNode,
    BooleanValueNode,
    BytesValueNode,
    ConstantValueNode,
    EnumValueNode,
    MapValueNode,
    NoneValueNode,
    NumberValueNode,
    PublicKeyValueNode,
    SetValueNode,
    SomeValueNode,
    StringValueNode,
    StructValueNode,
    TupleValueNode,
} from 'codama';
import { visitOrElse } from 'codama';

import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';

type ResolvedValue = {
    encoding?: string;
    kind: string;
    value: unknown;
};

type ValueNodeVisitorContext = {
    accountsInput?: AccountsInput;
    argumentsInput?: ArgumentsInput;
};

/**
 * Visitor for resolving regular ValueNode types to their typed values.
 */
export function createValueNodeVisitor(
    ctx: ValueNodeVisitorContext = {}
): Visitor<
    ResolvedValue,
    | 'arrayValueNode'
    | 'booleanValueNode'
    | 'bytesValueNode'
    | 'constantValueNode'
    | 'enumValueNode'
    | 'mapValueNode'
    | 'noneValueNode'
    | 'numberValueNode'
    | 'publicKeyValueNode'
    | 'setValueNode'
    | 'someValueNode'
    | 'stringValueNode'
    | 'structValueNode'
    | 'tupleValueNode'
> {
    return {
        visitArrayValue: (node: ArrayValueNode) => {
            // FIXME: to be implemented
            throw new AccountError(`Cannot resolve ValueNode: ${node.kind}`);
        },

        visitBooleanValue: (node: BooleanValueNode) => ({
            kind: node.kind,
            value: node.boolean,
        }),

        visitBytesValue: (node: BytesValueNode) => ({
            encoding: node.encoding,
            kind: node.kind,
            value: node.data,
        }),

        visitConstantValue: (node: ConstantValueNode) => {
            const visitor = createValueNodeVisitor(ctx);
            return visitOrElse(node.value, visitor, innerNode => {
                throw new AccountError(`Cannot resolve constantValueNode wrapping: ${innerNode.kind}`);
            });
        },

        visitEnumValue: (node: EnumValueNode) => {
            // FIXME: to be implemented
            throw new AccountError(`Cannot resolve ValueNode: ${node.kind}`);
        },

        visitMapValue: (node: MapValueNode) => {
            // FIXME: to be implemented
            throw new AccountError(`Cannot resolve ValueNode: ${node.kind}`);
        },

        visitNoneValue: (node: NoneValueNode) => ({
            kind: node.kind,
            value: null,
        }),

        visitNumberValue: (node: NumberValueNode) => ({
            kind: node.kind,
            value: node.number,
        }),

        visitPublicKeyValue: (node: PublicKeyValueNode) => ({
            kind: node.kind,
            value: address(node.publicKey),
        }),

        visitSetValue: (node: SetValueNode) => {
            // FIXME: to be implemented
            throw new AccountError(`Cannot resolve ValueNode: ${node.kind}`);
        },

        visitSomeValue: (node: SomeValueNode) => {
            const visitor = createValueNodeVisitor(ctx);
            return visitOrElse(node.value, visitor, innerNode => {
                throw new AccountError(`Cannot resolve someValueNode wrapping: ${innerNode.kind}`);
            });
        },
        
        visitStringValue: (node: StringValueNode) => ({
            kind: node.kind,
            value: node.string,
        }),

        visitStructValue: (node: StructValueNode) => {
            // FIXME: to be implemented
            throw new AccountError(`Cannot resolve ValueNode: ${node.kind}`);
        },

        visitTupleValue: (node: TupleValueNode) => {
            // FIXME: to be implemented
            throw new AccountError(`Cannot resolve ValueNode: ${node.kind}`);
        },
    };
}
