import type { Address, ProgramDerivedAddress } from '@solana/addresses';
import { address, getProgramDerivedAddress } from '@solana/addresses';
import type { ReadonlyUint8Array } from '@solana/codecs';
import type {
    InstructionAccountNode,
    InstructionNode,
    PdaNode,
    PdaSeedValueNode,
    PdaValueNode,
    RegisteredPdaSeedNode,
    RootNode,
    VariablePdaSeedNode,
} from 'codama';
import { isNode, visitOrElse } from 'codama';

import { createPdaSeedValueVisitor } from '../../entities/visitors/pda-seed-value';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput, ResolutionPath } from '../../shared/types';
import { invariant } from '../../shared/util';

type PdaDerivationContext = {
    accountsInput: AccountsInput | undefined;
    argumentsInput: ArgumentsInput | undefined;
    ixAccountNode: InstructionAccountNode;
    ixNode: InstructionNode;
    pdaValueNode: PdaValueNode;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
};

export async function derivePDA({
    root,
    ixNode,
    ixAccountNode,
    argumentsInput = {},
    accountsInput = {},
    pdaValueNode,
    resolutionPath,
}: PdaDerivationContext): Promise<ProgramDerivedAddress | null> {
    if (!isNode(pdaValueNode, 'pdaValueNode')) {
        throw new AccountError(`Account node ${ixAccountNode.name} is not a PDA`);
    }

    const pdaNode = resolvePdaNode(pdaValueNode, root.program.pdas);
    const programId = address(pdaNode.programId || root.program.publicKey);

    const seedValues = await Promise.all(
        pdaNode.seeds.map(async seedNode => {
            if (seedNode.kind === 'constantPdaSeedNode') {
                return await resolveConstantPdaSeed({
                    ixNode,
                    programId,
                    resolutionPath,
                    root,
                    seedNode,
                });
            } else if (seedNode.kind === 'variablePdaSeedNode') {
                // Variable seeds depend on instruction arguments or accounts
                const variableSeedValueNodes = pdaValueNode.seeds;
                const seedName = seedNode.name;
                const variableSeedValueNode = variableSeedValueNodes.find(node => node.name === seedName);
                if (!variableSeedValueNode) {
                    throw new AccountError(
                        `PDA Node ${pdaNode.name}. Variable PDA SeedValueNode ${seedName} was not found for ${ixAccountNode.name} account`,
                    );
                }
                return await resolveVariablePdaSeed({
                    accountsInput,
                    argumentsInput,
                    ixNode,
                    programId,
                    resolutionPath,
                    root,
                    seedNode,
                    variableSeedValueNode,
                });
            }

            throw new AccountError(
                `PDA node: ${pdaNode.name}. Unsupported seed kind ${(seedNode as { kind?: string }).kind}`,
            );
        }),
    );

    return await getProgramDerivedAddress({
        programAddress: programId,
        seeds: seedValues,
    });
}

function resolvePdaNode(pdaDefaultValue: PdaValueNode, pdas: PdaNode[]): PdaNode {
    if (isNode(pdaDefaultValue.pda, 'pdaLinkNode')) {
        const linkedPda = pdas.find(p => p.name === pdaDefaultValue.pda.name);
        if (!linkedPda) {
            throw new AccountError(`Linked PDA node not found: ${pdaDefaultValue.pda.name}`);
        }
        return linkedPda;
    }
    if (isNode(pdaDefaultValue.pda, 'pdaNode')) {
        return pdaDefaultValue.pda;
    }
    throw new AccountError(`Unsupported PDA node kind: ${(pdaDefaultValue.pda as { kind: string }).kind}`);
}

type ResolvePdaSeedContext = {
    accountsInput?: AccountsInput;
    argumentsInput?: ArgumentsInput;
    ixNode: InstructionNode;
    programId: Address;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
    seedNode: VariablePdaSeedNode;
    variableSeedValueNode: PdaSeedValueNode;
};
function resolveVariablePdaSeed({
    accountsInput = {},
    argumentsInput = {},
    ixNode,
    programId,
    resolutionPath,
    root,
    seedNode,
    variableSeedValueNode,
}: ResolvePdaSeedContext): Promise<ReadonlyUint8Array> {
    invariant(
        seedNode.name === variableSeedValueNode.name,
        `Mismatched PDA seed: ${seedNode.name} vs ${variableSeedValueNode.name}`,
    );

    const visitor = createPdaSeedValueVisitor({
        accountsInput,
        argumentsInput,
        ixNode,
        programId,
        resolutionPath: resolutionPath ?? [],
        root,
        seedTypeNode: seedNode.type,
    });

    return visitOrElse(variableSeedValueNode.value, visitor, node => {
        throw new AccountError(`Unsupported variable PDA seed value node: ${node.kind}`);
    });
}

type ResolveConstantPdaSeedContext = {
    ixNode: InstructionNode;
    programId: Address;
    resolutionPath: ResolutionPath | undefined;
    root: RootNode;
    seedNode: RegisteredPdaSeedNode;
};
function resolveConstantPdaSeed({
    ixNode,
    programId,
    resolutionPath,
    root,
    seedNode,
}: ResolveConstantPdaSeedContext): Promise<ReadonlyUint8Array> {
    if (seedNode.kind !== 'constantPdaSeedNode') {
        throw new AccountError(`Not a constant PDA seed node: ${seedNode.kind}`);
    }
    const visitor = createPdaSeedValueVisitor({
        ixNode,
        programId,
        resolutionPath,
        root,
    });
    return visitOrElse(seedNode.value, visitor, node => {
        throw new AccountError(`Unsupported constant PDA seed value node: ${node.kind}`);
    });
}
