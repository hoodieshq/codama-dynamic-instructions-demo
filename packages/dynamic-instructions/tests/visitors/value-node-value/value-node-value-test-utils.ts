import { createValueNodeVisitor } from '../../../src/entities/visitors/value-node-value';

export function makeVisitor() {
    return createValueNodeVisitor({
        accountsInput: undefined,
        argumentsInput: undefined,
    });
}
