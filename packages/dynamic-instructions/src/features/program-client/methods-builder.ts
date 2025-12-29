import type { Instruction } from '@solana/instructions';
import type { InstructionNode, RootNode } from 'codama';

import type { AccountsInput, ArgumentsInput } from '../../shared/types';
import { createIxBuilder } from '../instruction-encoding/instructions';

export type SignerInput = unknown;

export class MethodsBuilder {
    private _accounts?: AccountsInput;

    constructor(
        private readonly root: RootNode,
        private readonly ixNode: InstructionNode,
        private readonly args?: ArgumentsInput
    ) {}

    accounts(accounts: AccountsInput) {
        this._accounts = accounts;
        return this;
    }

    async instruction(): Promise<Instruction> {
        const build = await createIxBuilder(this.root, this.ixNode);
        return await build(this.args, this._accounts);
    }
}
