import { InstructionNode, RootNode } from "codama";
import { AccountsInput, ArgumentsInput } from "./types";
import { address } from "@solana/addresses";
import { toLegacyAccountMeta } from "./accounts";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { Instruction } from "@solana/instructions";
import { resolveInstructionData } from "./instructions";

/**
 * const builder = new InstructionBuilder(root, root.program.instructions[0]);
 * const ix = await builder
 * .withAccounts({
 *    signer: address,
 * })
 * .withArguments({
 *    input: 42,
 * })
 * .build();
 */
class IxBuilder<TInstruction> {
  argumentsInput?: ArgumentsInput;
  accountsInput?: AccountsInput;

  constructor(
    public root: RootNode,
    public ixNode: InstructionNode,
  ) {}

  get programAddress(): string {
    return this.root.program.publicKey;
  }

  withArguments(args: ArgumentsInput) {
    this.argumentsInput = args;
    return this;
  }

  withAccounts(accounts: AccountsInput) {
    this.accountsInput = accounts;
    return this;
  }

  async buildIxData() {
    return resolveInstructionData(
      this.root,
      this.ixNode,
      this.argumentsInput,
      this.accountsInput,
    );
  }

  async build(): Promise<TInstruction> {
    throw new Error("Method not implemented.");
  }
}

export class InstructionBuilder extends IxBuilder<Instruction> {
  async build(): Promise<Instruction> {
    const { argumentsData, accountsData } = await this.buildIxData();
    return {
      programAddress: address(this.programAddress),
      data: argumentsData,
      accounts: accountsData
    };
  }
}

export class Web3JSInstructionBuilder extends IxBuilder<TransactionInstruction> {
  async build(): Promise<TransactionInstruction> {
    const { argumentsData, accountsData } = await this.buildIxData();
    return new TransactionInstruction({
      programId: new PublicKey(this.programAddress),
      data: Buffer.from(argumentsData),
      keys: accountsData.map(toLegacyAccountMeta),
    });
  }
}