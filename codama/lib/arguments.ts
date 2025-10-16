import { ReadonlyUint8Array } from "@solana/codecs";
import { InstructionArgumentNode, InstructionNode, LinkableDictionary, RootNode, visit } from "codama";
import { ArgumentsInput } from "./types";
import { getNodeCodec, getNodeCodecVisitor } from "@codama/dynamic-codecs";
import { ArgumentError, ValidationError } from "./errors";
import { createIxArgumentsValidator } from "./validators";
import { assert, StructError } from "superstruct";

export function encodeInstructionArguments(
  root: RootNode,
  ix: InstructionNode,
  argumentsInput: ArgumentsInput = {}
): ReadonlyUint8Array {
  const chunks = ix.arguments.reduce<ReadonlyUint8Array[]>((chunks, ixArgumentNode) => {
    const codec = getNodeCodec([root, root.program, ix, ixArgumentNode]);
    const input = argumentsInput?.[ixArgumentNode.name];
    let encodedValue: ReadonlyUint8Array;
    if (isIxArgumentOmitted(ixArgumentNode)) {
      // Omitted argument means it must always use the default value (e.g discriminator)
      // switch (ixArgumentNode.type.kind) {
        //   case ""
        // }
      // TODO: handle encoding of other default value kinds, or skip them entirely
      // DOCS: InstructionArgumentNode => InstructionInputValueNode
      // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionArgumentNode.md#children
      // Check if we can use visitor instead of using switch case (i.e visit(ixArgumentNode, getNodeCodecVisitor)). I dind't find it possible
      switch (ixArgumentNode.defaultValue.kind) {
        case "bytesValueNode": {
          const defaultValue = ixArgumentNode.defaultValue;
          encodedValue = codec.encode([defaultValue.encoding, defaultValue.data]);
          break;
        }
        case "accountBumpValueNode":
        case "accountValueNode":
        case "argumentValueNode":
        case "arrayValueNode":
        case "booleanValueNode":
        case "conditionalValueNode":
        case "constantValueNode":
        case "enumValueNode":
        case "identityValueNode":
        case "mapValueNode":
        case "noneValueNode":
        case "numberValueNode":
        case "payerValueNode":
        case "pdaValueNode":
        case "programIdValueNode":
        case "programLinkNode":
        case "publicKeyValueNode":
        case "resolverValueNode":
        case "setValueNode":
        case "someValueNode":
        case "stringValueNode":
        case "structValueNode":
        case "tupleValueNode":
        default: {
          throw new ArgumentError(`Not supported encoding for ${ixArgumentNode.name} argument of "${ixArgumentNode.type.kind}" kind`);
        }
      }
    } else if (ixArgumentNode.type.kind === "optionTypeNode" && (input === null || input === undefined)) {
      // optional null/undefined argument
      encodedValue = codec.encode(null);
    } else {
      if (!input) {
        throw new ArgumentError(`Missing required argument: ${ixArgumentNode.name}`);
      }
      encodedValue = codec.encode(input);
    }
    chunks.push(encodedValue);
    return chunks;
  }, []);

  return new Uint8Array([...chunks.flatMap(chunk => [...chunk])]);
}

export function validateArgumentsInput(root: RootNode, ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
  const requiredArguments = getRequiredIxArguments(ixNode);

  // Ensure arguments with "omitted" defaultValueStrategy are not provided in argumentsInput
  validateOmittedArguments(ixNode, argumentsInput);

  if (!requiredArguments.length) return;

  const ArgumentsInputValidator = createIxArgumentsValidator(ixNode.name, requiredArguments, root.program.definedTypes);
  
  try {
    assert(argumentsInput, ArgumentsInputValidator);
  } catch (error) {
    let { failures } = error as StructError;
    const message = failures().map(failure => {
      return `Invalid argument "${failure.key}", "value": ${failure.value}. Message: ${failure.message}\n`;
    });
    throw new ValidationError(message.join(''));
  }
}

// Required arguments that should be validated and provided or be null/undefined if optional
function getRequiredIxArguments(ixNode: InstructionNode) {
  return ixNode.arguments.filter(arg => arg?.defaultValueStrategy !== "omitted");
}

// Arguments with "omitted" defaultValueStrategy must not be provided (e.g discriminator)
// https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/InstructionArgumentNode.md#data
function validateOmittedArguments(ixNode: InstructionNode, argumentsInput: ArgumentsInput = {}) {
  ixNode.arguments
  .filter(isIxArgumentOmitted)
  .forEach(ixNode => {
    if (argumentsInput.hasOwnProperty(ixNode.name)) {
      throw new ValidationError(`Argument ${ixNode.name} cannot be provided`);
    }
  });
}

function isIxArgumentOmitted(node: InstructionArgumentNode) {
  return node.defaultValueStrategy === "omitted" && node.defaultValue
}