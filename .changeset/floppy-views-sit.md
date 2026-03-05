---
'@hoodieshq/dynamic-instructions': minor
---

- Added `.resolvers()` API for `resolverValueNode` support.
    - New `.resolvers({ [name]: async (args, accounts) => value })` method on `MethodsBuilder` and `ProgramMethodBuilder`. Enables runtime resolution of account addresses and argument defaults driven by `resolverValueNode` entries in Codama IDLs.

- Renamed `CodamaError` -> `DynamicInstructionsError`.
