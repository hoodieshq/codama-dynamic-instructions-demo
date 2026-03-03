import type { Address } from '@solana/addresses';
import {
    addEncoderSizePrefix,
    getOptionEncoder,
    getU8Encoder,
    getU32Encoder,
    getUtf8Encoder,
    none,
    some,
} from '@solana/codecs';
import { beforeEach, describe, expect, test } from 'vitest';

import { type ResolverArgsTestProgramClient } from '../generated/resolver-args-test-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

const client = createTestProgramClient<ResolverArgsTestProgramClient>('resolver-args-test-idl.json');

const utf8Encoder = getUtf8Encoder();
const u32Encoder = getU32Encoder();
const u8Encoder = getU8Encoder();
const stringEncoder = addEncoderSizePrefix(utf8Encoder, u32Encoder);

/**
 * Concat arguments to ix data bytes for createItem:
 *   [discriminator: u8] [name: utf8] + [description: optional(utf8)] + [tags: optional(u8)]
 */
function expectedData({
    name,
    description,
    tags,
}: {
    description?: string | null;
    name: string;
    tags?: number | null;
}): Uint8Array {
    const discriminator = new Uint8Array([8]);
    const nameBytes = stringEncoder.encode(name);
    const descriptionBytes = getOptionEncoder(stringEncoder).encode(description ? some(description) : none());
    const tagsBytes = getOptionEncoder(u8Encoder).encode(tags ? some(tags) : none());

    return new Uint8Array([...discriminator, ...nameBytes, ...descriptionBytes, ...tagsBytes]);
}

describe('Argument-level ResolverValueNode', () => {
    let authority: Address;
    let ctx: SvmTestContext;

    beforeEach(() => {
        ctx = new SvmTestContext();
        authority = ctx.createFundedAccount();
    });

    test('should resolve omitted argument via resolver', async () => {
        const ix = await client.methods
            .createItem({ name: 'hello' })
            .accounts({ authority })
            .resolvers({ resolveDescription: () => Promise.resolve('auto-filled') })
            .instruction();

        expect(ix.data).toEqual(expectedData({ description: 'auto-filled', name: 'hello', tags: null }));
    });

    test('should bypass resolver when argument is explicitly provided', async () => {
        const ix = await client.methods
            .createItem({ description: 'explicit', name: 'hello' })
            .accounts({ authority })
            .resolvers({
                resolveDescription: () => {
                    throw new Error('should not be called');
                },
            })
            .instruction();

        expect(ix.data).toEqual(expectedData({ description: 'explicit', name: 'hello', tags: null }));
    });

    test('should call multiple resolvers independently', async () => {
        const ix = await client.methods
            .createItem({ name: 'multi' })
            .accounts({ authority })
            .resolvers({
                resolveDescription: () => Promise.resolve('desc'),
                resolveTags: () => Promise.resolve(42),
            })
            .instruction();

        expect(ix.data).toEqual(expectedData({ description: 'desc', name: 'multi', tags: 42 }));
    });

    test('should pass argumentsInput and accountsInput context to resolver', async () => {
        const expectedArgs = { name: 'context' };
        const expectedAccounts = { authority };
        const capturedArgs: Record<string, unknown> = {};
        const capturedAccounts: Record<string, unknown> = {};

        await client.methods
            .createItem(expectedArgs)
            .accounts(expectedAccounts)
            .resolvers({
                resolveDescription: (args, accounts) => {
                    Object.assign(capturedArgs, args);
                    Object.assign(capturedAccounts, accounts);
                    return Promise.resolve(capturedArgs);
                },
            })
            .instruction();

        expect(capturedArgs).toEqual(expectedArgs);
        expect(capturedAccounts).toEqual(expectedAccounts);
    });

    test('should omit optional argument when no resolver provided', async () => {
        const ix = await client.methods.createItem({ name: 'no-resolver' }).accounts({ authority }).instruction();

        expect(ix.data).toEqual(expectedData({ description: null, name: 'no-resolver', tags: null }));
    });
});
