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
import { formatValueType, safeStringify } from '../../shared/util';

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
        if (typeof value !== 'string') {
            return `Expected a string, received: ${formatValueType(value)}`;
        }
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);
        return (
            bytes.length <= maxSize ||
            `String exceeds max size: ${bytes.length} bytes (UTF-8), limit is ${maxSize} bytes`
        );
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
            const innerValidator = createValidatorForTypeNode(
                `${nodeName}_zeroable_option_item`,
                node.item,
                definedTypes,
            );
            return ZeroableOptionValidator(`${nodeName}_zeroable_option`, innerValidator);
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
        case 'amountTypeNode': {
            return AmountTypeValidator(nodeName);
        }
        case 'solAmountTypeNode': {
            return AmountTypeValidator(nodeName);
        }
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
            return (
                variantNames.includes(value) ||
                `Invalid enum value "${value}". Expected one of: ${variantNames.join(', ')}`
            );

        // Data enum variant: object with __kind (e.g. { __kind: 'tokenTransfer', amount: 1000 })
        if (typeof value === 'object' && value !== null && '__kind' in value) {
            const kind = (value as Record<string, unknown>)['__kind'];
            if (typeof kind !== 'string') {
                return `Expected __kind to be a string, received: ${formatValueType(kind)}`;
            }
            if (!variantNames.includes(kind)) {
                return `Invalid enum variant "${kind}". Expected one of: ${variantNames.join(', ')}`;
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

        return `Expected an enum variant (string or object with __kind), received: ${formatValueType(value)}`;
    }) as StructUnknown;
}

function formatErrorForEnumTypeNode(enumVariantKind: string, error: StructError) {
    const failures = error.failures();
    const first = failures?.[0];
    if (first) {
        return `Enum variant "${enumVariantKind}" has invalid "${String(first.key)}"`;
    }
    return `Enum variant "${enumVariantKind}" has invalid payload`;
}

const SolanaAddressValidator: StructUnknown = /* @__PURE__ */ define('SolanaAddress', (value: unknown) => {
    if (typeof value === 'string') {
        return isAddress(value) || `Expected a valid Solana address (base58), received string: "${value}"`;
    }
    if (isPublicKeyLike(value)) {
        return isAddress(value.toBase58()) || 'Expected a valid Solana address, received an invalid PublicKey';
    }
    return `Expected a Solana address (base58 string or PublicKey), received: ${formatValueType(value)}`;
});

const OptionalSolanaAddressValidator: StructUnknown = /* @__PURE__ */ define(
    'OptionalSolanaAddress',
    (value: unknown) => {
        if (value === undefined || value === null) return true;
        const [error] = SolanaAddressValidator.validate(value);
        if (!error) return true;
        return error.failures()[0]?.message ?? 'Expected a valid Solana address or null/undefined';
    },
);

/** Accepts both number and bigint for u64/u128/i64/i128 instruction args. */
const NumberOrBigintValidator: StructUnknown = /* @__PURE__ */ define('NumberOrBigint', (value: unknown) => {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) || `Expected a safe integer, received unsafe number: ${value}`;
    }
    if (typeof value === 'bigint') return true;
    return `Expected a number or bigint, received: ${formatValueType(value)}`;
});

const BytesLikeValidator: StructUnknown = /* @__PURE__ */ define('BytesLike', (value: unknown) => {
    if (value instanceof Uint8Array) return true;
    if (!Array.isArray(value)) {
        return `Expected a Uint8Array or number[] (bytes 0-255), received: ${formatValueType(value)}`;
    }
    const invalidIndex = value.findIndex(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255);
    if (invalidIndex !== -1) {
        return `Expected byte values (integers 0-255), invalid element at index ${invalidIndex}: ${String(value[invalidIndex])}`;
    }
    return true;
});

/**
 * Validator for bytes that must be exactly a specific size.
 * Used for fixedSizeTypeNode wrapping bytesTypeNode.
 */
function BytesWithSizeValidator(exactSize: number): StructUnknown {
    return define(`BytesWithSize_${exactSize}`, (value: unknown) => {
        if (value instanceof Uint8Array) {
            return value.length === exactSize || `Expected exactly ${exactSize} bytes, received ${value.length} bytes`;
        }
        if (!Array.isArray(value)) {
            return `Expected a Uint8Array or number[] of exactly ${exactSize} bytes, received: ${formatValueType(value)}`;
        }
        if (value.length !== exactSize) {
            return `Expected exactly ${exactSize} bytes, received ${value.length} elements`;
        }
        const invalidIndex = value.findIndex(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 255);
        if (invalidIndex !== -1) {
            return `Expected byte values (integers 0-255), invalid element at index ${invalidIndex}: ${String(value[invalidIndex])}`;
        }
        return true;
    }) as StructUnknown;
}

