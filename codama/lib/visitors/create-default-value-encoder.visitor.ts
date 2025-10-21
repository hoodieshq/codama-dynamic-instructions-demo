import { ReadonlyUint8Array } from "@solana/codecs";
import {
  InstructionArgumentNode,
  InstructionInputValueNode,
  RootNode,
  InstructionNode,
  visit,
  Visitor,
} from "codama";
import { getNodeCodec } from "@codama/dynamic-codecs";

// Create a visitor for encoding default values
export function createDefaultValueEncoderVisitor(
  codec: any // The codec for the argument's type
): Visitor<ReadonlyUint8Array> {
  return {
    visitBytesValue: (node) => codec.encode([node.encoding, node.data]),
    visitBooleanValue: (node) => codec.encode(node.value),
    visitNumberValue: (node) => codec.encode(node.value),
    visitStringValue: (node) => codec.encode(node.value),
    visitNoneValue: () => codec.encode(null),
    visitSomeValue: (node) => codec.encode(node.value),
    visitPublicKeyValue: (node) => codec.encode(node.publicKey),
    visitArrayValue: (node) => codec.encode(node.items),
    visitStructValue: (node) => codec.encode(node.fields),
    visitTupleValue: (node) => codec.encode(node.items),
    visitEnumValue: (node) =>
      codec.encode({
        __kind: node.variant,
        ...(node.fields && { fields: node.fields }),
      }),
    visitConstantValue: (node) => {
      // Constants should use their value directly
      return codec.encode(node.value);
    },
    // For complex/unsupported types, throw informative error
    visitDefault: (node) => {
      throw new Error(
        `Encoding for default value of kind "${node.kind}" is not yet supported`
      );
    },
  };
}
