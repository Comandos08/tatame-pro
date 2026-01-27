# UI GOVERNANCE — TATAME PRO

## Version: 1.1.0
## Last Updated: 2026-01-27

---

## 🎯 PURPOSE

This document defines the **mandatory standards** for all UI development in TATAME PRO.
All engineers MUST follow these rules. No exceptions.

---

## 📋 TABLE OF CONTENTS

1. [Ref Safety Contract](#1-ref-safety-contract)
2. [Button & Action Standards](#2-button--action-standards)
3. [Form Semantics](#3-form-semantics)
4. [Dropdown & Menu Standards](#4-dropdown--menu-standards)
5. [Visibility Contract](#5-visibility-contract)
6. [Icon Standards](#6-icon-standards)
7. [Accessibility Requirements](#7-accessibility-requirements)
8. [Color & Token Usage](#8-color--token-usage)
9. [Component Patterns](#9-component-patterns)
10. [Anti-Patterns (DO NOT DO)](#10-anti-patterns-do-not-do)
11. [Testing Checklist](#11-testing-checklist)

---

## 1. REF SAFETY CONTRACT

### CRITICAL: ForwardRef Requirements

**Any component used with `asChild` MUST be a `forwardRef` component.**

This is a zero-tolerance policy. The warning "Function components cannot be given refs" 
indicates a violation that MUST be fixed immediately.

### ✅ DO

```tsx
// Correct: forwardRef with displayName
const MyButton = React.forwardRef<HTMLButtonElement, Props>((props, ref) => (
  <button ref={ref} {...props} />
));
MyButton.displayName = 'MyButton';

// Correct: Using with asChild
<DropdownMenuTrigger asChild>
  <MyButton>Click</MyButton>
</DropdownMenuTrigger>

// Correct: Using built-in components (Button, Link) that already forwardRef
<DialogTrigger asChild>
  <Button variant="outline">Open</Button>
</DialogTrigger>
```

### ❌ DON'T

```tsx
// BANNED: Function component without forwardRef used with asChild
const BadButton = (props) => <button {...props} />;

<DropdownMenuTrigger asChild>
  <BadButton /> // ❌ WILL CAUSE REF WARNING
</DropdownMenuTrigger>

// BANNED: forwardRef without displayName
const AnonComponent = React.forwardRef((props, ref) => <div ref={ref} />);
// ❌ Missing displayName - DevTools will show "ForwardRef"
```

### Root Cause Analysis

Ref warnings occur when:
1. A component receives a `ref` prop but doesn't forward it
2. Radix `asChild` pattern merges props including `ref` onto child
3. Child is a function component without `forwardRef`

### Valid Patterns for asChild

| Component | Safe with asChild? | Notes |
|-----------|-------------------|-------|
| `<Button>` | ✅ Yes | shadcn Button uses forwardRef |
| `<Link>` | ✅ Yes | react-router-dom Link forwards ref |
| `<a>` | ✅ Yes | Native HTML element |
| `<button>` | ✅ Yes | Native HTML element |
| Custom component | ⚠️ Only if forwardRef | Must verify implementation |

### Debugging Ref Warnings

If you see the warning, add this temporarily to find the source:

```typescript
// TEMPORARY DEBUG - REMOVE BEFORE COMMIT
const originalError = console.error;
console.error = (...args) => {
  if (args[0]?.includes?.('cannot be given refs')) {
    console.log('REF WARNING SOURCE:', new Error().stack);
  }
  originalError.apply(console, args);
};
```

---

## 2. BUTTON & ACTION STANDARDS

### ✅ DO

```tsx
// Always use semantic button elements
<button type="button" onClick={handleClick}>
  Click me
</button>

// Inside forms, be explicit about type
<button type="submit">Submit</button>
<button type="button" onClick={handleCancel}>Cancel</button>

// Use shadcn Button component
<Button type="button" variant="ghost" size="icon" aria-label="Open menu">
  <Menu className="h-4 w-4" />
</Button>

// forwardRef with displayName for all custom components
const MyButton = React.forwardRef<HTMLButtonElement, Props>((props, ref) => (
  <button ref={ref} {...props} />
));
MyButton.displayName = 'MyButton';
```

### ❌ DON'T

```tsx
// NEVER use div/span as clickable elements
<div onClick={handleClick}>Click me</div>

// NEVER omit button type (defaults to "submit" which can cause form issues)
<button onClick={handleClick}>Click me</button>

// NEVER create button-like components without forwardRef
const MyButton = (props) => <button {...props} />;
```

---

## 3. FORM SEMANTICS

### ✅ DO

```tsx
// All inputs MUST have name and autoComplete
<Input
  id="email"
  name="email"
  type="email"
  autoComplete="email"
/>

<Input
  id="password"
  name="password"
  type="password"
  autoComplete="current-password"  // or "new-password" for registration
/>

<Input
  id="name"
  name="name"
  type="text"
  autoComplete="name"
/>
```

### AutoComplete Reference

| Field Type | `name` | `autoComplete` |
|------------|--------|----------------|
| Email | `email` | `email` |
| Password (login) | `password` | `current-password` |
| Password (registration) | `password` | `new-password` |
| Password (confirm) | `confirmPassword` | `new-password` |
| Full name | `name` | `name` |
| Phone | `phone` | `tel` |
| Address | `address` | `street-address` |

---

## 4. DROPDOWN & MENU STANDARDS

### ✅ DO

```tsx
// Use DropdownMenuTrigger with asChild and a forwardRef component
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" aria-label="More options">
      <MoreVertical className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem>Action</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Technical Implementation

The `DropdownMenuContent` component wraps Radix's Portal internally:

```tsx
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}  // ref goes to Content, NOT Portal
      sideOffset={sideOffset}
      className={cn("z-50 bg-popover ...", className)}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";
```

### ❌ DON'T

```tsx
// NEVER use custom components that don't forward refs
<DropdownMenuTrigger asChild>
  <CustomButton /> // ❌ Will cause ref warning
</DropdownMenuTrigger>

// NEVER pass ref to Portal (it doesn't accept one)
<DropdownMenuPrimitive.Portal ref={ref}> // ❌ WRONG
```

---

## 5. VISIBILITY CONTRACT

### RULE: All interactive elements MUST be visible without hover

### ✅ DO

```tsx
// Actions always visible
<td className="text-right">
  <Button variant="ghost" size="icon" aria-label="Edit">
    <Pencil className="h-4 w-4" />
  </Button>
</td>
```

### ❌ DON'T

```tsx
// NEVER hide actions until hover
<tr className="group">
  <td>
    <button className="opacity-0 group-hover:opacity-100">
      Edit
    </button>
  </td>
</tr>
```

### ❌ FORBIDDEN CSS PATTERNS

```css
/* These patterns are BANNED */
.action { opacity: 0; }
.action:hover { opacity: 1; }

tr:hover .actions { visibility: visible; }

button { pointer-events: none; }
```

---

## 6. ICON STANDARDS

### ✅ DO

```tsx
// Icons use currentColor for flexibility
<Pencil className="h-4 w-4" />  // Inherits color from parent

// Icon buttons MUST have aria-label
<Button variant="ghost" size="icon" aria-label="Edit item">
  <Pencil className="h-4 w-4" />
</Button>

// Minimum hit area: 32px (or 44px on touch devices)
<Button size="icon" className="h-8 w-8">
```

### ❌ DON'T

```tsx
// NEVER force specific colors on icons
<Pencil className="h-4 w-4 text-orange-500" />  // Use tokens instead

// NEVER omit aria-label on icon-only buttons
<Button size="icon">
  <Pencil className="h-4 w-4" />
</Button>
```

---

## 7. ACCESSIBILITY REQUIREMENTS

### Mandatory Attributes

| Element | Required |
|---------|----------|
| Icon button | `aria-label` |
| Form input | `id`, `name`, `autoComplete` |
| Dialog | `aria-labelledby`, `aria-describedby` |
| Loading state | `aria-busy="true"` |

### Focus States

```tsx
// All interactive elements must have visible focus
<Button className="focus-visible:ring-2 focus-visible:ring-ring">
  Click
</Button>
```

### Keyboard Navigation

- All actions reachable via Tab
- Enter/Space activates buttons
- Escape closes dialogs/dropdowns
- Arrow keys navigate menus

---

## 8. COLOR & TOKEN USAGE

### ✅ DO — Use Semantic Tokens

```tsx
// Correct: semantic tokens
<div className="bg-background text-foreground" />
<div className="bg-primary text-primary-foreground" />
<div className="text-muted-foreground" />
<div className="border-border" />
```

### ❌ DON'T — Hardcode Colors

```tsx
// BANNED patterns
<div className="bg-white text-black" />
<div className="text-gray-500" />
<div style={{ color: '#ff7a00' }} />
<div style={{ backgroundColor: 'orange' }} />
```

### Token Reference

| Purpose | Token |
|---------|-------|
| Page background | `bg-background` |
| Primary text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Primary action | `bg-primary text-primary-foreground` |
| Destructive | `bg-destructive text-destructive-foreground` |
| Success | `text-success` or `bg-success` |
| Warning | `text-warning` or `bg-warning` |
| Borders | `border-border` |
| Cards | `bg-card text-card-foreground` |
| Popover/Dropdown | `bg-popover text-popover-foreground` |

---

## 9. COMPONENT PATTERNS

### ForwardRef Template

```tsx
import * as React from "react";

interface MyComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "outline";
}

const MyComponent = React.forwardRef<HTMLDivElement, MyComponentProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("base-classes", className)}
        {...props}
      />
    );
  }
);
MyComponent.displayName = "MyComponent";

export { MyComponent };
```

### Guard Clause Pattern

```tsx
// useEffect with proper guards
useEffect(() => {
  // Guard: exit early if conditions aren't met
  if (isLoading || !data) return;
  if (hasProcessedRef.current) return;
  
  hasProcessedRef.current = true;
  
  // Main logic here
  processData(data);
}, [isLoading, data]);
```

---

## 10. ANTI-PATTERNS (DO NOT DO)

### ❌ BANNED PATTERNS

| Pattern | Why It's Bad |
|---------|--------------|
| `<div onClick>` | Not accessible, no keyboard support |
| `opacity: 0` on buttons | Invisible = unreachable |
| Hardcoded colors | Breaks theming |
| `!important` without comment | Specificity wars |
| Logic in CSS | Hard to debug, test |
| Inline styles for layout | Unmaintainable |
| Missing `displayName` | React DevTools useless |
| `useEffect` without deps | Infinite loops |

---

## 11. TESTING CHECKLIST

### Before Every PR

- [ ] No console warnings (refs, hydration, controlled)
- [ ] All buttons have `type`
- [ ] All inputs have `name` + `autoComplete`
- [ ] Icon buttons have `aria-label`
- [ ] No hardcoded colors
- [ ] Actions visible without hover
- [ ] Focus states work
- [ ] Keyboard navigation works
- [ ] No `opacity-0` on interactive elements
- [ ] forwardRef components have displayName
- [ ] Components used with `asChild` are forwardRef

### E2E Tests to Run

```bash
# Console warning detection (CRITICAL)
bun run test:e2e e2e/ui/console-warnings.spec.ts

# Security/routing tests
bun run test:e2e e2e/security/

# UI governance tests
bun run test:e2e e2e/ui/
```

### Automated Checks

The following E2E tests enforce governance:
- `e2e/ui/console-warnings.spec.ts` - Zero ref/hydration warnings
- `e2e/ui/dropdown-ref.spec.ts` - Dropdown integrity
- `e2e/ui/actions-visibility.spec.ts` - Visibility contract
- `e2e/ui/icon-buttons.spec.ts` - Icon button standards

---

## 📚 RELATED FILES

- `src/styles/ui-actions-visibility.css` — Visibility hardening
- `src/index.css` — Design tokens
- `tailwind.config.ts` — Theme configuration
- `src/components/ui/` — Shadcn components

---

## 🚨 ENFORCEMENT

Violations of this governance will be:
1. Flagged in code review
2. Blocked from merge
3. Tracked as tech debt if shipped

**No exceptions. No "fix later". No "it works visually".**

---

*Last reviewed by: AI Security Audit*
*Document version: 1.0.0*
