import { Address, address } from "@solana/addresses";
import { AccountMeta, AccountRole } from "@solana/instructions";
import { InstructionAccountNode, InstructionNode, isNode,RootNode } from "codama";
import { AccountMeta as AccountWeb3jsMeta, PublicKey } from "@solana/web3.js";
import { AccountsInput, ArgumentsInput } from "./types";
import { AccountError } from "./errors";
import { createIxAccountsValidator } from "./validators";
import { assert, StructError } from "superstruct";
import { derivePDA } from "./pda";

type ResolvedAccount = {
  role: AccountRole;
  address: Address | null;
  optional: boolean;
}

export async function resolveAccountMetas(
  root: RootNode,
  ixNode: InstructionNode,
  argumentsInput: ArgumentsInput = {},
  accountsInput: AccountsInput = {},
): Promise<AccountMeta[]> {
  const resolvedAccounts = await Promise.all(
    ixNode.accounts.map<Promise<ResolvedAccount>>(async (ixAccountNode) => {
      const accountAddressInput = accountsInput?.[ixAccountNode.name];
  
      // Double check required account is provided
      if (!accountAddressInput && isIxAccountRequired(ixAccountNode)) {
        throw new AccountError(`Account not provided: ${ixAccountNode.name}`);
      }

      let resolvedAccountAddress: Address | null;
      if (!accountAddressInput)  {
        resolvedAccountAddress = await resolveAccountAddress(
          root,
          ixNode,
          ixAccountNode,
          argumentsInput,
          accountsInput,
        );
      }

      return {
        role: getAccountRole(ixAccountNode),
        optional: Boolean(ixAccountNode.isOptional),
        address: accountAddressInput || resolvedAccountAddress
      };
    })
  );

  return resolvedAccounts
  // omitted optional accounts
  .filter(acc => acc.address !== null)
  .map(acc => {
    return {
      role: acc.role,
      address: acc.address as Address,
    }
  })
}

// Optional accounts can be omitted
// Accounts with default values can be omitted, as they can be resolved from default value
function isIxAccountRequired(ixAccountNode: InstructionAccountNode) {
  return !ixAccountNode.isOptional && !ixAccountNode.defaultValue;
}

async function resolveAccountAddress(
  root: RootNode,
  ixNode: InstructionNode,
  ixAccountNode: InstructionAccountNode,
  argumentsInput: ArgumentsInput = {},
  accountsInput: AccountsInput = {},
): Promise<Address|null> {
  const accountAddressInput = accountsInput?.[ixAccountNode.name];
  // Undefined optional accounts are handled according on optionalAccountStrategy
  // With "programId" optionalStrategy, optional accounts are resolved to programId
  // With "omitted" optionalStrategy, optional accounts must be excluded from accounts list
  // By default, optional accounts are resolved to programId
  if (!accountAddressInput && ixAccountNode.isOptional) {
    switch (ixNode.optionalAccountStrategy) {
      case "omitted":
        return null;
      case "programId":
        return address(root.program.publicKey);
      default:
        throw new AccountError(`Cannot resolve optional account: ${ixAccountNode.name} with strategy: ${ixNode.optionalAccountStrategy}`);
    }
  }

  if (!ixAccountNode.defaultValue) {
    throw new AccountError(`Account doesn't have default value: ${ixAccountNode.name}`);
  }

  switch (ixAccountNode.defaultValue.kind) {
    case "pdaValueNode": {
      const pda = await derivePDA(root, ixNode, ixAccountNode, argumentsInput, accountsInput);
      return pda[0];
    }
    case "publicKeyValueNode": {
      return address(ixAccountNode.defaultValue.publicKey);
    }
    // TODO: here we want to (or may be don't want to) create address from other types of default values (InstructionAccountNode)
    // DOCS: InstructionAccountNode => InstructionInputValueNode
    // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionAccountNode.md
    case "accountBumpValueNode":
    case "accountValueNode":
    case "argumentValueNode":
    case "arrayValueNode":
    case "booleanValueNode":
    case "bytesValueNode":
    case "conditionalValueNode":
    case "constantValueNode":
    case "enumValueNode":
    case "identityValueNode":
    case "mapValueNode":
    case "noneValueNode":
    case "numberValueNode":
    case "payerValueNode":
    case "programIdValueNode":
    case "programLinkNode":
    case "resolverValueNode":
    case "setValueNode":
    case "someValueNode":
    case "stringValueNode":
    case "structValueNode":
    case "tupleValueNode":

    default: {
      throw new AccountError(`Cannot resolve account: ${ixAccountNode.name}`);
    }
  }
}

export function toLegacyAccountMeta(accountMeta: AccountMeta): AccountWeb3jsMeta {
  return {
    pubkey: new PublicKey(accountMeta.address),
    isSigner: accountMeta.role === AccountRole.WRITABLE_SIGNER || accountMeta.role === AccountRole.READONLY_SIGNER,
    isWritable: accountMeta.role === AccountRole.WRITABLE_SIGNER || accountMeta.role === AccountRole.WRITABLE,
  }
}

export function validateAccountsInput(
  ixNode: InstructionNode,
  accountsInput: AccountsInput = {},
) {
  if (!ixNode.accounts.length) return;

  const AccountsInputValidator = createIxAccountsValidator(ixNode.accounts);
  try {
    assert(accountsInput, AccountsInputValidator);
  } catch (error) {
    let { key, value, message } = error as StructError;
    // TODO: ensure this error is user friendly
    if (!value) {
      throw new AccountError(`Missing required account: ${key}. ${message}`);
    } else {
      throw new AccountError(`Invalid address of "${key}" account: ${value}`);
    }
  }
}

function getAccountRole(acc: InstructionAccountNode): AccountRole {
  if (acc.isWritable && acc.isSigner) {
    return AccountRole.WRITABLE_SIGNER;
  }
  if (acc.isWritable && !acc.isSigner) {
    return AccountRole.WRITABLE;
  }
  if (!acc.isWritable && acc.isSigner) {
    return AccountRole.READONLY_SIGNER;
  }
  return AccountRole.READONLY
}