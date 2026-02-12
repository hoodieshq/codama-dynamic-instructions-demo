import type { Address } from '@solana/addresses';

import type { SplAssociatedTokenAccountProgramClient } from '../generated/associated-token-account-idl-types';
import type { SystemProgramClient } from '../generated/system-program-idl-types';
import type { TokenProgramClient } from '../generated/token-idl-types';
import { createTestProgramClient, SvmTestContext } from '../test-utils';

export function createAtaTestContext() {
    const ataClient = createTestProgramClient<SplAssociatedTokenAccountProgramClient>('associated-token-account-idl.json');
    const tokenClient = createTestProgramClient<TokenProgramClient>('token-idl.json');
    const systemClient = createTestProgramClient<SystemProgramClient>('system-program-idl.json');
    const ctx = new SvmTestContext({ defaultPrograms: true });

    return { ataClient, tokenClient, systemClient, ctx };
}

export type AtaTestContext = ReturnType<typeof createAtaTestContext>;

export async function createMint(
    { ctx, systemClient, tokenClient }: Pick<AtaTestContext, 'ctx' | 'systemClient' | 'tokenClient'>,
    payer: Address,
    mint: Address,
    mintAuthority: Address,
): Promise<void> {
    const createMintAccountIx = await systemClient.methods
        .createAccount({ lamports: 1_461_600n, space: 82, programAddress: tokenClient.programAddress })
        .accounts({ payer, newAccount: mint })
        .instruction();
    ctx.sendInstruction(createMintAccountIx, [payer, mint]);

    const initializeMintIx = await tokenClient.methods
        .initializeMint({ decimals: 9, mintAuthority, freezeAuthority: null })
        .accounts({ mint })
        .instruction();
    ctx.sendInstruction(initializeMintIx, [payer]);
}

export function deriveAta(
    { ctx, tokenClient, ataClient }: Pick<AtaTestContext, 'ctx' | 'tokenClient' | 'ataClient'>,
    wallet: Address,
    mint: Address,
): Address {
    return ctx.findProgramAddress(
        [
            { type: 'address', value: wallet },
            { type: 'address', value: tokenClient.programAddress },
            { type: 'address', value: mint },
        ],
        ataClient.programAddress,
    );
}
