# @hoodieshq/dynamic-instructions

## 0.1.0

### Minor Changes

- [#33](https://github.com/hoodieshq/codama-dynamic-instructions-demo/pull/33) [`9ff5816`](https://github.com/hoodieshq/codama-dynamic-instructions-demo/commit/9ff581683c085f29e6f2c520a7af8a9c5be47641) Thanks [@mikhd](https://github.com/mikhd)! - - Added `.resolvers()` API for `resolverValueNode` support. - New `.resolvers({ [name]: async (args, accounts) => value })` method on `MethodsBuilder` and `ProgramMethodBuilder`. Enables runtime resolution of account addresses and argument defaults driven by `resolverValueNode` entries in Codama IDLs.
    - Renamed `CodamaError` -> `DynamicInstructionsError`.

## 0.0.2

### Patch Changes

- [#31](https://github.com/hoodieshq/codama-dynamic-instructions-demo/pull/31) [`56f9d15`](https://github.com/hoodieshq/codama-dynamic-instructions-demo/commit/56f9d15c2e3b90a4851b470d7d9596a3b140e941) Thanks [@mikhd](https://github.com/mikhd)! - improve validator error messages
