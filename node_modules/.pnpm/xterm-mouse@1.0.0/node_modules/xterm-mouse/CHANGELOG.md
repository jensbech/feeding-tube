# @ink-tools/xterm-mouse

## 1.0.0

### Major Changes

- d11f950: **BREAKING CHANGE**: Refactored `Mouse` class constructor to support full dependency injection via options object.

  **Before:**

  ```typescript
  new Mouse(inputStream?, outputStream?, emitter?, options?)
  ```

  **After:**

  ```typescript
  new Mouse(options?)
  ```

  All external dependencies (`emitter`, `inputStream`, `outputStream`, `setRawMode`) are now configurable through `MouseOptions`:

  ```typescript
  const mouse = new Mouse({
    emitter: customEmitter,        // optional, defaults to new EventEmitter()
    inputStream: process.stdin,    // optional, defaults to process.stdin
    outputStream: process.stdout,  // optional, defaults to process.stdout
    setRawMode: (mode) => {...},   // optional, defaults to stream.setRawMode
    clickDistanceThreshold: 5,     // optional, defaults to 1
  });
  ```

  **Benefits:**

  - Cleaner API with single options parameter
  - Better testability without mocks
  - All dependencies injectable
  - Backward compatible via sensible defaults

  **Migration:**

  ```typescript
  // Old
  new Mouse(stream, undefined, undefined, { threshold: 5 });

  // New
  new Mouse({ inputStream: stream, clickDistanceThreshold: 5 });
  ```

  Added `examples/custom-streams.ts` demonstrating dependency injection.

### Minor Changes

- f8d500d: Integrate Ink's `useStdin()` and `useStdout()` hooks for proper stream management.

  **@ink-tools/ink-mouse:**

  - `useMouseInstance` now uses Ink's `useStdin()` and `useStdout()` hooks
  - Passes Ink-managed streams to `xterm-mouse` for proper integration
  - Raw mode control delegated to `xterm-mouse` via `setRawMode`

  **xterm-mouse:**

  - `Mouse.isSupported()` now accepts optional `inputStream` and `outputStream` parameters
  - Implements method via `checkSupport()` for DRY principle
  - Backwards compatible - defaults to `process.stdin`/`process.stdout`

  **Benefits:**

  - Proper integration with Ink's stream management
  - Consistent with Ink ecosystem patterns
  - Better type safety for custom streams
  - Clear ownership of raw mode (xterm-mouse)

## 0.7.6

### Patch Changes

- fdb01f8: Refactored Mouse class into smaller focused components for better testability and maintainability. Public API remains unchanged.

  **Internal Changes (xterm-mouse):**

  - Split 1583-line Mouse class into 7 focused classes:
    - `ClickDetector` - Detects click events from press+release
    - `PositionTracker` - Tracks latest mouse position
    - `TTYController` - Manages TTY raw mode and ANSI codes
    - `MouseEventManager` - Wraps EventEmitter for type-safe events
    - `MouseConvenienceMethods` - Helper methods (waitForClick, etc.)
    - `EventStreamFactory` - Creates async generator streams
    - `Mouse` - Orchestrates all components

  **Test Improvements (xterm-mouse):**

  - Added co-located tests for all new classes (296 total tests)
  - Improved test coverage: EventStreamFactory (90.75%), TTYController (85.07%)

  **Internal Changes (ink-mouse):**

  - Extracted `useElementBoundsCache` hook for caching element bounds
  - Extracted `useMouseInstance` hook for managing Mouse instance lifecycle
  - Refactored provider logic into focused, testable functions
  - Added comprehensive test coverage for hooks and provider (9 test files)
  - Excluded barrel files from coverage report in vitest config

  **General Improvements:**

  - Added GC test support with `--expose-gc` flag
  - Added `test:gc` command for running tests with GC enabled
  - Updated CI to run tests with `NODE_OPTIONS="--expose-gc"`

  **Migration:** No changes required - public API is unchanged.

## 0.7.5

### Patch Changes

- f57be37: Republish packages after pnpm migration improvements.

  - Fix xterm-mouse dual-package ESM/CJS support
  - Add CJS build output to tsup config
  - Update package.json exports with require condition
  - Add proper type definitions for CJS (.d.cts)

## 0.7.4

### Patch Changes

- 5d22855: Fix: Replace `bun changeset publish` with custom scripts that properly resolve workspace:\* dependencies during publishing. Uses `npm publish --provenance` to maintain OIDC security while ensuring workspace dependencies are converted to actual versions.

## 0.7.3

### Patch Changes

- a91faf5: Test OIDC Trusted Publishing for both scoped and unscoped packages

## 0.7.2

### Patch Changes

- 75cf63a: Migrate `@ink-tools/xterm-mouse` package into monorepo from standalone repository.

  ## What Changed

  - Moved package to `packages/xterm-mouse/`
  - Updated build configuration for monorepo integration
  - Updated `ink-mouse` to use workspace dependency (`workspace:*`)
  - Migrated all 176 tests and 7 examples
  - Updated documentation with new repository URLs
  - Added package to monorepo README

  ## What Didn't Change

  - Package name: Still `@ink-tools/xterm-mouse`
  - API: 100% backward compatible
  - All functionality preserved
  - Build output identical to standalone

  ## Testing

  - All 176 xterm-mouse tests passing
  - All 148 ink-mouse tests passing
  - Workspace dependency working correctly
  - Examples run successfully

  ## Impact

  - **For consumers:** No action required. The package works identically.
  - **For contributors:** Development now happens in the monorepo. Send PRs to the `ink-tools` repository with the `xterm-mouse` label.
