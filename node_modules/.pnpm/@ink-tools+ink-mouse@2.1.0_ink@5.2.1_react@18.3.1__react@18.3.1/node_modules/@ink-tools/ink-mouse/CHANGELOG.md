# Changelog

## 2.1.0

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

### Patch Changes

- Updated dependencies [d11f950]
- Updated dependencies [f8d500d]
  - xterm-mouse@1.0.0

## 2.0.5

### Patch Changes

- 3a717ed: Fix publish workflow to resolve `workspace:*` dependencies to actual versions in published package.json

## 2.0.4

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

- Updated dependencies [fdb01f8]
  - xterm-mouse@0.7.6

## 2.0.3

### Patch Changes

- f57be37: Republish packages after pnpm migration improvements.

  - Fix xterm-mouse dual-package ESM/CJS support
  - Add CJS build output to tsup config
  - Update package.json exports with require condition
  - Add proper type definitions for CJS (.d.cts)

- Updated dependencies [f57be37]
  - xterm-mouse@0.7.5

## 2.0.2

### Patch Changes

- 5d22855: Fix: Replace `bun changeset publish` with custom scripts that properly resolve workspace:\* dependencies during publishing. Uses `npm publish --provenance` to maintain OIDC security while ensuring workspace dependencies are converted to actual versions.
- Updated dependencies [5d22855]
  - xterm-mouse@0.7.4

## 2.0.1

### Patch Changes

- a91faf5: Test OIDC Trusted Publishing for both scoped and unscoped packages
- Updated dependencies [a91faf5]
  - xterm-mouse@0.7.3

## 2.0.0

### Major Changes

- 356968c: Migrate package from `@neiropacks/ink-mouse` to `@ink-tools/ink-mouse` with version 1.0.0.

  ## Breaking Changes

  - **Package renamed**: `@neiropacks/ink-mouse` → `@ink-tools/ink-mouse`
  - **Repository moved**: `neiropacks/ink-tui-kit` → `neiromaster/ink-tools`
  - **Major version bump**: 0.2.2 → 1.0.0

  ## Migration Required

  Users need to:

  1. Update dependencies: `bun remove @neiropacks/ink-mouse && bun add @ink-tools/ink-mouse@^1.0.0`
  2. Update imports: `@neiropacks/ink-mouse` → `@ink-tools/ink-mouse`
  3. No API changes - all hooks, components, and utilities remain identical

  ## What's Unchanged

  - All APIs remain 100% compatible
  - All features work identically
  - Same peer dependencies (ink ^6.6.0, react ^19.2.3)
  - Same behavior and performance

  ## Documentation

  See [Migration Guide](../docs/migration-guide.md) for detailed migration instructions.

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

- Updated dependencies [75cf63a]
  - @ink-tools/xterm-mouse@0.7.2

## 0.2.2

### Patch Changes

- 2781665: Test OIDC publishing with Trusted Publishing configuration.

## 0.2.1

### Patch Changes

- 4c75065: Configure Trusted Publishing (OIDC) for secure npm publishing instead of NPM_TOKEN

## 0.2.0

### Minor Changes

- d71e2dd: Add initial mouse support for Ink applications with click, mouse enter/leave, and wheel event handling. Features dynamic hit testing, automatic geometry tracking, and React hooks API.
- 3895b6c: Add support for press, release, move, and drag events. New hooks: useOnPress, useOnRelease, useOnMouseMove, useOnDrag. Update provider to handle all xterm-mouse event types.

### Patch Changes

- 71cbc5f: Optimize hover state tracking with bounds caching. Refactor to use unified caching mechanism for all mouse events, reducing `getBoundingClientRect()` calls by up to 60x. Removes ~60 lines of code by eliminating handler grouping logic.
- e83ead0: Refactor handler registration to follow KISS and DRY principles. Unified 8 register/unregister functions into 2, simplified hook implementations, and reduced bundle size by ~15%. API remains unchanged.

This file is automatically generated by changesets.
