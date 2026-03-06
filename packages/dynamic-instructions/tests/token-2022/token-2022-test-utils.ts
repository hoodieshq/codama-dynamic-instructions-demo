import type { Address } from '@solana/addresses';
import { getMintSize, getTokenSize } from '@solana-program/token-2022';

import type { SystemProgramClient } from '../generated/system-program-idl-types';
import type { Token2022ProgramClient } from '../generated/token-2022-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

export const token2022Client = createTestProgramClient<Token2022ProgramClient>('token-2022-idl.json');
export const systemClient = createTestProgramClient<SystemProgramClient>('system-program-idl.json');

export const TOKEN_2022_MINT_SIZE = getMintSize();
export const TOKEN_2022_ACCOUNT_SIZE = getTokenSize();
export const TOKEN_2022_MULTISIG_SIZE = 355;

// Creates basic mint without extensions.
export async function createMint(
    ctx: SvmTestContext,
    payer: Address,
    mint: Address,
    mintAuthority: Address,
    freezeAuthority?: Address,
    space = TOKEN_2022_MINT_SIZE,
): Promise<void> {
    const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(space));
    const createMintAccountIx = await systemClient.methods
        .createAccount({ lamports, programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS, space })
        .accounts({ newAccount: mint, payer })
        .instruction();
    ctx.sendInstruction(createMintAccountIx, [payer, mint]);

    const initializeMintIx = await token2022Client.methods
        .initializeMint({ decimals: 9, freezeAuthority: freezeAuthority ?? null, mintAuthority })
        .accounts({ mint })
        .instruction();
    ctx.sendInstruction(initializeMintIx, [payer]);
}

// Creates basic token account without extensions.
export async function createTokenAccount(
    ctx: SvmTestContext,
    payer: Address,
    account: Address,
    mint: Address,
    owner: Address,
    space = TOKEN_2022_ACCOUNT_SIZE,
): Promise<void> {
    const lamports = ctx.getMinimumBalanceForRentExemption(BigInt(space));
    const createAccountIx = await systemClient.methods
        .createAccount({ lamports, programAddress: ctx.TOKEN_2022_PROGRAM_ADDRESS, space })
        .accounts({ newAccount: account, payer })
        .instruction();

    const initAccountIx = await token2022Client.methods
        .initializeAccount()
        .accounts({ account, mint, owner })
        .instruction();

    ctx.sendInstructions([createAccountIx, initAccountIx], [payer, account]);
}

export async function mintTokens(
    ctx: SvmTestContext,
    payer: Address,
    mint: Address,
    destination: Address,
    mintAuthority: Address,
    amount: number,
): Promise<void> {
    const mintIx = await token2022Client.methods
        .mintTo({ amount })
        .accounts({ mint, mintAuthority, token: destination })
        .instruction();
    ctx.sendInstruction(mintIx, [payer, mintAuthority]);
}