// Validates value only if it is not null or undefined (i.e. if it's provided)
// SomeValueValidator validates the provided value (i.e. Some(value))
function OptionValueValidator(name: string, SomeValueValidator: StructUnknown): StructUnknown {
    return define(`${name}_OptionValueValidator`, (value: unknown) => {
        if (value === null || value === undefined) return true;
        const [error] = SomeValueValidator.validate(value);
        if (!error) return true;
        return error.failures()[0]?.message ?? 'Invalid value for optional field';
    }) as StructUnknown;
}

// Validates zeroable option: null is valid, otherwise validates the inner validator
function ZeroableOptionValidator(name: string, innerValidator: StructUnknown): StructUnknown {
    return define(name, (value: unknown) => {
        if (value == null) return true;
        const [error] = innerValidator.validate(value);
        if (!error) return true;
        return error.failures()[0]?.message ?? 'Expected a valid value or null for zeroable option';
    }) as StructUnknown;
}

// Checks that all items in the array are unique
const UniqueItemsValidator: StructUnknown = /* @__PURE__ */ define('UniqueItems', (value: unknown) => {
    if (!Array.isArray(value)) {
        return `Expected an array with unique items, received: ${formatValueType(value)}`;
    }

    const unique = new Map<string, number>();
    for (let i = 0; i < value.length; i++) {
        const key = safeStringify(value[i]);
        const index = unique.get(key);
        if (index !== undefined) {
            return `Expected all items to be unique, found duplicate at indices ${index} and ${i}`;
        }
        unique.set(key, i);
    }
    return true;
}) as StructUnknown;

// Validates every key of an object according to KeyValidator
// Validates every value of an object according to ValueValidator
// Used in MapTypeNode, where the keys and values are of the same type
// DOCS: https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/MapTypeNode.md
function KeyValueValidator(name: string, KeyValidator: StructUnknown, ValueValidator: StructUnknown): StructUnknown {
    return define(`${name}_KeyValueValidator`, (value: unknown) => {
        if (typeof value !== 'object' || value === null) {
            return `Expected a map (object), received: ${formatValueType(value)}`;
        }
        const record = value as Record<string, unknown>;
        const invalidKeys = Object.keys(record).filter(key => KeyValidator.validate(key)[0]);
        const invalidValues = Object.keys(record).filter(key => ValueValidator.validate(record[key])[0]);
        if (!invalidKeys.length && !invalidValues.length) return true;
        const parts: string[] = [];
        if (invalidKeys.length) parts.push(`invalid keys: ${invalidKeys.join(', ')}`);
        if (invalidValues.length) parts.push(`invalid values: ${invalidValues.join(', ')}`);
        return `Map validation failed: ${parts.join('; ')}`;
    }) as StructUnknown;
}

function MapCountValidator(node: CountNode): StructUnknown | null {
    switch (node.kind) {
        case 'fixedCountNode':
            return KeysLengthValidator(node.value);
        case 'remainderCountNode':
        case 'prefixedCountNode':
            return null; // the number of items is unknown or arbitrary, like vec![]
        default:
            throw new Error(`Unsupported map count type: ${(node as { kind: string })?.kind}`);
    }
}

// Validates the number of keys in an object
// Can be used in MapTypeNode with "fixed" CountNode type
function KeysLengthValidator(count: number): StructUnknown {
    return define(`KeysLengthValidator_len_${count}`, (value: unknown) => {
        try {
            if (typeof value !== 'object' || value === null) {
                return `Expected a map with exactly ${count} entries, received: ${formatValueType(value)}`;
            }
            const actual = Object.keys(value).length;
            return actual === count || `Expected exactly ${count} map entries, received ${actual}`;
        } catch {
            return `Expected a map with exactly ${count} entries`;
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
        case 'remainderCountNode':
        case 'prefixedCountNode': {
            return array(itemValidator) as StructUnknown;
        }
        default: {
            // This should be unreachable with the current `CountNode` union but helps
            // guard against future Codama expansions.
            throw new Error(`Node: ${nodeName}. Unsupported array count type`);
        }
    }
}

/**
 * Validator for amountTypeNode and solAmountTypeNode.
 * Accepts number, bigint.
 */
function AmountTypeValidator(nodeName: string): StructUnknown {
    return define(`AmountType_${nodeName}`, (value: unknown) => {
        if (typeof value === 'number') {
            return Number.isSafeInteger(value) || `Expected a safe integer, received unsafe number: ${value}`;
        }
        if (typeof value === 'bigint') {
            return true;
        }
        return `Expected a number or bigint, received: ${formatValueType(value)}`;
    }) as StructUnknown;
}
