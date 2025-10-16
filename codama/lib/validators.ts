import { isAddress } from "@solana/addresses";
import { ArrayTypeNode, CountNode, DefinedTypeNode, InstructionAccountNode, InstructionArgumentNode, SetTypeNode, TypeNode } from "@codama/nodes";
import { object, define, boolean, Struct, number, array, size, intersection, string, tuple } from "superstruct";

export function createIxAccountsValidator(ixAccountNodes: InstructionAccountNode[]): Struct {
  return object(
    ixAccountNodes.reduce((acc, node) => {
      // if node is optional, then validate only if it's provided
      // if node has default value, then consider it as optional and validate only if it's provided. Otherwise it will be resolved from default value
      acc[node.name] = node.isOptional || node.defaultValue ? OptionalSolanaAddressValidator : SolanaAddressValidator;
      return acc;
    }, {}),
  )
}

export function createIxArgumentsValidator(ixNodeName: string, ixArgumentNodes: InstructionArgumentNode[], definedTypes: DefinedTypeNode[]): Struct {
  return object(
    ixArgumentNodes.reduce((acc, argumentNode, index) => {
      acc[argumentNode.name] = createValidatorForTypeNode(`${ixNodeName}_${argumentNode.name}_${index}`, argumentNode.type, definedTypes);
      return acc;
    }, {}),
  )
}

function createValidatorForTypeNode(nodeName: string, node: TypeNode, definedTypes: DefinedTypeNode[]): Struct {
  switch (node.kind) {
    case "arrayTypeNode": {
      return arrayValidator(`${nodeName}_array`, node, definedTypes);
    } case "booleanTypeNode": {
      return boolean();
    } case "numberTypeNode": {
      return number();
    }
    case "publicKeyTypeNode": {
      return SolanaAddressValidator;
    }
    case "setTypeNode": {
      // array of unique items
      return intersection([UniqueItemsValidator, arrayValidator(`${nodeName}_set`, node, definedTypes)]);
    }
    case "stringTypeNode": {
      // TODO: may be check encoding?
      // node.encoding
      return string();
    }
    case "fixedSizeTypeNode": {
      const itemValidator = createValidatorForTypeNode(`${nodeName}_fixed_size`, node.type, definedTypes);
      return size(array(itemValidator), node.size);
    }
    case "bytesTypeNode": {
      return number(); // raw bytes as array of numbers
    }
    case "dateTimeTypeNode": {
      return createValidatorForTypeNode(`${nodeName}_date_time`, node.number, definedTypes);
    }
    case "definedTypeLinkNode": {
      // Reference to common defined type
      const definedType = definedTypes.find(d => d.name === node.name);
      if (!definedType) {
        throw new Error(`Undefined type: ${node.name} ${node.kind}`);
      }
      return createValidatorForTypeNode(`${nodeName}_defined_type`, definedType.type, definedTypes);
    }
    case "mapTypeNode": {
      const keyValidator = createValidatorForTypeNode(`${nodeName}_map_key_${node.key}`, node.key, definedTypes);
      const valueValidator = createValidatorForTypeNode(`${nodeName}_map_value_${node.key}`, node.value, definedTypes);
      const sizeValidator = MapCountValidator(node.count);
      // node.
      const keyValueValidator = KeyValueValidator(nodeName, keyValidator, valueValidator);
      if (sizeValidator) {
        return intersection([keyValueValidator, sizeValidator]);
      }
      return keyValueValidator;
    }
    case "structTypeNode": {
      return object(
        node.fields.reduce((acc, node) => {
          acc[node.name] = createValidatorForTypeNode(`${nodeName}_struct_${node.name}`, node.type, definedTypes);
          return acc;
        }, {})
      )
    }
    case "tupleTypeNode": {
      const validators = node.items.map((typeNode, index) => createValidatorForTypeNode(`${nodeName}_tuple${typeNode.kind}_${index}`, typeNode, definedTypes))
      return tuple(validators as [Struct<unknown, unknown>, ...Struct<unknown, unknown>[]]);
    }
    case "zeroableOptionTypeNode": {
      return createValidatorForTypeNode(`${nodeName}_zeroeable_option`, node.item, definedTypes);
    }
    case "optionTypeNode": {
      // TODO: Check and add handling node.fixed and node.prefix if necessary https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/OptionTypeNode.md#attributes
      const SomeValueValidator = createValidatorForTypeNode(`${nodeName}_option_item`, node.item, definedTypes);
      return OptionValueValidator(`${nodeName}_option`, SomeValueValidator);
    }
    // TODO: check and handle later
    // DOCS: TypeNode https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/README.md
    case "amountTypeNode": // unit with decimals
    case "solAmountTypeNode": // equivalent to amountTypeNode with 9 decimals
    case "hiddenPrefixTypeNode":
    case "hiddenSuffixTypeNode":
    case "remainderOptionTypeNode":
    case "sentinelTypeNode":
    case "postOffsetTypeNode":
    case "preOffsetTypeNode":
    case "sizePrefixTypeNode":
    case "enumTypeNode":
      throw new Error(`Unsupported argument type: ${nodeName} of type ${node.kind}`);
  }
}

