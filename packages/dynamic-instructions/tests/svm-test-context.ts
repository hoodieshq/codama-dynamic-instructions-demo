import { type Address, address } from '@solana/addresses';
import type { Instruction } from '@solana/instructions';
import * as web3 from '@solana/web3.js';
import { FailedTransactionMetadata, LiteSVM } from 'litesvm';

import { toLegacyTransactionInstruction } from '../src';

/**
 * Encoded account data returned from SVM.
 */
export type EncodedAccount = {
    readonly data: Uint8Array;
    readonly executable: boolean;
    readonly lamports: bigint;
    readonly owner: Address;
    readonly rentEpoch?: bigint;
};

/**
 * Configuration options for the SVM test context.
 */
export type SvmTestContextConfig = {
    /** Include standard SPL programs (Token, Token-2022, ATA, etc.). Default: false. */
    readonly defaultPrograms?: boolean;
    /** Include standard precompiles (ed25519, secp256k1). Default: false. */
    readonly precompiles?: boolean;
};

/**
 * Test context that encapsulates LiteSVM and provides a clean Solana Kit API.
 *
 * Purpose:
 * - Hides legacy web3.js types and LiteSVM implementation details
 * - Exposes only modern Solana Kit types (Address, Instruction)
 * - Manages account lifecycle and signing internally
 * - Provides declarative test helpers (fundAccount, sendInstruction)
 *
 * Tests work exclusively with Address types while the context handles
 * keypair management and transaction building behind the scenes.
 *
 * By default, the context includes standard builtins (system program, etc.)
 * and sysvars. Use the config parameter to include additional programs.
 */
export class SvmTestContext {
    private readonly svm: LiteSVM;
    private readonly accounts: Map<Address, web3.Keypair>;
    private currentSlot: bigint;

    readonly TOKEN_PROGRAM_ADDRESS = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
    readonly ASSOCIATED_TOKEN_PROGRAM_ADDRESS = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    readonly SYSTEM_PROGRAM_ADDRESS = address(web3.SystemProgram.programId.toBase58());
    readonly SYSVAR_RENT_ADDRESS = address(web3.SYSVAR_RENT_PUBKEY.toBase58());
    readonly BPF_LOADER_UPGRADEABLE = address('BPFLoaderUpgradeab1e11111111111111111111111');

    constructor(config: SvmTestContextConfig = {}) {
        let svm = new LiteSVM();
        if (config.defaultPrograms) {
            svm = svm.withDefaultPrograms();
        }
        if (config.precompiles) {
            svm = svm.withPrecompiles();
        }
        this.svm = svm;
        this.accounts = new Map();
        this.currentSlot = BigInt(0);
    }

    /** Creates a new keypair, stores it in the context, and returns its address. */
    createAccount(): Address {
        const keypair = web3.Keypair.generate();
        const addr = address(keypair.publicKey.toBase58());
        this.accounts.set(addr, keypair);
        return addr;
    }

    /** Creates an account and airdrops the given lamports to it. */
    createFundedAccount(lamports: bigint = BigInt(10e9)): Address {
        const addr = this.createAccount();
        const keypair = this.accounts.get(addr);
        if (!keypair) {
            throw new Error(`Account ${addr} not found after createAccount`);
        }
        this.svm.airdrop(keypair.publicKey, lamports);
        return addr;
    }

    /** Derives an address from base + seed + programId (createWithSeed). Does not store a keypair. */
    async createAccountWithSeed(base: Address, seed: string, programId: Address): Promise<Address> {
        const derived = await web3.PublicKey.createWithSeed(
            new web3.PublicKey(base),
            seed,
            new web3.PublicKey(programId),
        );
        return address(derived.toBase58());
    }

    /** Airdrops lamports to an account. Account must have been created via this context. */
    airdrop(account: Address, lamports: bigint = BigInt(1e9)): void {
        const keypair = this.accounts.get(account);
        if (!keypair) {
            throw new Error(`Account ${account} not found in context`);
        }
        this.svm.airdrop(keypair.publicKey, lamports);
    }

    /** Airdrops lamports to any address on-chain (e.g. PDAs without stored keypairs). */
    airdropToAddress(account: Address, lamports: bigint = BigInt(1e9)): void {
        this.svm.airdrop(new web3.PublicKey(account), lamports);
    }

    /**
     * Sets account data directly on any address.
     * @param account - The account address to set
     * @param accountData - The account data including lamports, data, owner, executable
     */
    setAccount(
        account: Address,
        accountData: {
            readonly data: Uint8Array;
            readonly executable?: boolean;
            readonly lamports: bigint;
            readonly owner: Address;
        },
    ): void {
        const pubkey = new web3.PublicKey(account);
        this.svm.setAccount(pubkey, {
            data: Buffer.from(accountData.data),
            executable: accountData.executable ?? false,
            lamports: Number(accountData.lamports),
            owner: new web3.PublicKey(accountData.owner),
        });
    }

