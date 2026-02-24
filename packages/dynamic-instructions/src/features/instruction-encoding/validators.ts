import type {
    ArrayTypeNode,
    CountNode,
    DefinedTypeNode,
    EnumVariantTypeNode,
    InstructionAccountNode,
    InstructionArgumentNode,
    SetTypeNode,
    TypeNode,
} from '@codama/nodes';
import { isAddress } from '@solana/addresses';
import {
    array,
    boolean,
    define,
    intersection,
    number,
    object,
    size,
    string,
    Struct,
    StructError,
    tuple,
} from 'superstruct';

import { isPublicKeyLike } from '../../shared/address';

type StructUnknown = Struct<unknown, unknown>;

export function createIxAccountsValidator(ixAccountNodes: InstructionAccountNode[]): StructUnknown {
    const shape = ixAccountNodes.reduce<Record<string, StructUnknown>>((acc, node) => {
        // if node is optional, then validate only if it's provided
        // if node has default value, then consider it as optional and validate only if it's provided. Otherwise it will be resolved from default value
        acc[node.name] = node.isOptional || node.defaultValue ? OptionalSolanaAddressValidator : SolanaAddressValidator;
        return acc;
    }, {});
    return object(shape) as StructUnknown;
}

export function createIxArgumentsValidator(
    ixNodeName: string,
    ixArgumentNodes: InstructionArgumentNode[],
    definedTypes: DefinedTypeNode[],
): StructUnknown {
    const shape = ixArgumentNodes.reduce<Record<string, StructUnknown>>((acc, argumentNode, index) => {
        if (!argumentNode.type) {
            throw new Error(`Argument ${argumentNode.name} of instruction ${ixNodeName} does not have a type`);
        }
        acc[argumentNode.name] = createValidatorForTypeNode(
            `${ixNodeName}_${argumentNode.name}_${index}`,
            argumentNode.type,
            definedTypes,
        );
        return acc;
    }, {});
    return object(shape) as StructUnknown;
}

/**
 * Creates a permissive validator for remainderOptionTypeNode items.
 * This is needed because remainder options have special encoding semantics:
 * - None is encoded as absence of bytes (no data)
 * - Some(value) is encoded as the value itself
 */
function createValidatorForRemainderOptionTypeItem(
    nodeName: string,
    itemNode: TypeNode,
    definedTypes: DefinedTypeNode[],
): StructUnknown {
    if (itemNode.kind === 'fixedSizeTypeNode' && itemNode.type.kind === 'stringTypeNode') {
        // For fixed-size strings in remainder options, accept any string
        return StringValidatorForFixedSize(itemNode.size);
    }

    if (itemNode.kind === 'definedTypeLinkNode') {
        const definedType = definedTypes.find(d => d.name === itemNode.name);
        if (definedType?.type.kind === 'fixedSizeTypeNode' && definedType.type.type.kind === 'stringTypeNode') {
            return StringValidatorForFixedSize(definedType.type.size);
        }
    }

    return createValidatorForTypeNode(nodeName, itemNode, definedTypes);
}

/**
 * Validator for strings that will be encoded as fixed-size.
 * More permissive than strict size checking because the codec handles padding.
 */
function StringValidatorForFixedSize(maxSize: number): StructUnknown {
    return define(`StringForFixedSize_max_${maxSize}`, (value: unknown) => {
        if (typeof value !== 'string') return false;
        // Accept any string that can fit in the fixed size
        // The codec will handle padding short strings with zeros
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        // Allow strings up to the maxSize (codec will pad if shorter)
        return bytes.length <= maxSize;
    }) as StructUnknown;
}

