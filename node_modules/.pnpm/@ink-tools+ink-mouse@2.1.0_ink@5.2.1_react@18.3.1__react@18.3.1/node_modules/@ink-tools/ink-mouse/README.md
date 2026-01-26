# @ink-tools/ink-mouse

Mouse support for [Ink](https://github.com/vadimdemedes/ink) applications.
Provides a React-based API for handling mouse events in terminal user
interfaces.

## Features

- **Click detection** - Detect mouse clicks on elements
- **Press/Release tracking** - Track individual button press and release events
- **Hover tracking** - Track when mouse enters/exits elements
- **Mouse move tracking** - Track mouse movement over elements
- **Drag support** - Track mouse drag operations
- **Wheel/scroll support** - Handle mouse wheel events
- **Automatic hit testing** - Uses element bounds for accurate event detection
- **Performance optimization** - Bounds caching reduces CPU usage by up to 60x
- **Dynamic layout support** - Recalculates element positions on cache expiry
- **Configurable cache** - Tune cache lifetime for your use case
- **Terminal compatibility** - Works with xterm-compatible terminals

## Installation

```bash
pnpm add @ink-tools/ink-mouse
# or
npm install @ink-tools/ink-mouse
# or
yarn add @ink-tools/ink-mouse
```

## Peer Dependencies

This package requires the following peer dependencies:

- `ink` ^6.6.0
- `react` ^19.2.3

## Quick Start

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { MouseProvider, useOnClick } from '@ink-tools/ink-mouse';

function Button() {
 const ref = React.useRef(null);

 useOnClick(ref, () => {
  console.log('Button clicked!');
 });

 return (
  <Box ref={ref}>
   <Text>Click me!</Text>
  </Box>
 );
}

function App() {
 return (
  <MouseProvider>
   <Button />
  </MouseProvider>
 );
}
```

## API Reference

### `<MouseProvider>`

Wrapper component that enables mouse tracking for your application.

**Props:**

- `autoEnable?: boolean` - Automatically enable mouse tracking on mount (default: `true`)
- `cacheInvalidationMs?: number` - Element bounds cache lifetime in milliseconds (default: `16`)

The `cacheInvalidationMs` prop controls how long element bounds are cached. Longer values
reduce CPU usage but may cause stale hit detection during rapid layout changes.

**Example:**

```tsx
<MouseProvider autoEnable={true} cacheInvalidationMs={16}>
 <App />
</MouseProvider>
```

**Performance tuning:**

- `16` (default): ~60fps, best for most cases
- `50`: ~20fps, good for slower terminals
- `0`: disable cache, recalculate on every event (highest CPU usage)

### `useMouse()`

Hook for accessing mouse state and control methods.

**Returns:**

```typescript
{
 isEnabled: boolean;   // Is mouse tracking enabled?
 isTracking: boolean;  // Are mouse events being received?
 isSupported: boolean; // Does terminal support mouse?
 enable: () => void;   // Enable mouse tracking
 disable: () => void;  // Disable mouse tracking
}
```

**Example:**

```tsx
function Status() {
 const mouse = useMouse();

 return (
  <Box>
   <Text>Mouse: {mouse.isEnabled ? 'On' : 'Off'}</Text>
   <Text>Supported: {mouse.isSupported ? 'Yes' : 'No'}</Text>
  </Box>
 );
}
```

### `useOnClick(ref, handler)`

Hook for handling click events on an element.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Click handler function

**Example:**

```tsx
function Clickable() {
 const ref = React.useRef(null);

 useOnClick(ref, (event) => {
  console.log(`Clicked at ${event.x}, ${event.y}`);
  console.log(`Button: ${event.button}`);
 });

 return <Box ref={ref}>Click me</Box>;
}
```

### `useOnMouseEnter(ref, handler)`

Hook for handling mouse enter events only.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Mouse enter handler

**Example:**

```tsx
function Hoverable() {
 const ref = React.useRef(null);
 const [message, setMessage] = React.useState('');

 useOnMouseEnter(ref, () => setMessage('Mouse entered!'));

 return (
  <Box ref={ref}>
   <Text>{message}</Text>
  </Box>
 );
}
```

### `useOnMouseLeave(ref, handler)`

Hook for handling mouse leave events only.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Mouse leave handler

**Example:**

```tsx
function Hoverable() {
 const ref = React.useRef(null);
 const [message, setMessage] = React.useState('');

 useOnMouseLeave(ref, () => setMessage('Mouse left!'));

 return (
  <Box ref={ref}>
   <Text>{message}</Text>
  </Box>
 );
}
```

### `useOnWheel(ref, handler)`

Hook for handling mouse wheel/scroll events.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Wheel handler function

**Example:**

```tsx
function Scrollable() {
 const ref = React.useRef(null);
 const [offset, setOffset] = React.useState(0);

 useOnWheel(ref, (event) => {
  if (event.button === 'wheel-up') {
   setOffset((prev) => Math.max(0, prev - 1));
  } else if (event.button === 'wheel-down') {
   setOffset((prev) => prev + 1);
  }
 });

 return (
  <Box ref={ref} height={10}>
   <Box flexDirection="column" translateY={-offset}>
    {items.map((item) => (
     <Text key={item.id}>{item.name}</Text>
    ))}
   </Box>
  </Box>
 );
}
```

### `useOnPress(ref, handler)`

Hook for handling mouse button press events on an element.

Press events fire immediately when a mouse button is pressed down, before the
click event (which requires press + release).

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Press event handler

**Example:**

```tsx
function Button() {
 const ref = useRef<DOMElement>(null);
 const [isPressed, setIsPressed] = useState(false);

 useOnPress(ref, () => setIsPressed(true));
 useOnRelease(ref, () => setIsPressed(false));

 return (
  <Box ref={ref}>
   <Text>{isPressed ? 'Pressed!' : 'Press me'}</Text>
  </Box>
 );
}
```

### `useOnRelease(ref, handler)`

Hook for handling mouse button release events on an element.

Release events fire when a mouse button is released.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Release event handler

**Example:**

```tsx
function Button() {
 const ref = useRef<DOMElement>(null);
 const [isPressed, setIsPressed] = useState(false);

 useOnPress(ref, () => setIsPressed(true));
 useOnRelease(ref, () => setIsPressed(false));

 return (
  <Box ref={ref}>
   <Text>{isPressed ? 'Pressed!' : 'Press me'}</Text>
  </Box>
 );
}
```

### `useOnMouseMove(ref, handler)`

Hook for handling mouse move events on an element.

Move events fire when the mouse cursor moves within the element's bounds.
Unlike hover events, move events fire continuously as the mouse moves.

**Performance Note:** Move events fire very frequently. Consider debouncing or
throttling handlers for performance-sensitive applications.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Mouse move event handler

**Example:**

```tsx
function Tracker() {
 const ref = useRef<DOMElement>(null);
 const [position, setPosition] = useState({ x: 0, y: 0 });

 useOnMouseMove(ref, (event) => {
  setPosition({ x: event.x, y: event.y });
 });

 return (
  <Box ref={ref}>
   <Text>Mouse position: {position.x}, {position.y}</Text>
  </Box>
 );
}
```

### `useOnDrag(ref, handler)`

Hook for handling mouse drag events on an element.

Drag events fire when the mouse moves while a button is held down. This is
useful for implementing drag-and-drop functionality.

**Parameters:**

- `ref: RefObject<DOMElement>` - Reference to the element
- `handler: (event: InkMouseEvent) => void` - Drag event handler

**Example:**

```tsx
function Draggable() {
 const ref = useRef<DOMElement>(null);
 const [isDragging, setIsDragging] = useState(false);
 const [position, setPosition] = useState({ x: 0, y: 0 });

 useOnPress(ref, () => setIsDragging(true));
 useOnRelease(ref, () => setIsDragging(false));

 useOnDrag(ref, (event) => {
  if (isDragging) {
   setPosition({ x: event.x, y: event.y });
  }
 });

 return (
  <Box ref={ref} flexDirection="column">
   <Text>Position: {position.x}, {position.y}</Text>
   <Text>{isDragging ? '(dragging)' : '(not dragging)'}</Text>
  </Box>
 );
}
```

## Geometry Utilities

The package also provides utilities for working with element positions and rectangles:

### `getBoundingClientRect(node)`

Get the bounding rectangle of an element.

**Parameters:**

- `node: DOMElement | null` - The element to measure

**Returns:** `BoundingClientRect | undefined`

```typescript
interface BoundingClientRect {
 readonly x: number;
 readonly y: number;
 readonly width: number;
 readonly height: number;
 readonly top: number;
 readonly right: number;
 readonly bottom: number;
 readonly left: number;
}
```

### `useBoundingClientRect(ref, deps?)`

React hook for tracking element bounds.

**Parameters:**

- `ref: RefObject<DOMElement | null>` - Reference to the element
- `deps?: unknown[]` - Dependencies to trigger recalculation (default: `[]`)

**Returns:** `BoundingClientRect`

### `getRectCenter(rect)`

Get the center point of a rectangle. Useful for centering elements, calculating anchor points, or positioning tooltips.

**Parameters:**

- `rect: BoundingClientRect` - The bounding rectangle

**Returns:** `{ x: number; y: number }` - The center point

**Example:**

```tsx
import { getBoundingClientRect, getRectCenter } from '@ink-tools/ink-mouse';

function Tooltip() {
 const buttonRect = getBoundingClientRect(buttonRef.current);
 if (buttonRect) {
   const center = getRectCenter(buttonRect);
   console.log(`Button center: ${center.x}, ${center.y}`);
 }
 return <Box>Tooltip</Box>;
}
```

### `isRectOverlapping(rect1, rect2)`

Check if two rectangles overlap. Useful for collision detection and drag-and-drop.

**Parameters:**

- `rect1: BoundingClientRect` - The first rectangle
- `rect2: BoundingClientRect` - The second rectangle

**Returns:** `boolean` - True if rectangles overlap

**Example:**

```tsx
import { useBoundingClientRect, isRectOverlapping } from '@ink-tools/ink-mouse';

function DragDropZone() {
 const dragRect = useBoundingClientRect(dragRef);
 const dropRect = useBoundingClientRect(dropRef);

 const canDrop = dragRect && dropRect && isRectOverlapping(dragRect, dropRect);

 return <Box>{canDrop ? 'Drop here!' : 'Drag over target'}</Box>;
}
```

### `isPointInRect(x, y, rect)`

Check if a point is inside a rectangle. Useful for hit testing.

**Parameters:**

- `x: number` - The x coordinate of the point
- `y: number` - The y coordinate of the point
- `rect: BoundingClientRect` - The bounding rectangle

**Returns:** `boolean` - True if point is inside rectangle

**Example:**

```tsx
import { isPointInRect } from '@ink-tools/ink-mouse';

const rect = { left: 10, top: 10, right: 20, bottom: 20, width: 10, height: 10, x: 10, y: 10 };
isPointInRect(15, 15, rect); // true
isPointInRect(5, 5, rect);   // false
```

## Event Object

All event handlers receive an `InkMouseEvent` object:

```typescript
interface InkMouseEvent {
 x: number;              // X coordinate (terminal column)
 y: number;              // Y coordinate (terminal row)
 button: string;          // Button pressed ('left', 'middle', 'right', 'wheel-up', 'wheel-down', etc.)
 action: string;          // Action type ('press', 'release', 'click', 'wheel', 'move', 'drag')
 shift: boolean;         // Shift key modifier
 alt: boolean;           // Alt key modifier
 ctrl: boolean;          // Ctrl key modifier
 raw: number;            // Raw event code
 data: string;           // Raw event data
 protocol: string;       // Mouse protocol ('SGR' or 'ESC')
}
```

## Terminal Requirements

Mouse events require terminal support. Most modern terminals support mouse events:

- **macOS**: Terminal.app, iTerm2, Warp
- **Linux**: GNOME Terminal, Konsole, Alacritty, kitty
- **Windows**: Windows Terminal, PowerShell 7+, ConEmu

To check if your terminal supports mouse events:

```tsx
import { useMouse } from '@ink-tools/ink-mouse';

function CheckSupport() {
 const { isSupported } = useMouse();

 return <Text>Mouse support: {isSupported ? 'Yes' : 'No'}</Text>;
}
```

## Advanced Usage

### Manual Enable/Disable

```tsx
function App() {
 const mouse = useMouse();

 React.useEffect(() => {
  // Enable mouse tracking only when needed
  mouse.enable();

  return () => {
   mouse.disable();
  };
 }, [mouse]);

 return <Component />;
}
```

### Element Hit Testing

The package uses [`getBoundingClientRect`](#getboundingclientrectnode) to
calculate element positions. Element bounds are cached for `cacheInvalidationMs`
milliseconds (default: 16ms) to optimize performance. This ensures accurate
hit detection while minimizing CPU usage during rapid mouse events.

The cache automatically invalidates after the specified time, ensuring accurate
hit detection even when elements:

- Change position (e.g., scrolling lists)
- Change size (e.g., dynamic content)
- Are added/removed from the DOM

For applications with very dynamic layouts, you can reduce `cacheInvalidationMs`
or set it to `0` to disable caching.

### Multiple Event Handlers

You can combine multiple hooks on the same element:

```tsx
function MultiHandler() {
 const ref = React.useRef(null);

 useOnClick(ref, () => console.log('Clicked!'));
 useOnMouseEnter(ref, () => console.log('Entered!'));
 useOnMouseLeave(ref, () => console.log('Exited!'));
 useOnPress(ref, () => console.log('Pressed!'));
 useOnRelease(ref, () => console.log('Released!'));
 useOnMouseMove(ref, (e) => console.log(`Moved to ${e.x}, ${e.y}`));

 return <Box ref={ref}>Multi-handler element</Box>;
}
```

For a complete draggable component with press/release/drag tracking:

```tsx
function DraggableButton() {
 const ref = React.useRef(null);
 const [isDragging, setIsDragging] = React.useState(false);
 const [position, setPosition] = React.useState({ x: 0, y: 0 });

 useOnPress(ref, () => setIsDragging(true));
 useOnRelease(ref, () => setIsDragging(false));
 useOnDrag(ref, (event) => {
  if (isDragging) {
   setPosition({ x: event.x, y: event.y });
  }
 });

 return (
  <Box ref={ref}>
   <Text>
    Position: {position.x}, {position.y} {isDragging ? '(dragging)' : ''}
   </Text>
  </Box>
 );
}
```

## Testing

This package has comprehensive test coverage to ensure reliability and prevent regressions.

### Running Tests

```bash
# Run all tests in the monorepo
pnpm test

# Run tests with coverage report
pnpm run test:coverage

# Generate LCOV coverage reports for CI/CD
pnpm run test:coverage:lcov

# Run tests from the ink-mouse package directory
cd packages/ink-mouse
pnpm test
```

### Test Coverage

- **95.26%** line coverage
- **97.44%** function coverage
- **148 tests** across 8 test files

The test suite covers:

- Geometry utilities (point/rectangle calculations)
- Element position and dimension extraction
- React hooks lifecycle and behavior
- Mouse event handler registration and cleanup
- Integration scenarios for complete workflows

### Writing Tests

The package provides testing utilities for mocking Ink's internal structures:

#### Mock Helpers

```typescript
import {
  createMockYogaNode,
  createMockDOMElement,
  createMockDOMElementChain,
} from '@ink-tools/ink-mouse/test/mocks/ink-element';

// Create a mock Yoga node with computed layout
const yogaNode = createMockYogaNode({
  left: 10,
  top: 20,
  width: 100,
  height: 50,
});

// Create a mock DOMElement
const element = createMockDOMElement({
  left: 10,
  top: 20,
  width: 100,
  height: 50,
  parentNode: null,
});

// Create element with parent chain for position accumulation
const childElement = createMockDOMElementChain([
  { left: 5, top: 10, width: 50, height: 30 },   // child
  { left: 15, top: 20, width: 100, height: 50 },  // parent
  { left: 25, top: 30, width: 150, height: 70 },  // grandparent
]);
```

#### Example Test

```typescript
import { render } from 'ink-testing-library';
import { describe, expect, test } from 'vitest';
import React from 'react';
import { Box, Text } from 'ink';
import { MouseProvider, useOnClick } from '@ink-tools/ink-mouse';

describe('useOnClick', () => {
  test('registers click handler', () => {
    function TestComponent() {
      const ref = React.useRef(null);
      useOnClick(ref, () => {});

      return (
        <Box>
          <Text>Clickable</Text>
        </Box>
      );
    }

    const { lastFrame } = render(
      <MouseProvider>
        <TestComponent />
      </MouseProvider>
    );

    expect(lastFrame()).toBe('Clickable');
  });
});
```

### Testing Guidelines

1. **Use `.tsx` extension for test files with JSX** - Test files that use JSX must use the `.tsx` extension
2. **Wrap all text in `<Text>` components** - Ink requires all text to be wrapped in `<Text>` components
3. **Create template literals in variables** - Don't use template literals directly in JSX expressions
4. **Test realistic scenarios** - Focus on component composition and lifecycle rather than implementation details
5. **Account for terminal 1-indexing** - Terminal coordinates start at (1, 1), not (0, 0)

For detailed testing documentation and best practices, see:

- [Testing Guide](./TEST-GUIDE.md) - Comprehensive testing documentation
- [Integration Tests for Ink Mouse Event Workflows](../../docs/solutions/testing/integration-tests-ink-mouse-event-workflows.md)
- [Testing Ink Components with React Hooks](../../docs/solutions/testing-ink-components-with-hooks.md)

## License

MIT

## Related Packages

- [xterm-mouse](https://github.com/neiromaster/ink-tools/tree/main/packages/xterm-mouse) - Low-level xterm mouse protocol handler
