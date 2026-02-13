import type { BytesEncoding, RootNode, TypeNode, Visitor } from 'codama';
import { isNode, visitOrElse } from 'codama';

import { isUint8Array, uint8ArrayToEncodedString } from '../../shared/bytes-encoding';
import { isObject } from '../../shared/util';

/**
 * Type nodes that the input value transformer can process.
 * Includes all StandaloneTypeNode kinds plus definedTypeLinkNode.
 */
export type TransformableTypeNodeKind =
    | 'amountTypeNode'
    | 'arrayTypeNode'
    | 'booleanTypeNode'
    | 'bytesTypeNode'
    | 'dateTimeTypeNode'
    | 'definedTypeLinkNode'
    | 'enumTypeNode'
    | 'fixedSizeTypeNode'
    | 'hiddenPrefixTypeNode'
    | 'hiddenSuffixTypeNode'
    | 'mapTypeNode'
    | 'numberTypeNode'
    | 'optionTypeNode'
    | 'postOffsetTypeNode'
    | 'preOffsetTypeNode'
    | 'publicKeyTypeNode'
    | 'remainderOptionTypeNode'
    | 'sentinelTypeNode'
    | 'setTypeNode'
    | 'sizePrefixTypeNode'
    | 'solAmountTypeNode'
    | 'stringTypeNode'
    | 'structFieldTypeNode'
    | 'structTypeNode'
    | 'tupleTypeNode'
    | 'zeroableOptionTypeNode';

export type InputValueTransformerOptions = {
    bytesEncoding?: BytesEncoding;
};

/**
 * A transformer function that converts user input to Codama codec-compatible format.
 */
export type InputTransformer = (input: unknown) => unknown;

/**
 * Creates a visitor that returns transformer functions for each type node kind.
 *
 * @param root - Root node for resolving definedTypeLinkNode references
 * @param options - Configuration options (encoding preference)
 * @returns Visitor that transforms type nodes to input transformers
 */