function createValidatorForTypeNode(nodeName: string, node: TypeNode, definedTypes: DefinedTypeNode[]): StructUnknown {
    if (!node) {
        throw new Error(
            `Node ${nodeName} is not defined. ${definedTypes.length} defined types were provided: ${definedTypes.map(t => t.name).join(', ')}`,
        );
    }
    switch (node.kind) {
        case 'arrayTypeNode': {
            return arrayValidator(`${nodeName}_array`, node, definedTypes);
        }
        case 'booleanTypeNode': {
            return boolean() as StructUnknown;
        }
        case 'numberTypeNode': {
            const format = (node as TypeNode & { format?: string }).format;
            if (format === 'u64' || format === 'u128' || format === 'i64' || format === 'i128') {
                return NumberOrBigintValidator;
            }
            return number() as StructUnknown;
        }
        case 'publicKeyTypeNode': {
            return SolanaAddressValidator;
        }
        case 'setTypeNode': {
            // array of unique items
            return intersection([
                UniqueItemsValidator,
                arrayValidator(`${nodeName}_set`, node, definedTypes),
            ]) as StructUnknown;
        }
        case 'stringTypeNode': {
            // TODO: may be check encoding?
            // node.encoding
            return string() as StructUnknown;
        }
        case 'fixedSizeTypeNode': {
            // fixedSizeTypeNode wraps an inner type and constrains its byte size
            // It does NOT represent an array - it's a size constraint on serialization
            if (node.type.kind === 'stringTypeNode') {
                // For fixed-size strings, validate that UTF-8 bytes fit within the size
                return StringValidatorForFixedSize(node.size);
            }
            if (node.type.kind === 'bytesTypeNode') {
                // For fixed-size bytes, validate exact byte length
                return BytesWithSizeValidator(node.size);
            }
            // For other types, delegate to the inner type validator
            // The size constraint is handled during encoding
            return createValidatorForTypeNode(`${nodeName}_fixed_size`, node.type, definedTypes);
        }
        case 'bytesTypeNode': {
            // Codama bytes can be provided as `Uint8Array` (recommended) or `number[]`.
            return BytesLikeValidator;
        }
        case 'dateTimeTypeNode': {
            return createValidatorForTypeNode(`${nodeName}_date_time`, node.number, definedTypes);
        }
        case 'definedTypeLinkNode': {
            // Reference to common defined type
            const definedType = definedTypes.find(d => d.name === node.name);
            if (!definedType) {
                throw new Error(`Undefined type: ${node.name} ${node.kind}`);
            }
            return createValidatorForTypeNode(`${nodeName}_defined_type`, definedType.type, definedTypes);
        }
        case 'mapTypeNode': {
            const keyValidator = createValidatorForTypeNode(
                `${nodeName}_map_key_${node.key.kind}`,
                node.key,
                definedTypes,
            );
            const valueValidator = createValidatorForTypeNode(
                `${nodeName}_map_value_${node.key.kind}`,
                node.value,
                definedTypes,
            );
            const sizeValidator = MapCountValidator(node.count);
            // node.
            const keyValueValidator = KeyValueValidator(nodeName, keyValidator, valueValidator);
            if (sizeValidator) {
                return intersection([keyValueValidator, sizeValidator]) as StructUnknown;
            }
            return keyValueValidator;
        }
        case 'structTypeNode': {
            const structShape = node.fields.reduce<Record<string, StructUnknown>>((acc, field) => {
                acc[field.name] = createValidatorForTypeNode(
                    `${nodeName}_struct_${field.name}`,
                    field.type,
                    definedTypes,
                );
                return acc;
            }, {});
            return object(structShape) as StructUnknown;
        }
        case 'tupleTypeNode': {
            const validators = node.items.map((typeNode, index) =>
                createValidatorForTypeNode(`${nodeName}_tuple${typeNode.kind}_${index}`, typeNode, definedTypes),
            );
            return tuple(validators as [StructUnknown, ...StructUnknown[]]) as StructUnknown;
        }
        case 'zeroableOptionTypeNode': {
            return createValidatorForTypeNode(`${nodeName}_zeroeable_option`, node.item, definedTypes);
        }
        case 'optionTypeNode': {
            // TODO: Check and add handling node.fixed and node.prefix if necessary https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/OptionTypeNode.md#attributes
            const SomeValueValidator = createValidatorForTypeNode(`${nodeName}_option_item`, node.item, definedTypes);
            return OptionValueValidator(`${nodeName}_option`, SomeValueValidator);
        }
        case 'remainderOptionTypeNode': {
            const innerValidator = createValidatorForRemainderOptionTypeItem(
                `${nodeName}_remainder_option_item`,
                node.item,
                definedTypes,
            );
            return OptionValueValidator(`${nodeName}_remainder_option`, innerValidator);
        }
        // TODO: check and handle later
        // DOCS: TypeNode https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/README.md
        case 'hiddenPrefixTypeNode':
        case 'hiddenSuffixTypeNode':
        case 'sentinelTypeNode':
        case 'postOffsetTypeNode':
        case 'preOffsetTypeNode':
        case 'sizePrefixTypeNode': {
            return createValidatorForTypeNode(`${nodeName}_size_prefix`, node.type, definedTypes);
        }
        case 'enumTypeNode': {
            return EnumVariantValidator(nodeName, node.variants, definedTypes);
        }
        case 'amountTypeNode': // unit with decimals
        case 'solAmountTypeNode': // equivalent to amountTypeNode with 9 decimals
            throw new Error(`Unsupported argument type: ${nodeName} of type ${node.kind}`);
    }
}

