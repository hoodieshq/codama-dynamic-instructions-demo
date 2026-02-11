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

import { createPdaSeedValueVisitor } from '../../entities/visitors';
import { AccountError } from '../../shared/errors';
import type { AccountsInput, ArgumentsInput } from '../../shared/types';
import { invariant } from '../../shared/util';

export async function derivePDA(
    root: RootNode,
    ixNode: InstructionNode,
    ixAccountNode: InstructionAccountNode,
    argumentsInput: ArgumentsInput = {},
    accountsInput: AccountsInput = {}
): Promise<ProgramDerivedAddress | null> {
    const programId = address(root.program.publicKey);
    const pdaDefaultValue = ixAccountNode.defaultValue as PdaValueNode | undefined;
    if (!pdaDefaultValue || !isNode(pdaDefaultValue, 'pdaValueNode')) {
        throw new AccountError(`Account node ${ixAccountNode.name} is not a PDA`);
    }

    const pdaNode = resolvePdaNode(pdaDefaultValue, root.program.pdas);

    const seedValues = pdaNode.seeds.map(seedNode => {
        if (seedNode.kind === 'constantPdaSeedNode') {
            return resolveConstantPdaSeed(root, ixNode, seedNode, programId);
        } else if (seedNode.kind === 'variablePdaSeedNode') {
            // Handle variable seeds that depend on instruction arguments or accounts
            const variableSeedValueNodes = pdaDefaultValue.seeds;
            const seedName = seedNode.name;
            const variableSeedValueNode = variableSeedValueNodes.find(node => node.name === seedName);
            if (!variableSeedValueNode) {
                throw new AccountError(
                    `PDA Node: ${pdaNode.name}. Variable PDA seed value node not found: ${seedName}`
                );
            }
            return resolveVariablePdaSeed(root, ixNode, seedNode, variableSeedValueNode, accountsInput, argumentsInput);
        }

        throw new AccountError(
            `PDA node: ${pdaNode.name}. Unsupported seed kind ${(seedNode as { kind?: string }).kind}`
        );
    });

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

function resolveVariablePdaSeed(
    root: RootNode,
    ix: InstructionNode,
    seedNode: VariablePdaSeedNode, // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/pdaSeedNodes/VariablePdaSeedNode.md
    variableSeedValueNode: PdaSeedValueNode, // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/contextualValueNodes/PdaSeedValueNode.md
    accountsInput: AccountsInput = {},
    argumentsInput: ArgumentsInput = {}
): ReadonlyUint8Array {
    invariant(
        seedNode.name === variableSeedValueNode.name,
        `Mismatched PDA seed: ${seedNode.name} vs ${variableSeedValueNode.name}`
    );

    const programId = address(root.program.publicKey);
    const visitor = createPdaSeedValueVisitor({
        accountsInput,
        argumentsInput,
        ix,
        programId,
        root,
    });

    return visitOrElse(variableSeedValueNode.value, visitor, node => {
        throw new AccountError(`Unsupported variable PDA seed value node: ${node.kind}`);
    });
}

function resolveConstantPdaSeed(
    root: RootNode,
    ix: InstructionNode,
    seed: RegisteredPdaSeedNode,
    programId: Address
): ReadonlyUint8Array {
    if (seed.kind !== 'constantPdaSeedNode') {
        throw new AccountError(`Not a constant PDA seed node: ${seed.kind}`);
    }
    const visitor = createPdaSeedValueVisitor({ ix, programId, root });
    return visitOrElse(seed.value, visitor, node => {
        throw new AccountError(`Unsupported constant PDA seed value node: ${node.kind}`);
    });
}
