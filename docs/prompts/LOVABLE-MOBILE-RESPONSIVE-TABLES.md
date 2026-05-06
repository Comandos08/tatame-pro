# LOVABLE PROMPT — Mobile-Responsive Table Variants

> **Type:** UX enhancement — responsive layouts
> **Priority:** P1 (mobile UX score 4/10 — blocks PRD perception)
> **Scope:** Three list pages + one shared component

---

## 1. OBJECTIVE

Below the `md` (768px) breakpoint, render the three highest-traffic list
pages as a stacked card layout instead of a horizontally-scrolling table.
The desktop table remains unchanged at `md` and up.

---

## 2. SYSTEM CONTEXT

- UI library: shadcn/ui + Tailwind v4.
- Existing `Table`, `TableHeader`, `TableRow`, `TableCell` from
  `src/components/ui/table.tsx`.
- All three pages already implement filters and pagination — those are
  preserved.

Pages in scope:
- `src/pages/AthletesList.tsx`
- `src/pages/MembershipList.tsx`
- `src/pages/EventsList.tsx`

---

## 3. CURRENT STATE

The tables overflow horizontally on phones, forcing users to swipe
sideways inside the page. Filter chips wrap but the table itself becomes
unreadable below ~600 px.

---

## 4. EXPECTED BEHAVIOR

Create a shared component `src/components/ui/responsive-table.tsx`:

```tsx
type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  primary?: boolean;       // shown as the card title on mobile
  secondary?: boolean;     // shown as the card subtitle on mobile
  hideOnMobile?: boolean;  // omitted from the card view
};

export function ResponsiveTable<T>({
  rows,
  columns,
  onRowClick,
  emptyState,
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
}) { ... }
```

Behavior:
- `md:` and up → renders the existing `<Table>` markup.
- Below `md:` → renders a `<div class="space-y-2">` of `<Card>` items.
  Each card shows the `primary` column as title, `secondary` as subtitle,
  and the remaining non-`hideOnMobile` columns as a 2-column grid.
- Tap on the card mirrors row click (preserves keyboard a11y too).

Then refactor each of the three pages to consume `ResponsiveTable`.

---

## 5. FILES LIKELY AFFECTED

NEW:
```
src/components/ui/responsive-table.tsx
src/components/ui/responsive-table.test.tsx
```

MODIFIED:
```
src/pages/AthletesList.tsx
src/pages/MembershipList.tsx
src/pages/EventsList.tsx
```

NO changes to:
- `src/components/ui/table.tsx` (kept intact for non-list usage)
- Any backend or hooks
- i18n files

---

## 6. CONSTRAINTS

- Preserve all existing filters, sorting, pagination, and selection
  behavior of the three pages.
- No new runtime dependencies.
- Use existing `useIsMobile` hook (`src/hooks/use-mobile.tsx`) only as
  a fallback — primary detection must be CSS (`md:` breakpoint) so SSR
  / first paint is correct.
- Maintain accessibility: card variant must have `role="button"`,
  `tabIndex={0}`, Enter/Space activation when `onRowClick` is provided.
- Skeleton/loading states already used by each page must continue to work.
- Do not change route paths, query keys, or React Query hooks.

---

## 7. ACCEPTANCE CRITERIA

1. Open `/{tenant}/app/athletes` on a 375px viewport → cards render,
   no horizontal scroll.
2. Same page on a 1280px viewport → identical to today.
3. Existing filter (grading level, search) still works on mobile.
4. Tapping a card opens the same detail page as today.
5. Pagination controls remain visible at the bottom.
6. Repeat for `/{tenant}/app/memberships` and
   `/{tenant}/app/events`.
7. Existing E2E `e2e/membership-flow.spec.ts` still passes
   (Chromium + mobile project).
8. New unit test `responsive-table.test.tsx` validates that `hideOnMobile`
   is respected and `onRowClick` is wired to keyboard events.

---

## 8. RISK ANALYSIS

| Risk | Mitigation |
|---|---|
| Regression on desktop after refactor | Keep the `<Table>` branch behind `md:` — it is byte-for-byte the same as today. |
| Sort indicators lost on mobile | Provide a small `<Select>` above the cards to choose sort field on mobile. |
| Performance on long lists | Cards use the same paginated data — no extra fetches. |

---

## 9. OUT OF SCOPE

- Full virtualization (deferred — separate prompt if needed).
- Mobile-specific filter sheet (current top-of-page filters still apply).