/**
 * Validator for enum variants. Handles both scalar enums (where the value is just the variant name as a string)
 * and enums with data (e.g. enum Command { Start, Continue { reason: String }})
 */
function EnumVariantValidator(
    nodeName: string,
    variants: EnumVariantTypeNode[],
    definedTypes: DefinedTypeNode[],
): StructUnknown {
    const variantNames: string[] = variants.map(v => v.name);

    // Eagerly build per-variant payload validators for struct and tuple variants
    const variantValidators = new Map<string, StructUnknown>();
    for (const variant of variants) {
        if (variant.kind === 'enumStructVariantTypeNode') {
            variantValidators.set(
                variant.name,
                createValidatorForTypeNode(`${nodeName}_${variant.name}`, variant.struct, definedTypes),
            );
        } else if (variant.kind === 'enumTupleVariantTypeNode') {
            variantValidators.set(
                variant.name,
                createValidatorForTypeNode(`${nodeName}_${variant.name}`, variant.tuple, definedTypes),
            );
        }
    }

    return define(`${nodeName}_EnumVariant`, (value: unknown) => {
        // Scalar enum: plain string variant name (e.g. 'arm', 'bar')
        if (typeof value === 'string')
            return variantNames.includes(value) || `Value ${value} of enumTypeNode is invalid!`;

        // Data enum variant: object with __kind (e.g. { __kind: 'tokenTransfer', amount: 1000 })
        if (typeof value === 'object' && value !== null && '__kind' in value) {
            const kind = (value as Record<string, unknown>)['__kind'];
            if (typeof kind !== 'string') {
                return `Value of type ${typeof value} of enumTypeNode is invalid!`;
            }
            if (!variantNames.includes(kind)) {
                return `enumTypeNode kind ${kind} is invalid!`;
            }

            const variant = variants.find(v => v.name.toString() === kind)!;

            if (variant.kind === 'enumEmptyVariantTypeNode') {
                return true;
            }

            // Validations of enum payloads
            const { __kind, ...rest } = value as Record<string, unknown>;
            const payloadValidator = variantValidators.get(kind);
            if (!payloadValidator) {
                return true;
            }

            if (variant.kind === 'enumStructVariantTypeNode') {
                const [structError] = payloadValidator.validate(rest);
                return structError ? formatErrorForEnumTypeNode(kind, structError) : true;
            }

            if (variant.kind === 'enumTupleVariantTypeNode') {
                const fields = (rest as { fields?: unknown }).fields;
                const [structError] = payloadValidator.validate(fields);
                return structError ? formatErrorForEnumTypeNode(kind, structError) : true;
            }
        }

        return `Value ${String(value)} of enumTypeNode is invalid!`;
    }) as StructUnknown;
}

function formatErrorForEnumTypeNode(enumVariantKind: string, error: StructError) {
    const failures = error.failures();
    const first = failures?.[0];
    if (first) {
        return `Invalid argument "${String(first.key)}"`;
    }
    return `enumTypeNode variant '${enumVariantKind}' has invalid payload`;
}

const SolanaAddressValidator: StructUnknown = /* @__PURE__ */ define('SolanaAddress', (value: unknown) => {
    if (typeof value === 'string') return isAddress(value);
    if (isPublicKeyLike(value)) return isAddress(value.toBase58());
    return false;
});

const OptionalSolanaAddressValidator: StructUnknown = /* @__PURE__ */ define(
    'OptionalSolanaAddress',
    (value: unknown) => {
        if (value === undefined || value === null) return true;
        const result = SolanaAddressValidator.validate(value);
        return !result[0]; // [error|undefined, data|undefined]
    },
);

/** Accepts both number and bigint for u64/u128/i64/i128 instruction args. */
const NumberOrBigintValidator: StructUnknown = /* @__PURE__ */ define('NumberOrBigint', (value: unknown) => {
    if (typeof value === 'number') return Number.isSafeInteger(value);
    if (typeof value === 'bigint') return true;
    return false;
});

