import path from 'node:path';

import { getNodeCodec } from '@codama/dynamic-codecs';
import type { Address } from '@solana/addresses';
import { unwrapOption, type Option } from '@solana/codecs';
import type { RootNode } from 'codama';
import { beforeEach, describe, expect, test } from 'vitest';

import { createProgramClient } from '../../../src';
import { loadIdl, SvmTestContext } from '../../test-utils';
import type { ExampleProgramClient } from '../../generated/example-idl-types';

describe('anchor-example', () => {
    const idl = loadIdl('example-idl.json');

    const programClient = createProgramClient<ExampleProgramClient>(idl);

    const programSoPath = path.resolve(__dirname, '..', 'target', 'deploy', 'example.so');

    let ctx: SvmTestContext;
    let payer: Address;

    beforeEach(() => {
        ctx = new SvmTestContext();
        ctx.loadProgram(programClient.programAddress, programSoPath);
        payer = ctx.createFundedAccount();
    });

    describe('pubkeySeedIx', () => {
        test('should execute instruction with pubkey seed', async () => {
            const ix = await programClient.methods
                .pubkeySeedIx({ input: 42 })
                .accounts({ signer: payer })
                .instruction();

            ctx.sendInstruction(ix, [payer]);
        });
    });

    describe('updateOptionalInput', () => {
        test('should update optional input field with and without value', async () => {
            const signer = ctx.createFundedAccount();

            const ix0 = await programClient.methods.pubkeySeedIx({ input: 42 }).accounts({ signer }).instruction();

            ctx.sendInstruction(ix0, [signer]);

            const pda = ctx.findProgramAddress(
                [
                    { type: 'string', value: 'seed' },
                    { type: 'address', value: signer },
                ],
                programClient.programAddress,
            );

            const optionalAddress = ctx.createAccount();
            const ix1 = await programClient.methods
                .updateOptionalInput({
                    input: 44,
                    optionalInput: optionalAddress,
                })
                .accounts({ signer })
                .instruction();

            ctx.sendInstruction(ix1, [signer]);

            const account1 = ctx.requireEncodedAccount(pda);
            const decoded1 = decodeDataAccount1(programClient.root, account1.data);
            expect(decoded1.optionalInput).eq(optionalAddress);

            const ix2 = await programClient.methods
                .updateOptionalInput({ input: 45, optionalInput: null })
                .accounts({ signer })
                .instruction();

            ctx.sendInstruction(ix2, [signer]);

            const account2 = ctx.requireEncodedAccount(pda);
            const decoded2 = decodeDataAccount1(programClient.root, account2.data);
            expect(decoded2.optionalInput).toBeNull();
        });
    });

    describe('updateOptionalAccount', () => {
        test('should handle optional accounts', async () => {
            const optionalAccount = ctx.createAccount();
            const ix1 = await programClient.methods
                .updateOptionalAccount({ id: 1 })
                .accounts({
                    optionalAccKey: optionalAccount,
                    signer: payer,
                })
                .instruction();

            ctx.sendInstruction(ix1, [payer]);

            const ix2 = await programClient.methods
                .updateOptionalAccount({ id: 2 })
                .accounts({
                    optionalAccKey: null,
                    signer: payer,
                })
                .instruction();

            ctx.sendInstruction(ix2, [payer]);
        });
    });

    describe('noArguments', () => {
        test('should execute instruction with no arguments', async () => {
            const account = ctx.createAccount();

            const ix = await programClient.methods
                .noArguments()
                .accounts({
                    acc: account,
                    signer: payer,
                })
                .instruction();

            ctx.sendInstruction(ix, [payer, account]);
        });
    });
});

function decodeDataAccount1(
    root: RootNode,
    data: Uint8Array,
): { bump: number; input: bigint; optionalInput: string | null } {
    const accountNode = root.program.accounts.find(a => a.name === 'dataAccount1');
    if (!accountNode) {
        throw new Error('Could not find account node "dataAccount1" in IDL');
    }

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
