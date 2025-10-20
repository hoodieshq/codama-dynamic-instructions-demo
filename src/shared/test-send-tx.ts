import { sleep } from "../../codama/lib/util";
import {
  createTransaction,
  Instruction,
  KeyPairSigner,
  lamports,
  SolanaClient,
} from "gill";

export async function sendTx(
  rpcClient: SolanaClient,
  ix: Instruction,
  payer: KeyPairSigner
) {
  const { rpc, sendAndConfirmTransaction } = rpcClient;
  const balance = await rpc.getBalance(payer.address).send();

  // Ensure non zero balance
  if (balance.value <= lamports(BigInt(0))) {
    const amount = lamports(BigInt(1e9)); // 1 SOL
    await rpc.requestAirdrop(payer.address, amount).send();
    await sleep(500);
  }

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const transaction = createTransaction({
    version: "legacy", // or `0` if using address lookup tables
    feePayer: payer,
    instructions: [ix],
    latestBlockhash,
  });

  const sig = await sendAndConfirmTransaction(transaction).catch((err) => {
    console.log("Transaction failed:", err);
    throw new Error("Transaction failed");
  });
  return { transaction, sig };
}