const SolanaAddressValidator = define("SolanaAddress", (value: unknown) => {
  if (typeof value !== "string") return false;
  return isAddress(value);
});

const OptionalSolanaAddressValidator = define("OptionalSolanaAddress", (value: unknown) => {
  if (value === undefined || value === null) return true;
  const result = SolanaAddressValidator.validate(value);
  return !result[0]; // [error|undefined, data|undefined]
});

// Validates value only if it is not null or undefined (i.e. if it's provided)
// SomeValueValidator validates the provided value (i.e. Some(value))
function OptionValueValidator(name: string, SomeValueValidator: Struct): Struct {
  return define(`${name}_OptionValueValidator`, (value: unknown) => {
    // Do not validate None value
    if (value === null || value === undefined) return true;
    // if value was provided, then validate it
    return !SomeValueValidator.validate(value)[0]; // error | undefined
  })
}

// Checks that all items in the array are unique
const UniqueItemsValidator = define("UniqueItems", (value: unknown) => {
  if (!Array.isArray(value)) return false;
  const uniqueItems = new Set(value);
  return uniqueItems.size === value.length;
});

// Validates every keys of an object according to KeyValidator
// Validates every value of an object according to ValueValidator
// Used in MapTypeNode, where the keys and valuse are of the same type
// DOCS: https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/MapTypeNode.md
function KeyValueValidator(name: string, KeyValidator: Struct, ValueValidator: Struct): Struct {
  return define(`${name}_KeyValueValidator`, (value: Record<any, unknown>) => {
    const isValidKeys = Object.keys(value).every(key => {
      return !KeyValidator.validate(key)[0]; // [error|undefined, data|undefined]
    })
    const isValidValues = Object.values(value).every(value => {
      return !ValueValidator.validate(value)[0]; // [error|undefined, data|undefined]
    })
    return isValidKeys && isValidValues;
  })
}

function MapCountValidator(node: CountNode): Struct | null {
  switch (node.kind) {
    case "fixedCountNode":
      return KeysLengthValidator(node.value);
    case "remainderCountNode":
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
function KeysLengthValidator(count: number): Struct {
  return define(`KeysLengthValidator_len_${count}`, (value: unknown) => {
    try {
      const length = Object.keys(value).length;
      if (length != count) return false;
    } catch {
      return false;
    }
  });
}

// Handles both fixed-size and variable-size arrays
function arrayValidator(nodeName: string, node: ArrayTypeNode | SetTypeNode, definedTypes: DefinedTypeNode[]): Struct {
  // First define a validator for every array item
  const itemValidator = createValidatorForTypeNode(nodeName, node.item, definedTypes);
  // Then validate CountNode representing array size:
  // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/typeNodes/ArrayTypeNode.md
  switch (node.count.kind) {
    case "fixedCountNode": {
      return size(array(itemValidator), node.count.value);
    }
    case "remainderCountNode": {
      return array(itemValidator);
    }
    case "prefixedCountNode": {
      // TODO: check and handle these types later
      // https://github.com/codama-idl/codama/blob/main/packages/nodes/docs/countNodes/PrefixedCountNode.md
      // node.count.prefix.kind
    }
    default: {
      throw new Error(`Node: ${nodeName}. Unsupported array count type: ${node.count.kind}`);
    }
  }
}
