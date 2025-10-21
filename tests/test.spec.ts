import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import { getBase58Encoder } from "@solana/codecs";
import { Example } from "../target/types/example";
import { sleep } from "../codama/lib/util";
import { createTransaction } from "gill";
import {
  createSolanaClient,
  generateKeyPairSigner,
  getProgramDerivedAddress,
  KeyPairSigner,
  lamports,
} from "gill";
import {
  camelCase,
  createFromJson,
  InstructionNode,
  ProgramNode,
  visit,
  Visitor,
} from "codama";
import example_idl_json from "../codama/idls/example-idl.json";
import pmpm_idl_json from "../codama/idls/codama-1.0.0-ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S.json";
import { createIxBuilder, createWeb3JsIxBuilder } from "../codama/lib";
import { expect } from "chai";
import { address } from "@solana/addresses";
import { Keypair } from "@solana/web3.js";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { sendTx } from "../src/shared/test-send-tx";
import {
  getResolvedInstructionInputsVisitor,
  getInstructionDependencies,
} from "@codama/visitors-core";

/**
 *  Example for building a visitor that do the search for instruction by name
 *
 *  Example:
 *  ```
 *  const instruction = visit(
      root.program,
      instructionVisitFactoryByName(camelCase("pubkeySeedIx"))
    );
 *  ```
 *  Possible improvement: Build a Visitor (with use of extendVisitor) that allows to wrap up each instruction with "createIxBuilder"
 */
function instructionVisitFactoryByName(name: InstructionNode["name"]) {
  const visitor: Visitor<null | ProgramNode["instructions"][number], any> = {
    visitProgram: (node: ProgramNode) => {
      const instruction = node.instructions.find((ix) => ix.name === name);
      return instruction ?? null;
    },
  };

  return visitor;
}

describe("===\r\nSpecs with visitor\r\n===", () => {
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

  it("should be able to build sample to call the instruction with visitor", async () => {
    const instruction = visit(
      root.program,
      instructionVisitFactoryByName(camelCase("pubkeySeedIx"))
    );

    const buildPubkeySeedIx = await createIxBuilder(root, instruction!);

    // QUESTION(api): is existing api for the builder sufficient?
    // another way: anchor-like api (.method["NAME"].accounts().signers().instruction()) ../codama/lib/builders.ts #L55
    const ix = await buildPubkeySeedIx(
      {
        input: 42,
      },
      {
        signer: payer.address,
        // signer: "123123131231232133232232323232323232323232323232" as Address,
        // singer: address,
      }
    );

    console.log("Instruction:", ix);

    const { sig } = await sendTx(rpcClient, ix, payer);
    console.log("Transaction signature:", sig);
  });
});

describe("===\r\nSpecs with visitor for Codama\r\n===", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.example as Program<Example>;
  const { rpcEndpoint } = program.provider.connection;
  const programId = program.programId.toBase58();
  const programAddress = address(programId);
  const codamaFromJson = createFromJson(JSON.stringify(pmpm_idl_json));
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

  it("should be able to build sample to call the instruction with visitor", async () => {
    const instruction = visit(
      root.program,
      instructionVisitFactoryByName(camelCase("write"))
    );

    const resolvedInputs = visit(
      instruction,
      getResolvedInstructionInputsVisitor({
        includeDataArgumentValueNodes: true,
      })
    );

    // PROBLEM: resolvedInputs does not match the "write" instruction arguments

    console.log(
      { resolvedInputs },
      "TYPES:",
      resolvedInputs.map((a) => {
        return a.type ? a.type : null;
      })
    );

    const buildPubkeySeedIx = await createIxBuilder(root, instruction!);

    // QUESTION(api): is existing api for the builder sufficient?
    // another way: anchor-like api (.method["NAME"].accounts().signers().instruction()) ../codama/lib/builders.ts #L55
    const ix = await buildPubkeySeedIx(
      {
        // offset: 0,
      },
      {
        buffer: address(Keypair.generate().publicKey.toString()),
        authority: payer.address,
      }
    );

    console.log("Instruction:", ix);

    const tx = createTransaction({
      version: "legacy", // or `0` if using address lookup tables
      feePayer: payer,
      instructions: [ix],
      latestBlockhash: (await rpcClient.rpc.getLatestBlockhash()).value
        .blockhash,
    });

    const logs = await rpcClient.simulateTransaction(tx);
    console.log("Simulation logs:", logs);
    // const { sig } = await sendTx(rpcClient, ix, payer);
    // console.log("Transaction signature:", sig);
  });
});
