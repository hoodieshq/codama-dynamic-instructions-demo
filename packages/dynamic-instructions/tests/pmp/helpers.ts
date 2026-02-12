import fs from 'node:fs';
import path from 'node:path';

import { type Address, address, getAddressEncoder } from '@solana/addresses';
import { getOptionEncoder, getStructEncoder, getU32Encoder, getU64Encoder, none, some } from '@solana/codecs';
import {
    type Buffer as PmpBuffer,
    getBufferDecoder,
    getMetadataDecoder,
    type Metadata as PmpMetadata,
} from '@solana-program/program-metadata';

import idl from '../idls/pmp-idl.json';
import type { SvmTestContext } from '../svm-test-context';

export const PMP_PROGRAM_ID = address(idl.program.publicKey);

/**
 * Creates a 16-byte seed buffer from a string for PDA derivation.
 *
 * PMP seeds are fixed-size 16-byte UTF-8 strings. If the input string is shorter
 * than 16 bytes, then we want to pad it with zeros. If longer, it's truncated.
 *
 * @param seed - The seed string (max 16 bytes UTF-8)
 * @returns A 16-byte Uint8Array
 */
export function encodeSeedForPda(seed: string): Uint8Array {
    const seedBytes = new TextEncoder().encode(seed);
    const buffer = new Uint8Array(16);
    buffer.set(seedBytes.slice(0, 16)); // Copy up to 16 bytes
    return buffer;
}

export function decodeBufferAccount(data: Uint8Array): PmpBuffer {
    const decoder = getBufferDecoder();
    return decoder.decode(data);
}

export function decodeMetadataAccount(data: Uint8Array): PmpMetadata {
    const decoder = getMetadataDecoder();
    return decoder.decode(data);
}

/**
 * Loads compiled PMP program PMP binary located at '../dumps/pmp.so' into the test context at the specified program address.
 */
export function loadPmpProgram(ctx: SvmTestContext, programAddress: Address): void {
    const programPath = path.resolve(__dirname, '..', 'dumps', 'pmp.so');
    ctx.loadProgram(programAddress, programPath);
}

/**
 * Manually creates BPF Loader Upgradeable accounts for a program in LiteSVM.
 * since LiteSVM's loadProgram() doesn't create ProgramData accounts
 *
 * This allows testing canonical vs non-canonical scenarios:
 * - Canonical: authority matches ProgramData.upgrade_authority
 * - Non-canonical: authority does NOT match ProgramData.upgrade_authority
 *
 * How it works:
 * - Derives the ProgramData address (PDA with seeds: [program_address])
 * - Reads the program bytecode from file
 * - Creates ProgramData account with custom authority + bytecode
 * - Creates Program account pointing to ProgramData
 * - Both accounts are owned by BPF Loader Upgradeable
 *
 * @param ctx - Test context
 * @param programBinaryPath - Path to program .so file
 * @param programAddress - Address of the program program
 * @param upgradeAuthority - Authority to set in ProgramData account
 * @returns { programAddress, programDataAddress }
 */
export function setUpgradeableProgramAccounts(
    ctx: SvmTestContext,
    programBinaryPath: string,
    programAddress: Address,
    upgradeAuthority: Address,
): { programAddress: Address; programDataAddress: Address } {
    const programDataAddress = ctx.findProgramAddress(
        [{ type: 'address', value: programAddress }],
        ctx.BPF_LOADER_UPGRADEABLE,
    );

    const programDataAccountBytes = encodeProgramDataAccount(upgradeAuthority);
    const programBytes = fs.readFileSync(programBinaryPath);
    const programDataAccountData = new Uint8Array([...programDataAccountBytes, ...programBytes]);

    const rentExemptBalance = ctx.minimumBalanceForRentExemption(BigInt(programDataAccountData.length));
    ctx.setAccount(programDataAddress, {
        data: programDataAccountData,
        executable: false,
        lamports: rentExemptBalance,
        owner: ctx.BPF_LOADER_UPGRADEABLE,
    });

    const programAccountBytes = encodeProgramAccount(programDataAddress);
    ctx.setAccount(programAddress, {
        data: Uint8Array.from(programAccountBytes),
        executable: true,
        lamports: rentExemptBalance,
        owner: ctx.BPF_LOADER_UPGRADEABLE,
    });

    return { programAddress, programDataAddress };
}

/** Creates ProgramData Account for BPF Loader Upgradeable. */
function encodeProgramDataAccount(authority: Address | null) {
    const encoder = getStructEncoder([
        ['discriminator', getU32Encoder()],
        ['slot', getU64Encoder()],
        ['authority', getOptionEncoder(getAddressEncoder())],
    ]);
    return encoder.encode({
        authority: authority ? some(authority) : none(),
        discriminator: 3,
        slot: 0n,
    });
}

/** Creates a Program Account for BPF Loader Upgradeable. */
function encodeProgramAccount(programDataAddress: Address) {
    const encoder = getStructEncoder([
        ['discriminator', getU32Encoder()],
        ['programData', getAddressEncoder()],
    ]);
    return encoder.encode({
        discriminator: 2,
        programData: programDataAddress,
    });
}
