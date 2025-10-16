import { TransactionInstruction } from "@solana/web3.js";
import { Instruction } from "@solana/instructions";
import { Address } from "@solana/addresses";

export type AccountsInput = Partial<Record<string, Address>>;
export type ArgumentsInput = Partial<Record<string, unknown>>;

type TBuildIxFn<TInstruction> = (argumentsInput?: ArgumentsInput, accountsInput?: AccountsInput) => Promise<TInstruction>;
export type BuildIxFn = TBuildIxFn<Instruction>;

// TODO: notice that accountsInput accepts Address type from @solana/addresses, so users would need to convert PublicKey to Address via getAddressFromPublicKey
export type BuildWeb3JsIxFn = TBuildIxFn<TransactionInstruction>;