const BytesLikeValidator: StructUnknown = /* @__PURE__ */ define('BytesLike', (value: unknown) => {
    if (value instanceof Uint8Array) return true;
    if (!Array.isArray(value)) return false;
    return value.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255);
});

/**
 * Validator for bytes that must be exactly a specific size.
 * Used for fixedSizeTypeNode wrapping bytesTypeNode.
 */
function BytesWithSizeValidator(exactSize: number): StructUnknown {
    return define(`BytesWithSize_${exactSize}`, (value: unknown) => {
        if (value instanceof Uint8Array) return value.length === exactSize;
        if (!Array.isArray(value)) return false;
        if (value.length !== exactSize) return false;
        return value.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255);
    }) as StructUnknown;
}

// Validates value only if it is not null or undefined (i.e. if it's provided)
// SomeValueValidator validates the provided value (i.e. Some(value))
function OptionValueValidator(name: string, SomeValueValidator: StructUnknown): StructUnknown {
    return define(`${name}_OptionValueValidator`, (value: unknown) => {
        // Do not validate None value
        if (value === null || value === undefined) return true;
        // if value was provided, then validate it
        return !SomeValueValidator.validate(value)[0]; // error | undefined
    }) as StructUnknown;
}

// Checks that all items in the array are unique
const UniqueItemsValidator: StructUnknown = /* @__PURE__ */ define('UniqueItems', (value: unknown) => {
    if (!Array.isArray(value)) return false;
    const uniqueItems = new Set(value);
    return uniqueItems.size === value.length;
}) as StructUnknown;

// Validates every keys of an object according to KeyValidator
// Validates every value of an object according to ValueValidator
// Used in MapTypeNode, where the keys and valuse are of the same type
// DOCS: https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/MapTypeNode.md
function KeyValueValidator(name: string, KeyValidator: StructUnknown, ValueValidator: StructUnknown): StructUnknown {
    return define(`${name}_KeyValueValidator`, (value: unknown) => {
        if (typeof value !== 'object' || value === null) return false;
        const record = value as Record<string, unknown>;
        const isValidKeys = Object.keys(record).every(key => {
            return !KeyValidator.validate(key)[0]; // [error|undefined, data|undefined]
        });
        const isValidValues = Object.values(record).every(v => {
            return !ValueValidator.validate(v)[0]; // [error|undefined, data|undefined]
        });
        return isValidKeys && isValidValues;
    }) as StructUnknown;
}

function MapCountValidator(node: CountNode): StructUnknown | null {
    switch (node.kind) {
        case 'fixedCountNode':
            return KeysLengthValidator(node.value);
        case 'remainderCountNode':
            return null; // the number of items is unknown
        // TODO: handle prefixed count. We want to understand its purpose and add validation if necessary
        // DOCS: https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/countNodes/PrefixedCountNode.md
        // case "prefixedCountNode":
        //   return null;
        default:
            throw new Error(`Unsupported map count type: ${node.kind}`);
    }
}

// Validates the number of keys in an object
// Can be used in MapTypeNode with "fixed" CountNode type
function KeysLengthValidator(count: number): StructUnknown {
    return define(`KeysLengthValidator_len_${count}`, (value: unknown) => {
        try {
            if (typeof value !== 'object' || value === null) return false;
            return Object.keys(value).length === count;
        } catch {
            return false;
        }
    }) as StructUnknown;
}

// Handles both fixed-size and variable-size arrays
function arrayValidator(
    nodeName: string,
    node: ArrayTypeNode | SetTypeNode,
    definedTypes: DefinedTypeNode[],
): StructUnknown {
    // First define a validator for every array item
    const itemValidator = createValidatorForTypeNode(nodeName, node.item, definedTypes);
    // Then validate CountNode representing array size:
    // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/ArrayTypeNode.md
    switch (node.count.kind) {
        case 'fixedCountNode': {
            return size(array(itemValidator), node.count.value) as StructUnknown;
        }
        case 'remainderCountNode': {
            return array(itemValidator) as StructUnknown;
        }
        case 'prefixedCountNode': {
            // TODO: check and handle these types later
            // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/countNodes/PrefixedCountNode.md
            // node.count.prefix.kind
            throw new Error(`Node: ${nodeName}. Unsupported array count type: ${node.count.kind}`);
        }
        default: {
            // This should be unreachable with the current `CountNode` union but helps
            // guard against future Codama expansions.
            throw new Error(`Node: ${nodeName}. Unsupported array count type`);
        }
    }
}
