import type { ReadonlyUint8Array } from "@solana/codecs";
import type { Visitor } from "codama";

/**
 * Visitor used to encode default (omitted) values for instruction arguments.
 *
 * Today, Anchor/Codama primarily uses omitted defaults for discriminators
 * (`bytesValueNode`), but this visitor is intentionally extensible as we
 * expand node coverage over time.
 */
export function createDefaultValueEncoderVisitor(codec: {
  encode: (value: any) => ReadonlyUint8Array;
}): Visitor<
  ReadonlyUint8Array,
  | "bytesValueNode"
  | "booleanValueNode"
  | "numberValueNode"
  | "stringValueNode"
  | "publicKeyValueNode"
> {
  return {
    visitBytesValue: (node: any) => codec.encode([node.encoding, node.data]),
    visitBooleanValue: (node: any) => codec.encode(node.boolean),
    visitNumberValue: (node: any) => codec.encode(node.number),
    visitStringValue: (node: any) => codec.encode(node.string),
    visitPublicKeyValue: (node: any) => codec.encode(node.publicKey),
  };
}
