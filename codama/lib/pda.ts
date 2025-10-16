import { Address, ProgramDerivedAddress, address, getAddressEncoder, getProgramDerivedAddress } from "@solana/addresses";
import { BytesEncoding, ConstantPdaSeedNode, InstructionAccountNode, InstructionNode, isNode, PdaNode, PdaSeedValueNode, PdaValueNode, ProgramIdValueNode, RegisteredPdaSeedNode, RootNode, StandaloneValueNode, VariablePdaSeedNode } from "codama";
import { AccountsInput, ArgumentsInput } from "./types";
import { AccountError } from "./errors";
import { invariant } from "./util";
import { getNodeCodec } from "@codama/dynamic-codecs";
import { getBase16Codec, getBase58Codec, getBase64Codec, getUtf8Codec, ReadonlyUint8Array, getBooleanCodec } from "@solana/codecs";

export async function derivePDA(
  root: RootNode,
  ixNode: InstructionNode,
  ixAccountNode: InstructionAccountNode,
  argumentsInput: ArgumentsInput = {},
  accountsInput: AccountsInput = {},
): Promise<ProgramDerivedAddress | null> {
  const programId = address(root.program.publicKey);
  const pdaDefaultValue = ixAccountNode.defaultValue as PdaValueNode | undefined;
  if (!pdaDefaultValue || !isNode(pdaDefaultValue, "pdaValueNode")) {
    throw new AccountError(`Account node ${ixAccountNode.name} is not a PDA`);
  }

  let pdaNode = resolvePdaNode(pdaDefaultValue, root.program.pdas);

  const seedValues = pdaNode.seeds.map((seedNode) => {
    if (seedNode.kind === "constantPdaSeedNode") {
      return resolveConstantPdaSeed(seedNode, programId);
    }
    else if (seedNode.kind === "variablePdaSeedNode") {
      // Handle variable seeds that depend on instruction arguments or accounts
      const variableSeedValueNodes = pdaDefaultValue.seeds;
      const seedName = seedNode.name;
      const variableSeedValueNode = variableSeedValueNodes.find(node => node.name === seedName);
      if (!variableSeedValueNode) {
        throw new AccountError(`PDA Node: ${pdaNode.name}. Variable PDA seed value node not found: ${seedName}`);
      }
      return resolveVariablePdaSeed(
        root,
        ixNode,
        seedNode,
        variableSeedValueNode,
        accountsInput,
        argumentsInput,
      );
    }
    
    throw new AccountError(`PDA node: ${pdaNode.name}. Unsupported seed kind ${(seedNode as unknown as any)?.kind}`);
  });

  return getProgramDerivedAddress({
    programAddress: programId,
    seeds: seedValues
  });
}

function resolvePdaNode(pdaDefaultValue: PdaValueNode, pdas: PdaNode[]): PdaNode {
  if (isNode(pdaDefaultValue.pda, "pdaLinkNode")) {
    const linkedPda = pdas.find(p => p.name === pdaDefaultValue.pda.name);
    if (!linkedPda) {
      throw new AccountError(`Linked PDA node not found: ${pdaDefaultValue.pda.name}`);
    }
    return linkedPda;
  } else if (isNode(pdaDefaultValue.pda, "pdaNode")) {
    return pdaDefaultValue.pda;
  }
}

function resolveVariablePdaSeed(
  root: RootNode,
  ix: InstructionNode,
  seedNode: VariablePdaSeedNode, // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/pdaSeedNodes/VariablePdaSeedNode.md
  variableSeedValueNode: PdaSeedValueNode, // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/contextualValueNodes/PdaSeedValueNode.md
  accountsInput: AccountsInput = {},
  argumentsInput: ArgumentsInput = {},
): ReadonlyUint8Array {
  invariant(seedNode.name === variableSeedValueNode.name, `Mismatched PDA seed: ${seedNode.name} vs ${variableSeedValueNode.name}`);

  // variable seed value can be either from account or argument or value
  switch (variableSeedValueNode.value.kind) {
    case "accountValueNode": {
      // pda derived from some account address
      const address = accountsInput[seedNode.name];
      return getAddressEncoder().encode(address);
    }
    case "argumentValueNode": {
      // pda derived from some argument
      const ixArgumentNode = ix.arguments.find(arg => arg.name === seedNode.name);
      const codec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
      const argInput = argumentsInput[seedNode.name];
      return codec.encode(argInput);
    }
  
    // TODO: to be supported
    // These are ValueNodes https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/valueNodes/README.md
    case "arrayValueNode":
    case "bytesValueNode":
    case "booleanValueNode":
    case "constantValueNode":
    case "enumValueNode":
    case "mapValueNode":
    case "noneValueNode":
    case "numberValueNode":
    case "publicKeyValueNode":
    case "setValueNode":
    case "someValueNode":
    case "stringValueNode":
    case "structValueNode":
    case "tupleValueNode":
    default: {
      throw new AccountError(`Unsupported variable PDA seed value node: ${variableSeedValueNode.value.kind}`);
    }
  }
}

function resolveConstantPdaSeed(seed: RegisteredPdaSeedNode, programId: Address): ReadonlyUint8Array {
  if (seed.kind !== "constantPdaSeedNode") {
    throw new AccountError(`Not a constant PDA seed node: ${seed.kind}`);
  }
  return encodeConstantSeedValue(seed.value, programId);
}

function encodeConstantSeedValue(valueNode: ConstantPdaSeedNode["value"], programId: Address): ReadonlyUint8Array {
  switch (valueNode.kind) {
    case "programIdValueNode": {
      return getAddressEncoder().encode(programId);
    }
    case "publicKeyValueNode": {
      return getAddressEncoder().encode(address(valueNode.publicKey));
    }
  
    case "bytesValueNode": {
      return getCodecFromBytesEncoding(valueNode.encoding).encode(valueNode.data);
    }
    case "booleanValueNode": {
      return getBooleanCodec().encode(valueNode.boolean);
    }
    case "numberValueNode": {
      return Buffer.from([valueNode.number]);
    }
    case "stringValueNode": {
      return Buffer.from(valueNode.string);
    }
    // TODO: The following types can seem to be used as constant PDA seed value
    case "arrayValueNode":
    case "constantValueNode":
    case "enumValueNode":
    case "mapValueNode":
    case "noneValueNode":
    case "setValueNode":
    case "someValueNode":
    case "structValueNode":
    case "tupleValueNode":
    default:
      throw new AccountError(`Unsupported constant PDA seed value node: ${valueNode.kind}`);
  }
}

// TODO: check if this can be replaced
// https://github.com/codama-idl/codama/blob/main/packages/dynamic-codecs/src/codecs.ts#L356
function getCodecFromBytesEncoding(encoding: BytesEncoding) {
  switch (encoding) {
    case 'base16':
      return getBase16Codec();
    case 'base58':
      return getBase58Codec();
    case 'base64':
      return getBase64Codec();
    case 'utf8':
      return getUtf8Codec();
    default:
      throw new AccountError(`Unsupported bytes encoding: ${encoding}`);
  }
}