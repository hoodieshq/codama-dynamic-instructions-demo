import { readFileSync } from 'node:fs';
import path from 'node:path';

import { getNodeCodec } from '@codama/dynamic-codecs';
import { address } from '@solana/addresses';
import type { Option } from '@solana/codecs';
import { unwrapOption } from '@solana/codecs';
import type { Instruction } from '@solana/instructions';
import * as web3 from '@solana/web3.js';
import type { RootNode } from 'codama';
import { LiteSVM } from 'litesvm';
import { beforeEach, describe, expect, test } from 'vitest';

import { createProgramClient, toLegacyTransactionInstruction } from '../../../src';

function sendTx(svm: LiteSVM, ix: Instruction, signers: web3.Keypair[]) {
    if (signers.length === 0) throw new Error('sendTx: expected at least 1 signer');

    const tx = new web3.Transaction().add(toLegacyTransactionInstruction(ix));
    tx.feePayer = signers[0].publicKey;
    tx.recentBlockhash = svm.latestBlockhash();
    tx.sign(...signers);

    const sig = svm.sendTransaction(tx);
    return { sig, tx };
}

describe('anchor-example', () => {
    const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

    const idlPath = path.resolve(__dirname, '..', 'prebuilt-idls', 'example-idl.json');
    const idlJson: unknown = JSON.parse(readFileSync(idlPath, 'utf8'));
    if (typeof idlJson !== 'object' || idlJson === null) throw new Error('Invalid IDL json');
    const programClient = createProgramClient(idlJson);
    const programId = new web3.PublicKey(programClient.programAddress);

    const programSoPath = path.resolve(__dirname, '..', 'target', 'deploy', 'example.so');

    let svm: LiteSVM;
    let payerKp: web3.Keypair;

    beforeEach(async () => {
        svm = new LiteSVM();
        svm.addProgramFromFile(programId, programSoPath);

        payerKp = web3.Keypair.generate();
        svm.airdrop(payerKp.publicKey, BigInt(10e9)); // 10 SOL
        await sleep(1);
    });

    test('PubkeySeedIx', async () => {
        const ix = await programClient.methods
            .pubkeySeedIx({ input: 42 })
            .accounts({
                signer: address(payerKp.publicKey.toBase58()),
            })
            .instruction();

        const { sig } = sendTx(svm, ix, [payerKp]);
        console.log('Transaction signature:', sig);
    });

    test('UpdateOptionalInput', async () => {
        const signerKp = web3.Keypair.generate();
        svm.airdrop(signerKp.publicKey, BigInt(1e9)); // 1 SOL
        await sleep(1);
        const signerAddress = address(signerKp.publicKey.toBase58());

        const ix0 = await programClient.methods
            .pubkeySeedIx({ input: 42 })
            .accounts({ signer: signerAddress })
            .instruction();

        sendTx(svm, ix0, [signerKp]);

        // Test case 1: With optional input
        const optionalAddress = web3.Keypair.generate().publicKey.toBase58();
        const ix1 = await programClient.methods
            .updateOptionalInput({
                input: 44,
                optionalInput: optionalAddress,
            })
            .accounts({ signer: signerAddress })
            .instruction();

        const [accAddress] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from('seed'), new web3.PublicKey(signerAddress).toBuffer()],
            programId,
        );
        const accAddresss = accAddress.toBase58();

        const { sig } = sendTx(svm, ix1, [signerKp]);
        console.log('Transaction signature (with provided optional input):', sig);

        const accInfo = svm.getAccount(new web3.PublicKey(accAddresss));
        expect(accInfo).toBeTruthy();
        if (!accInfo) throw new Error('Expected account to exist');
        const decoded1 = decodeDataAccount1(programClient.root, accInfo.data);
        expect(decoded1.optionalInput).eq(optionalAddress);

        // Test case 2: Without optional input
        const ix2 = await programClient.methods
            .updateOptionalInput({
                input: 45,
            })
            .accounts({ signer: signerAddress })
            .instruction();

        sendTx(svm, ix2, [signerKp]);
        await sleep(1);

        const accInfoAfter = svm.getAccount(new web3.PublicKey(accAddresss));
        expect(accInfoAfter).toBeTruthy();
        if (!accInfoAfter) throw new Error('Expected account to exist');
        const decoded2 = decodeDataAccount1(programClient.root, accInfoAfter.data);
        expect(decoded2.optionalInput).toBeNull();
    });

    test('UpdateOptionalAccount', async () => {
        // Test case 1: With optional account
        const optionalAddress = web3.Keypair.generate().publicKey.toBase58();
        let ix = await programClient.methods
            .updateOptionalAccount({ id: 1 })
            .accounts({
                optionalAccKey: optionalAddress,
                signer: address(payerKp.publicKey.toBase58()),
            })
            .instruction();

        let { sig } = sendTx(svm, ix, [payerKp]);
        console.log('Transaction signature (with optional account):', sig);

        // Test case 2: Without optional account
        ix = await programClient.methods
            .updateOptionalAccount({ id: 2 })
            .accounts({
                optionalAccKey: null,
                signer: address(payerKp.publicKey.toBase58()),
            })
            .instruction();

        ({ sig } = sendTx(svm, ix, [payerKp]));
        console.log('Transaction signature (without optional account):', sig);
    });

    test('NoArguments', async () => {
        const kp = web3.Keypair.generate();
        const ix = await programClient.methods
            .noArguments()
            .accounts({
                acc: address(kp.publicKey.toBase58()),
                signer: address(payerKp.publicKey.toBase58()),
            })
            .instruction();
        const { sig } = sendTx(svm, ix, [payerKp, kp]);

        console.log('Transaction signature', sig);
    });
});

function decodeDataAccount1(
    root: RootNode,
    data: Uint8Array,
): { bump: number; input: bigint; optionalInput: string | null } {
    const accountNode = root.program.accounts.find(a => a.name === 'dataAccount1');
    if (!accountNode) throw new Error('Could not find account node "dataAccount1" in IDL');

    // This codec is derived from the Codama IDL; it handles discriminator + optional encoding.
    const codec = getNodeCodec([root, root.program, accountNode]);
    const decoded = codec.decode(Uint8Array.from(data)) as {
        bump: number;
        input: bigint;
        optionalInput: Option<string>;
    };

    return {
        bump: decoded.bump,
        input: decoded.input,
        optionalInput: unwrapOption<string>(decoded.optionalInput),
    };
}
