# Testing Guide for @ink-tools/ink-mouse

This guide helps contributors write effective tests for the `@ink-tools/ink-mouse` package.

## Table of Contents

- [Overview](#overview)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Testing Utilities](#testing-utilities)
- [Common Patterns](#common-patterns)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

The test suite uses:

- **Vitest** - Fast test runner with native TypeScript support
- **ink-testing-library** - Render and test Ink components
- **Custom mocks** - Mock Ink's internal structures (DOMElement, yogaNode)

### Test Coverage

- **95.26%** line coverage
- **97.44%** function coverage
- **148 tests** across 8 files

## Test Structure

```text
packages/ink-mouse/
├── test/
│   └── mocks/
│       ├── ink-element.ts       # DOMElement and yogaNode mocks
│       └── mouse-events.ts      # Mock mouse event utilities
├── src/
│   ├── utils/
│   │   ├── geometry.test.ts     # Geometry utility tests
│   │   └── events.test.ts       # Event utility tests
│   ├── geometry.test.ts         # Position/dimension tests
│   ├── hooks.test.tsx           # Geometry hook tests
│   ├── hooks/
│   │   ├── mouse-events.test.tsx  # Event hook tests
│   │   └── useMouse.test.tsx      # useMouse hook tests
│   ├── provider.test.tsx        # MouseProvider tests
│   └── integration/
│       └── integration.test.tsx  # Integration tests
```

## Running Tests

### Basic Commands

```bash
# Run all tests in monorepo
pnpm test

# Run with coverage
pnpm run test:coverage

# Run specific test file
pnpm test src/utils/geometry.test.ts

# Watch mode
pnpm run test:watch
```

### Monorepo Testing

The root `package.json` provides centralized commands:

```bash
# Run all tests across all packages
pnpm test

# Run all tests with coverage
pnpm run test:coverage

# Generate LCOV reports for CI/CD
pnpm run test:coverage:lcov
```

## Writing Tests

### Basic Test Structure

```typescript
import { describe, expect, test } from 'vitest';

describe('FunctionName', () => {
  test('does something specific', () => {
    // Arrange
    const input = /* ... */;

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Testing Ink Components

**CRITICAL**: Files with JSX must use `.tsx` extension!

```typescript
// src/hooks.test.tsx ✅ CORRECT
// src/hooks.test.ts  ❌ WRONG

import { render } from 'ink-testing-library';
import { describe, expect, test } from 'vitest';
import React from 'react';
import { Box, Text } from 'ink';

test('renders component', () => {
  function TestComponent() {
    return (
      <Box>
        <Text>Hello</Text>
      </Box>
    );
  }

  const { lastFrame } = render(<TestComponent />);
  expect(lastFrame()).toBe('Hello');
});
```

### Testing React Hooks

```typescript
import { render } from 'ink-testing-library';
import React from 'react';
import { MouseProvider, useOnClick } from '@ink-tools/ink-mouse';

describe('useOnClick', () => {
  test('registers handler on mount', () => {
    let handlerCalled = false;

    function TestComponent() {
      const ref = React.useRef(null);
      useOnClick(ref, () => {
        handlerCalled = true;
      });

      return (
        <Box>
          <Text>Clickable</Text>
        </Box>
      );
    }

    render(
      <MouseProvider>
        <TestComponent />
      </MouseProvider>
    );

    // Verify handler was registered (cannot test actual click without terminal)
    expect(handlerCalled).toBe(false);
  });
});
```

## Testing Utilities

### Mock Helpers

Located in `test/mocks/ink-element.ts`:

#### `createMockYogaNode(layout)`

Creates a mock Yoga node with computed layout.

```typescript
import { createMockYogaNode } from '@ink-tools/ink-mouse/test/mocks/ink-element';

const yogaNode = createMockYogaNode({
  left: 10,
  top: 20,
  width: 100,
  height: 50,
});

expect(yogaNode.getComputedLayout()).toEqual({
  left: 10,
  top: 20,
  width: 100,
  height: 50,
});
```

#### `createMockDOMElement(props)`

Creates a mock DOMElement with a yogaNode.

```typescript
import { createMockDOMElement } from '@ink-tools/ink-mouse/test/mocks/ink-element';

const element = createMockDOMElement({
  left: 10,
  top: 20,
  width: 100,
  height: 50,
  parentNode: null,
});

expect(element.yogaNode.getComputedLayout()).toEqual({
  left: 10,
  top: 20,
  width: 100,
  height: 50,
});
```

#### `createMockDOMElementChain(elements)`

Creates a chain of nested elements with parent relationships.

```typescript
import { createMockDOMElementChain } from '@ink-tools/ink-mouse/test/mocks/ink-element';

const childElement = createMockDOMElementChain([
  { left: 5, top: 10, width: 50, height: 30 },   // child
  { left: 15, top: 20, width: 100, height: 50 },  // parent
  { left: 25, top: 30, width: 150, height: 70 },  // grandparent
]);

// Positions accumulate through parent chain + terminal 1-indexing
// child: (1 + 5 + 15 + 25, 1 + 10 + 20 + 30) = (46, 61)
```

### Mock Mouse Events

Located in `test/mocks/mouse-events.ts`:

#### `createMockMouseEvent(props)`

Creates a mock InkMouseEvent object.

```typescript
import { createMockMouseEvent } from '@ink-tools/ink-mouse/test/mocks/mouse-events';

const clickEvent = createMockMouseEvent({
  x: 10,
  y: 20,
  button: 'left',
  action: 'click',
});

const wheelEvent = createMockMouseEvent({
  x: 15,
  y: 25,
  button: 'wheel-up',
  action: 'wheel',
});
```

## Common Patterns

### Testing Geometry Functions

```typescript
import { isPointInRect } from './geometry';

describe('isPointInRect', () => {
  test('returns true for point inside rectangle', () => {
    const rect = {
      left: 10,
      top: 10,
      right: 20,
      bottom: 20,
      width: 10,
      height: 10,
      x: 10,
      y: 10,
    };

    expect(isPointInRect(15, 15, rect)).toBe(true);
  });

  test('returns false for point outside rectangle', () => {
    const rect = {
      left: 10,
      top: 10,
      right: 20,
      bottom: 20,
      width: 10,
      height: 10,
      x: 10,
      y: 10,
    };

    expect(isPointInRect(5, 5, rect)).toBe(false);
  });
});
```

### Testing Hook Registration

```typescript
describe('useOnClick', () => {
  test('registers handler on mount', () => {
    const mockHandler = () => {};

    function TestComponent() {
      const ref = React.useRef(null);
      useOnClick(ref, mockHandler);

      return <Box><Text>Test</Text></Box>;
    }

    const { lastFrame, unmount } = render(
      <MouseProvider>
        <TestComponent />
      </MouseProvider>
    );

    expect(lastFrame()).toBe('Test');

    // Verify cleanup doesn't throw
    expect(() => unmount()).not.toThrow();
  });
});
```

### Testing Element Position Calculation

```typescript
import { getElementPosition } from './geometry';
import { createMockDOMElement } from '../../test/mocks/ink-element';

describe('getElementPosition', () => {
  test('returns position with terminal 1-indexing', () => {
    const element = createMockDOMElement({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
    });

    const position = getElementPosition(element);

    // +1 for terminal 1-indexing
    expect(position).toEqual({ left: 11, top: 21 });
  });
});
```

### Testing Multiple Handlers

```typescript
describe('Multiple event handlers', () => {
  test('component can register multiple handlers', () => {
    function TestComponent() {
      const ref = React.useRef(null);

      useOnClick(ref, () => {});
      useOnMouseEnter(ref, () => {});
      useOnMouseLeave(ref, () => {});
      useOnPress(ref, () => {});
      useOnRelease(ref, () => {});
      useOnMouseMove(ref, () => {});

      return (
        <Box>
          <Text>Multi-handler</Text>
        </Box>
      );
    }

    const { lastFrame } = render(
      <MouseProvider>
        <TestComponent />
      </MouseProvider>
    );

    expect(lastFrame()).toBe('Multi-handler');
  });
});
```

## Best Practices

### 1. Use `.tsx` for JSX

```typescript
// ✅ CORRECT
src/hooks.test.tsx

// ❌ WRONG
src/hooks.test.ts
```

### 2. Wrap Text in `<Text>` Components

```tsx
// ✅ CORRECT
<Box>
  <Text>Hello</Text>
</Box>

// ❌ WRONG - throws error
<Box>
  Hello
</Box>
```

### 3. Create Template Literals in Variables

```tsx
// ✅ CORRECT
const text = `Value: ${value}`;
return <Box><Text>{text}</Text></Box>;

// ❌ WRONG - may not work
return <Box><Text>{`Value: ${value}`}</Text></Box>;
```

### 4. Account for Terminal 1-Indexing

Terminal coordinates start at (1, 1), not (0, 0):

```typescript
// Element at layout position { left: 10, top: 20 }
const position = getElementPosition(element);

// Expected: { left: 11, top: 21 } (+1 for terminal)
expect(position).toEqual({ left: 11, top: 21 });
```

### 5. Test Realistic Scenarios

Focus on component composition and lifecycle:

```typescript
// ✅ GOOD - Tests real usage
test('component with multiple handlers works', () => {
  function TestComponent() {
    const ref = React.useRef(null);
    useOnClick(ref, () => {});
    useOnMouseEnter(ref, () => {});

    return <Box><Text>Test</Text></Box>;
  }

  render(<MouseProvider><TestComponent /></MouseProvider>);
});

// ❌ AVOID - Testing implementation details
test('hook calls useEffect', () => {
  // Don't test React internals
});
```

### 6. Describe What, Not How

```typescript
// ✅ GOOD
test('registers click handler on mount', () => {
  // ...
});

// ❌ VAGUE
test('hook works', () => {
  // ...
});
```

## Troubleshooting

### "Text string must be rendered inside <Text> component"

**Problem**: Direct text in JSX without `<Text>` wrapper.

**Solution**:

```tsx
// Before
<Box>Hello</Box>

// After
<Box><Text>Hello</Text></Box>
```

### "Unexpected token '<'"

**Problem**: Using `.ts` extension for file with JSX.

**Solution**: Rename to `.tsx`:

```bash
mv src/hooks.test.ts src/hooks.test.tsx
```

### Template Literals Not Working

**Problem**: Template literals in JSX expressions.

**Solution**: Use variables:

```tsx
// Before
<Box>{`Value: ${value}`}</Box>

// After
const text = `Value: ${value}`;
<Box><Text>{text}</Text></Box>
```

### Coverage Not Updated

**Problem**: Coverage report shows old numbers.

**Solution**: Clean coverage directories:

```bash
rm -rf coverage
pnpm run test:coverage
```

### Tests Pass But Coverage Low

**Problem**: Missing test cases for uncovered code.

**Solution**: Run coverage with detailed output:

```bash
pnpm run test:coverage
```

Look for lines marked with `-` (not covered) in the output.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
        with:
          version: 10
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm run test:coverage:lcov
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Ink Documentation](https://github.com/vadimdemedes/ink)
- [React Testing Library Principles](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Project Documentation](../../docs/solutions/testing/)
  - [Integration Tests](../../docs/solutions/testing/integration-tests-ink-mouse-event-workflows.md)
  - [React Hooks Testing](../../docs/solutions/testing/testing-ink-components-with-hooks.md)

## Contributing Tests

When contributing new tests:

1. **Place tests next to source code** - `src/utils/geometry.ts` → `src/utils/geometry.test.ts`
2. **Use `.tsx` for JSX** - Files with JSX must have `.tsx` extension
3. **Follow naming conventions** - `*.test.ts` or `*.test.tsx`
4. **Test realistic scenarios** - Focus on usage, not implementation
5. **Aim for high coverage** - But prioritize meaningful tests over 100%
6. **Document edge cases** - Add comments for non-obvious test behavior

## Questions?

If you have questions about testing, please:

1. Check existing test files for examples
2. Review this guide and linked documentation
3. Open an issue with your question
