# UI GOVERNANCE — TATAME PRO

## Version: 1.0.0
## Last Updated: 2026-01-27

---

## 🎯 PURPOSE

This document defines the **mandatory standards** for all UI development in TATAME PRO.
All engineers MUST follow these rules. No exceptions.

---

## 📋 TABLE OF CONTENTS

1. [Button & Action Standards](#1-button--action-standards)
2. [Form Semantics](#2-form-semantics)
3. [Dropdown & Menu Standards](#3-dropdown--menu-standards)
4. [Visibility Contract](#4-visibility-contract)
5. [Icon Standards](#5-icon-standards)
6. [Accessibility Requirements](#6-accessibility-requirements)
7. [Color & Token Usage](#7-color--token-usage)
8. [Component Patterns](#8-component-patterns)
9. [Anti-Patterns (DO NOT DO)](#9-anti-patterns-do-not-do)
10. [Testing Checklist](#10-testing-checklist)

---

## 1. BUTTON & ACTION STANDARDS

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

## 2. FORM SEMANTICS

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

## 3. DROPDOWN & MENU STANDARDS

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

### ❌ DON'T

```tsx
// NEVER use custom components that don't forward refs
<DropdownMenuTrigger asChild>
  <CustomButton /> // ❌ Will cause ref warning
</DropdownMenuTrigger>
```

---

## 4. VISIBILITY CONTRACT

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

## 5. ICON STANDARDS

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

## 6. ACCESSIBILITY REQUIREMENTS

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

## 7. COLOR & TOKEN USAGE

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

## 8. COMPONENT PATTERNS

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

## 9. ANTI-PATTERNS (DO NOT DO)

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

## 10. TESTING CHECKLIST

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

### E2E Tests to Run

```bash
# Security/routing tests
bun run test:e2e e2e/security/

# UI governance tests
bun run test:e2e e2e/ui/
```

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
