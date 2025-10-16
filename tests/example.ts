import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import { getBase58Encoder } from "@solana/codecs";
import { Example } from "../target/types/example";
import { sleep } from "../codama/lib/util";
import { createSolanaClient, createTransaction, generateKeyPairSigner, getProgramDerivedAddress, Instruction, KeyPairSigner, lamports, lamportsToSol, SolanaClient, signTransactionMessageWithSigners } from "gill";
import { createFromJson } from "codama";
import example_idl_json from "../codama/idls/example-idl.json";
import { createIxBuilder, createWeb3JsIxBuilder } from "../codama/lib";
import { expect } from "chai";
import { address } from "@solana/addresses";
import { Keypair } from "@solana/web3.js";
import { createKeyPairSignerFromBytes } from "@solana/kit";

async function sendTx(rpcClient: SolanaClient, ix: Instruction, payer: KeyPairSigner) {
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

  const sig = await sendAndConfirmTransaction(transaction)
  .catch(err => {
    console.log("Transaction failed:", err);
    throw new Error("Transaction failed");
  });
  return { transaction, sig };
}


describe("example", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.example as Program<Example>;
  const { rpcEndpoint } = program.provider.connection;
  const programId = program.programId.toBase58();
  const programAddress = address(programId);
  const codamaFromJson = createFromJson(JSON.stringify(example_idl_json));
  const web3Payer = Keypair.generate();
  let payer: KeyPairSigner;
  let root = codamaFromJson.getRoot();
  const rpcClient = createSolanaClient({
    urlOrMoniker: rpcEndpoint,
  });
  
  before(async () => {
    // payer = await generateKeyPairSigner();
    payer = await createKeyPairSignerFromBytes(web3Payer.secretKey);
    console.log("Payer address:", payer.address);
    console.log("Payer address:", web3Payer.secretKey);
    const amount = lamports(BigInt(10e9)); // 10 SOL
    await rpcClient.rpc.requestAirdrop(payer.address, amount).send();
    await sleep(200);
  });

  it("PubkeySeedIx", async () => {
  const buildPubkeySeedIx = await createIxBuilder(root, root.program.instructions.find(ix => ix.name === "pubkeySeedIx")!);

    // const builder = new InstructionBuilder(root, root.program.instructions[0]);
    // const ix = await builder
    //   .withAccounts({
    //     signer: address,
    //   })
    //   .withArguments({
    //     input: 42,
    //   })
    //   .build();

    const ix = await buildPubkeySeedIx(
      {
        input: 42,
      },
      {
        signer: payer.address,
        // signer: "123123131231232133232232323232323232323232323232" as Address,
        // singer: address,
      },
    );

    // console.log(ix);

    const { sig } = await sendTx(rpcClient, ix, payer);
    console.log("Transaction signature:", sig);
  });


  it("UpdateOptionalInput", async () => {
    const signer = await generateKeyPairSigner();
    await rpcClient.rpc.requestAirdrop(signer.address, lamports(BigInt(1e9))).send();
    await sleep(200);

    const buildPubkeySeedIx = await createIxBuilder(root, root.program.instructions.find(ix => ix.name === "pubkeySeedIx")!);
    const ix0 = await buildPubkeySeedIx(
      {
        input: 42,
      },
      {
        signer: signer.address,
      },
    );

    await sendTx(rpcClient, ix0, signer);


    const buildUpdateOptionalInputIx = await createIxBuilder(root, root.program.instructions.find(ix => ix.name === "updateOptionalInput")!);

    // Test case 1: With optional input
    const optionalAddress = (await generateKeyPairSigner()).address;
    let ix1 = await buildUpdateOptionalInputIx(
      {
        input: 44,
        optionalInput: optionalAddress,
      },
      {
        signer: signer.address,
      }
    );
    // console.log(ix1);

    const accAddresss = (await getProgramDerivedAddress({
      programAddress,
      seeds: [Buffer.from("seed"), getBase58Encoder().encode(signer.address)],
    }))[0];

    let { sig } = await sendTx(rpcClient, ix1, signer);
    console.log("Transaction signature (with provided optional input):", sig);

    const account = await program.account.dataAccount1.fetch(accAddresss);
    // console.log("account:", account);

    expect(account.optionalInput.toBase58()).eq(optionalAddress);

    // Test case 2: Without optional input
    const ix2 = await buildUpdateOptionalInputIx(
      {
        input: 45,
        // optionalInput: null,
      },
      {
        signer: signer.address,
      }
    );

    // console.log("Ix2 without optional input:", ix2);
    const { sig: sig2 } = await sendTx(rpcClient, ix2, signer);
    await sleep(500);

    // const txInfo = await rpcClient.rpc.getTransaction(sig2).send();
    // console.log("Transaction info:", txInfo.meta.logMessages);

    const accountAfter = await program.account.dataAccount1.fetch(accAddresss);
    expect(accountAfter.optionalInput).to.be.null;
    // console.log("Transaction signature (without optional input):", sig2);
  });

  it("UpdateOptionalAccount", async () => {
    const buildUpdateOptionalAccountIx = await createIxBuilder(root, root.program.instructions.find(ix => ix.name === "updateOptionalAccount")!);

    // Test case 1: With optional account
    const optionalAddress = (await generateKeyPairSigner()).address;
    let ix = await buildUpdateOptionalAccountIx(
      { id: 1 },
      {
        signer: payer.address,
        optionalAccKey: optionalAddress,
      }
    );

    let { sig } = await sendTx(rpcClient, ix, payer);
    console.log("Transaction signature (with optional account):", sig);

    // Test case 2: Without optional account
    ix = await buildUpdateOptionalAccountIx(
      { id: 2 },
      {
        signer: payer.address,
        optionalAccKey: null,
      }
    );

    ({ sig } = await sendTx(rpcClient, ix, payer));
    console.log("Transaction signature (without optional account):", sig);
  });

  it("NoArguments", async () => {
    const buildIx = await createWeb3JsIxBuilder(root, root.program.instructions.find(ix => ix.name === "noArguments")!);

    // Test case 1: With optional account
    const kp = Keypair.generate();
    let ix = await buildIx(
      undefined,
      {
        signer: payer.address,
        acc: address(kp.publicKey.toBase58()),
      }
    );
    // console.log(ix);

    const tx = new web3.Transaction().add(ix);
    tx.recentBlockhash = (
      await program.provider.connection.getLatestBlockhash()
    ).blockhash;

    // Transfer some SOL to holder
    const sig = await web3.sendAndConfirmTransaction(
      program.provider.connection,
      tx,
      [web3Payer, kp],
      { commitment: "confirmed" },
    );

    console.log("Transaction signature", sig);
  });
});
