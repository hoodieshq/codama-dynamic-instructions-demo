import type {
    BytesEncoding,
    DefinedTypeLinkNode,
    FixedSizeTypeNode,
    HiddenPrefixTypeNode,
    MapTypeNode,
    OptionTypeNode,
    PostOffsetTypeNode,
    PreOffsetTypeNode,
    RemainderOptionTypeNode,
    RootNode,
    SizePrefixTypeNode,
    TypeNode,
    ZeroableOptionTypeNode,
} from 'codama';

import { isUint8Array, uint8ArrayToEncodedString } from '../../shared/bytes-encoding';

/**
 * Creates a transformer function that converts user input to codec-compatible input format.
 * For example: user input Uint8Array for binary data but @codama/dynamic-codecs expects [BytesEncoding, string] as input
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
    options?: { bytesEncoding?: BytesEncoding },
): (input: unknown) => unknown {
    const bytesEncoding = options?.bytesEncoding ?? 'base16';

    switch (typeNode.kind) {
        case 'bytesTypeNode':
            return (input: unknown) => {
                if (!isUint8Array(input)) return input;
                return [bytesEncoding, uint8ArrayToEncodedString(input, bytesEncoding)];
            };

        case 'optionTypeNode':
        case 'remainderOptionTypeNode':
        case 'zeroableOptionTypeNode': {
            const innerTransform = createInputValueTransformer(
                (typeNode as OptionTypeNode | RemainderOptionTypeNode | ZeroableOptionTypeNode).item,
                root,
                options,
            );
            return (input: unknown) => {
                if (input === null || input === undefined) return input;
                return innerTransform(input);
            };
        }

        case 'arrayTypeNode': {
            const transformItem = createInputValueTransformer(typeNode.item, root, options);
            return (input: unknown) => {
                if (!Array.isArray(input)) return input;
                return input.map(transformItem);
            };
        }

        case 'structTypeNode': {
            const fieldTransformers = typeNode.fields.map(field => ({
                name: field.name,
                transform: createInputValueTransformer(field.type, root, options),
            }));
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
        }

        case 'tupleTypeNode': {
            const itemTransforms = typeNode.items.map(item => createInputValueTransformer(item, root, options));
            return (input: unknown) => {
                if (!Array.isArray(input)) return input;
                return input.map((value: unknown, index) =>
                    itemTransforms[index] ? itemTransforms[index](value) : value,
                );
            };
        }

        case 'enumTypeNode':
            // TODO: Add support for enum variant transformation
            return (_input: unknown) => {
                throw new Error('Enum type transformation to be implemented');
            };

        case 'mapTypeNode': {
            const valueTransform = createInputValueTransformer((typeNode as MapTypeNode).value, root, options);
            return (input: unknown) => {
                if (typeof input !== 'object' || input === null) return input;
                const result: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(input)) {
                    result[key] = valueTransform(value);
                }
                return result;
            };
        }

        case 'fixedSizeTypeNode':
        case 'hiddenPrefixTypeNode':
        case 'postOffsetTypeNode':
        case 'preOffsetTypeNode':
        case 'sizePrefixTypeNode':
            return createInputValueTransformer(
                (
                    typeNode as
                        | FixedSizeTypeNode
                        | HiddenPrefixTypeNode
                        | PostOffsetTypeNode
                        | PreOffsetTypeNode
                        | SizePrefixTypeNode
                ).type,
                root,
                options,
            );

        case 'definedTypeLinkNode': {
            // Resolve the link from root.program.definedTypes
            const definedType = root.program.definedTypes.find(
                dt => dt.name === (typeNode as DefinedTypeLinkNode).name,
            );
            if (!definedType) {
                throw new Error(`Cannot resolve defined type link: ${(typeNode as DefinedTypeLinkNode).name}`);
            }
            return createInputValueTransformer(definedType.type, root, options);
        }

        // Primitive types - pass through unchanged
        case 'numberTypeNode':
        case 'booleanTypeNode':
        case 'stringTypeNode':
        case 'publicKeyTypeNode':
        case 'amountTypeNode':
        case 'solAmountTypeNode':
        case 'dateTimeTypeNode':
            return (input: unknown) => input;

        default:
            throw new Error(`Unsupported type node for input transformation: ${(typeNode as TypeNode).kind}`);
    }
}
