import type { Instruction } from '@solana/instructions';
import type { InstructionNode, RootNode } from 'codama';

import type { AccountsInput, ArgumentsInput, EitherSigners } from '../../shared/types';
import { createIxBuilder } from '../instruction-encoding/instructions';

export type SignerInput = unknown;

export class MethodsBuilder {
    private _accounts?: AccountsInput;
    private _signers?: EitherSigners; // "either" signers Account names

    constructor(
        private readonly root: RootNode,
        private readonly ixNode: InstructionNode,
        private readonly args?: ArgumentsInput,
    ) {}

    accounts(accounts: AccountsInput) {
        this._accounts = accounts;
        return this;
    }

    // Explicitly provide Account names which must be Signers.
    // This is to help InstructionAccountNode resolution with ambiguous isSigner: "either". Other signers will be auto-resolved
    signers(signers: EitherSigners) {
        this._signers = signers;
        return this;
    }

    async instruction(): Promise<Instruction> {
        const build = createIxBuilder(this.root, this.ixNode);
        return await build(this.args, this._accounts, this._signers);
    }
}