export function getInputValueTransformerVisitor(
    root: RootNode,
    options: InputValueTransformerOptions = {},
): Visitor<InputTransformer, TransformableTypeNodeKind> {
    const bytesEncoding = options.bytesEncoding ?? 'base16';

    const visitor: Visitor<InputTransformer, TransformableTypeNodeKind> = {
        visitAmountType(node) {
            return visitOrElse(node.number, visitor, innerNode => {
                throw new Error(`Unsupported type node in amountTypeNode: ${innerNode.kind}`);
            });
        },

        visitArrayType(node) {
            const itemTransform = visitOrElse(node.item, visitor, innerNode => {
                throw new Error(`Unsupported type node in arrayTypeNode: ${innerNode.kind}`);
            });
            return (input: unknown) => {
                if (!Array.isArray(input)) return input;
                return input.map(itemTransform);
            };
        },

        visitBooleanType() {
            return (input: unknown) => input;
        },

        visitBytesType() {
            return (input: unknown) => {
                if (!isUint8Array(input)) {
                    throw new Error(
                        `Expected Uint8Array for bytesTypeNode, but received: ${typeof input}. ` +
                            `Received value: ${JSON.stringify(input)}`,
                    );
                }
                return [bytesEncoding, uint8ArrayToEncodedString(input, bytesEncoding)];
            };
        },

        visitDateTimeType(node) {
            return visitOrElse(node.number, visitor, innerNode => {
                throw new Error(`Unsupported type node in dateTimeTypeNode: ${innerNode.kind}`);
            });
        },

        visitDefinedTypeLink(node) {
            const definedType = root.program.definedTypes.find(dt => dt.name === node.name);
            if (!definedType) {
                throw new Error(`Cannot resolve defined type link: ${node.name}`);
            }
            return visitOrElse(definedType.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in definedTypeLink: ${innerNode.kind}`);
            });
        },

        visitEnumType(node) {
            // TODO: to be tested
            // Scalar enums pass through (just numbers/strings)
            // Data enums need variant transformation
            return (input: unknown) => {
                // Scalar enum (number or string) - pass through
                if (typeof input === 'number' || typeof input === 'string') {
                    return input;
                }

                // Data enum with __kind discriminator
                if (typeof input !== 'object' || input === null || !('__kind' in input)) {
                    return input;
                }

                const { __kind, ...rest } = input;
                const variantNode = node.variants.find(v => v.name === __kind);

                if (!variantNode) return input;

                if (isNode(variantNode, 'enumEmptyVariantTypeNode')) {
                    return input;
                }

                if (isNode(variantNode, 'enumStructVariantTypeNode')) {
                    const structTransform = visitOrElse(variantNode.struct, visitor, innerNode => {
                        throw new Error(`Unsupported type node in enumStructVariantTypeNode: ${innerNode.kind}`);
                    });
                    const transformedFields = structTransform(rest);
                    if (!isObject(transformedFields)) {
                        throw new Error(
                            `Expected transformed fields to be an object for enumStructVariantTypeNode, got: ${typeof transformedFields}`,
                        );
                    }
                    return { __kind, ...transformedFields };
                }

                if (isNode(variantNode, 'enumTupleVariantTypeNode')) {
                    const tupleTransform = visitOrElse(variantNode.tuple, visitor, innerNode => {
                        throw new Error(`Unsupported type node in enumTupleVariantTypeNode: ${innerNode.kind}`);
                    });
                    if ('fields' in rest && Array.isArray(rest.fields)) {
                        return { __kind, fields: tupleTransform(rest.fields) };
                    }
                }

                return input;
            };
        },

        visitFixedSizeType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in fixedSizeTypeNode: ${innerNode.kind}`);
            });
        },

        visitHiddenPrefixType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in hiddenPrefixTypeNode: ${innerNode.kind}`);
            });
        },

        visitHiddenSuffixType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in hiddenSuffixTypeNode: ${innerNode.kind}`);
            });
        },

        visitMapType(node) {
            // Maps are represented as objects in dynamic-codecs
            const valueTransform = visitOrElse(node.value, visitor, innerNode => {
                throw new Error(`Unsupported type node in mapTypeNode value: ${innerNode.kind}`);
            });
            return (input: unknown) => {
                if (!isObject(input)) return input;
                const result: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(input)) {
                    result[key] = valueTransform(value);
                }
                return result;
            };
        },

        // Primitive types (pass through)
        visitNumberType() {
            return (input: unknown) => input;
        },

        // Option types
        visitOptionType(node) {
            const innerTransform = visitOrElse(node.item, visitor, innerNode => {
                throw new Error(`Unsupported type node in optionTypeNode: ${innerNode.kind}`);
            });
            return (input: unknown) => {
                if (input === null || input === undefined) return input;
                return innerTransform(input);
            };
        },

        visitPostOffsetType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in postOffsetTypeNode: ${innerNode.kind}`);
            });
        },

        visitPreOffsetType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in preOffsetTypeNode: ${innerNode.kind}`);
            });
        },

        visitPublicKeyType() {
            return (input: unknown) => input;
        },

        visitRemainderOptionType(node) {
            const innerTransform = visitOrElse(node.item, visitor, innerNode => {
                throw new Error(`Unsupported type node in remainderOptionTypeNode: ${innerNode.kind}`);
            });
            return (input: unknown) => {
                if (input === null || input === undefined) return input;
                return innerTransform(input);
            };
        },

        visitSentinelType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in sentinelTypeNode: ${innerNode.kind}`);
            });
        },

        visitSetType(node) {
            // Sets are represented as arrays in dynamic-codecs
            const itemTransform = visitOrElse(node.item, visitor, innerNode => {
                throw new Error(`Unsupported type node in setTypeNode: ${innerNode.kind}`);
            });
            return (input: unknown) => {
                if (!Array.isArray(input)) return input;
                return input.map(itemTransform);
            };
        },

        visitSizePrefixType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in sizePrefixTypeNode: ${innerNode.kind}`);
            });
        },

        visitSolAmountType(node) {
            return visitOrElse(node.number, visitor, innerNode => {
                throw new Error(`Unsupported type node in solAmountTypeNode: ${innerNode.kind}`);
            });
        },

        visitStringType() {
            return (input: unknown) => input;
        },

        visitStructFieldType(node) {
            return visitOrElse(node.type, visitor, innerNode => {
                throw new Error(`Unsupported type node in structFieldTypeNode: ${innerNode.kind}`);
            });
        },

        visitStructType(node) {
            const fieldTransformers = node.fields.map(field => {
                const transform = visitOrElse(field, visitor, innerNode => {
                    throw new Error(`Unsupported type node in structTypeNode field: ${innerNode.kind}`);
                });
                return { name: field.name, transform };
            });
            return (input: unknown) => {
                if (typeof input !== 'object' || input === null) return input;
                const result = { ...input } as Record<string, unknown>;
                for (const { name, transform } of fieldTransformers) {
                    if (name in result) {
                        result[name] = transform(result[name]);
                    }
                }
                return result;
            };
        },

        visitTupleType(node) {
            const itemTransforms = node.items.map(item =>
                visitOrElse(item, visitor, innerNode => {
                    throw new Error(`Unsupported type node in tupleTypeNode: ${innerNode.kind}`);
                }),
            );
            return (input: unknown) => {
                if (!Array.isArray(input)) return input;
                return input.map((value: unknown, index) =>
                    itemTransforms[index] ? itemTransforms[index](value) : value,
                );
            };
        },

        visitZeroableOptionType(node) {
            const innerTransform = visitOrElse(node.item, visitor, innerNode => {
                throw new Error(`Unsupported type node in zeroableOptionTypeNode: ${innerNode.kind}`);
            });
            return (input: unknown) => {
                if (input === null || input === undefined) return input;
                return innerTransform(input);
            };
        },
    };

    return visitor;
}

/**
 * Creates a transformer function that converts user input to codec-compatible input format.
 * For example: user input Uint8Array for binary data but @codama/dynamic-codecs expects [BytesEncoding, string] as input
 *
 * @param typeNode - The Codama type node describing the expected structure
 * @param root - Root node for resolving definedTypeLinkNode references
 * @param options - Configuration options (encoding preference)
 * @returns Transformer function that converts input to codec format
 *
 * @example
 * const transformer = createInputValueTransformer(
 *     bytesTypeNode(),
 *     root,
 *     { bytesEncoding: 'base16' }
 * );
 *
 * const input = new Uint8Array([72, 101, 108, 108, 111]);
 * const transformed = transformer(input); // => ['base16', '48656c6c6f']
 * Usage with codec: codamaCodec.encode(['base16', '48656c6c6f'])
 */
export function createInputValueTransformer(
    typeNode: TypeNode,
    root: RootNode,
    options?: InputValueTransformerOptions,
): InputTransformer {
    const visitor = getInputValueTransformerVisitor(root, options);
    return visitOrElse(typeNode, visitor, node => {
        throw new Error(`Unsupported type node for input transformation: ${node.kind}`);
    });
}
