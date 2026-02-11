import type {
    ArrayTypeNode,
    CountNode,
    DefinedTypeNode,
    InstructionAccountNode,
    InstructionArgumentNode,
    SetTypeNode,
    TypeNode,
} from '@codama/nodes';
import { isAddress } from '@solana/addresses';
import { array, boolean, define, intersection, number, object, size, string, Struct, tuple } from 'superstruct';

import { isPublicKeyLike } from '../../shared/address';

type StructUnknown = Struct<unknown, unknown>;

export function createIxAccountsValidator(ixAccountNodes: InstructionAccountNode[]): StructUnknown {
    const shape = ixAccountNodes.reduce<Record<string, StructUnknown>>((acc, node) => {
        // if node is optional, then validate only if it's provided
        // if node has default value, then consider it as optional and validate only if it's provided. Otherwise it will be resolved from default value
        acc[node.name] =
            node.isOptional || node.defaultValue ? OptionalSolanaAddressValidator : SolanaAddressValidator;
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
        acc[argumentNode.name] = createValidatorForTypeNode(
            `${ixNodeName}_${argumentNode.name}_${index}`,
            argumentNode.type,
            definedTypes,
        );
        return acc;
    }, {});
    return object(shape) as StructUnknown;
}

function createValidatorForTypeNode(nodeName: string, node: TypeNode, definedTypes: DefinedTypeNode[]): StructUnknown {
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
            return intersection([UniqueItemsValidator, arrayValidator(`${nodeName}_set`, node, definedTypes)]) as StructUnknown;
        }
        case 'stringTypeNode': {
            // TODO: may be check encoding?
            // node.encoding
            return string() as StructUnknown;
        }
        case 'fixedSizeTypeNode': {
            const itemValidator = createValidatorForTypeNode(`${nodeName}_fixed_size`, node.type, definedTypes);
            return size(array(itemValidator), node.size) as StructUnknown;
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
            const keyValidator = createValidatorForTypeNode(`${nodeName}_map_key_${node.key}`, node.key, definedTypes);
            const valueValidator = createValidatorForTypeNode(
                `${nodeName}_map_value_${node.key}`,
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
        // TODO: check and handle later
        // DOCS: TypeNode https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/README.md
        case 'amountTypeNode': // unit with decimals
        case 'solAmountTypeNode': // equivalent to amountTypeNode with 9 decimals
        case 'hiddenPrefixTypeNode':
        case 'hiddenSuffixTypeNode':
        case 'remainderOptionTypeNode':
        case 'sentinelTypeNode':
        case 'postOffsetTypeNode':
        case 'preOffsetTypeNode':
        case 'sizePrefixTypeNode': {
            // Size-prefixed type (e.g. length-prefixed string); validate the inner type only
            // Cast to access the type property which exists on sizePrefixTypeNode
            const sizePrefixNode = node as TypeNode & { type: TypeNode };
            return createValidatorForTypeNode(`${nodeName}_size_prefix`, sizePrefixNode.type, definedTypes);
        }
        case 'enumTypeNode':
            throw new Error(`Unsupported argument type: ${nodeName} of type ${node.kind}`);
    }
}

const SolanaAddressValidator: StructUnknown = /* @__PURE__ */ define('SolanaAddress', (value: unknown) => {
    if (typeof value === 'string') return isAddress(value);
    if (isPublicKeyLike(value)) return isAddress(value.toBase58());
    return false;
});

const OptionalSolanaAddressValidator: StructUnknown = /* @__PURE__ */ define('OptionalSolanaAddress', (value: unknown) => {
    if (value === undefined || value === null) return true;
    const result = SolanaAddressValidator.validate(value);
    return !result[0]; // [error|undefined, data|undefined]
});

/** Accepts both number and bigint for u64/u128/i64/i128 instruction args. */
const NumberOrBigintValidator: StructUnknown = /* @__PURE__ */ define('NumberOrBigint', (value: unknown) => {
    if (typeof value === 'number') return Number.isInteger(value);
    if (typeof value === 'bigint') return true;
    return false;
});

const BytesLikeValidator: StructUnknown = /* @__PURE__ */ define('BytesLike', (value: unknown) => {
    if (value instanceof Uint8Array) return true;
    if (!Array.isArray(value)) return false;
    return value.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255);
});

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
function arrayValidator(nodeName: string, node: ArrayTypeNode | SetTypeNode, definedTypes: DefinedTypeNode[]): StructUnknown {
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