    /** Returns the account's lamport balance, or null if the account is unknown to the SVM. */
    getBalance(account: Address): bigint | null {
        const keypair = this.accounts.get(account);
        if (!keypair) {
            return this.svm.getBalance(new web3.PublicKey(account));
        }
        return this.svm.getBalance(keypair.publicKey);
    }

    /** Same as getBalance but returns 0n when the account is missing. */
    getBalanceOrZero(account: Address): bigint {
        return this.getBalance(account) ?? BigInt(0);
    }

    /** Fetches full account data (lamports, owner, data, executable). Returns null if not found. */
    fetchEncodedAccount(account: Address): EncodedAccount | null {
        const keypair = this.accounts.get(account);
        const pubkey = keypair ? keypair.publicKey : new web3.PublicKey(account);
        const accountInfo = this.svm.getAccount(pubkey);

        if (!accountInfo) {
            return null;
        }

        return {
            data: accountInfo.data,
            executable: accountInfo.executable,
            lamports: BigInt(accountInfo.lamports),
            owner: address(accountInfo.owner.toBase58()),
            ...(accountInfo.rentEpoch !== undefined && { rentEpoch: BigInt(accountInfo.rentEpoch) }),
        };
    }

    /** Like fetchEncodedAccount but throws if the account does not exist. */
    requireEncodedAccount(account: Address): EncodedAccount {
        const encodedAccount = this.fetchEncodedAccount(account);
        if (!encodedAccount) {
            throw new Error(`Account ${account} does not exist`);
        }
        return encodedAccount;
    }

    /** Builds, signs, and sends a transaction with a single instruction. Signers must be context-owned. */
    sendInstruction(instruction: Instruction, signers: Address[]): void {
        if (signers.length === 0) {
            throw new Error('At least one signer is required');
        }

        const keypairs = signers.map(addr => {
            const keypair = this.accounts.get(addr);
            if (!keypair) {
                throw new Error(`Signer ${addr} not found in context`);
            }
            return keypair;
        });

        const legacyIx = toLegacyTransactionInstruction(instruction);
        const transaction = new web3.Transaction().add(legacyIx);
        const feePayer = keypairs[0];
        if (!feePayer) throw new Error('No signers');
        transaction.feePayer = feePayer.publicKey;
        transaction.recentBlockhash = this.svm.latestBlockhash();
        transaction.sign(...keypairs);

        const result = this.svm.sendTransaction(transaction);
        if (result instanceof FailedTransactionMetadata) {
            console.error('Transaction failed, logs:\n', result.meta().prettyLogs());
            throw new Error(`Transaction failed: ${result.toString()}`);
        }
    }

    /** Builds, signs, and sends a transaction with multiple instructions. Signers must be context-owned. */
    sendInstructions(instructions: Instruction[], signers: Address[]): void {
        if (signers.length === 0) {
            throw new Error('At least one signer is required');
        }

        const keypairs = signers.map(addr => {
            const keypair = this.accounts.get(addr);
            if (!keypair) {
                throw new Error(`Signer ${addr} not found in context`);
            }
            return keypair;
        });

        const transaction = new web3.Transaction();
        for (const instruction of instructions) {
            const legacyIx = toLegacyTransactionInstruction(instruction);
            transaction.add(legacyIx);
        }

        const feePayer = keypairs[0];
        if (!feePayer) throw new Error('No signers');
        transaction.feePayer = feePayer.publicKey;
        transaction.recentBlockhash = this.svm.latestBlockhash();
        transaction.sign(...keypairs);

        const result = this.svm.sendTransaction(transaction);
        if (result instanceof FailedTransactionMetadata) {
            throw new Error(`Transaction failed: ${result.toString()}`);
        }
    }

    /** Warps the SVM to the specified slot. */
    warpToSlot(slot: bigint): void {
        this.currentSlot = slot;
        this.svm.warpToSlot(slot);
    }

    /** Advances the SVM by the specified number of slots (default: 1). */
    advanceSlots(count: bigint = BigInt(1)): void {
        this.currentSlot += count;
        this.svm.warpToSlot(this.currentSlot);
        this.svm.expireBlockhash();
    }

    /** Loads a Solana program from a .so file. */
    loadProgram(programAddress: Address, programPath: string): void {
        const programId = new web3.PublicKey(programAddress);
        this.svm.addProgramFromFile(programId, programPath);
    }

    /** Calculates the minimum balance required to make an account with the given data length rent-exempt. */
    getMinimumBalanceForRentExemption(dataLen: bigint): bigint {
        return this.svm.minimumBalanceForRentExemption(dataLen);
    }

    /** Calculates the minimum balance required to make an account with specified data length rent exempt. */
    minimumBalanceForRentExemption(dataLen: bigint): bigint {
        return this.svm.minimumBalanceForRentExemption(dataLen);
    }

    /** Returns the underlying LiteSVM instance for direct use when needed. Consider using the public methods instead. */
    getSvm(): LiteSVM {
        return this.svm;
    }
}
