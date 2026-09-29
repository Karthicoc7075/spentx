---
name: spentx-web-components
description: Use whenever adding a new React component (page, modal, dialog, card, panel, etc.) or a new data hook to src/components/** or src/hooks/** in this repo — so the new file matches this project's established structure/conventions instead of inventing a new one. Triggers on requests like "add a component/modal/dialog/page/card", "create a hook for X".
---

# SpentX web component & hook patterns

Concrete, copy-from-a-real-file conventions for this repo. When asked to add a new component or hook, follow the sections below instead of improvising a structure. Cite the referenced real files if you need more context than the skeleton gives you.

---

## Web components (`src/components/**`)

**Placement:** one file per component, PascalCase filename = export name, grouped by domain folder (`dashboard/`, `outings/`, `transactions/`, `wealth/`, `plan/`, `friends/`, `settings/`, `admin/`, `growth/`, `journal/`, `auth/`, `onboarding/`, `reports/`, `analytics/`, `fintech/`). Cross-cutting/reusable pieces (cards, dialogs, shell chrome) go in `shared/`. Primitive shadcn/Radix wrappers only go in `ui/` — don't add feature logic there.

**Reference files:** `src/components/shared/KpiCard.tsx` (small display component), `src/components/outings/CreateOutingModal.tsx` (form/modal with mutation).

**Rules:**
- `"use client"` as the very first line for any component using hooks/state/interactivity. Server components are the exception, not the default, in this app (the router relies on client-side `AppShell` gating).
- Props: a `type <Name>Props = { ... }` object directly above the component function — not `interface`, not inline destructuring types.
- Import order: external libs (`react`, `lucide-react`) → `@/components/ui/*` → other `@/components/*` → `@/hooks/*` → `@/lib/*` → `@/types`.
- Use the `cn()` helper from `@/lib/utils` for every conditional/merged className — never manual template-literal class concatenation.
- Build on existing `@/components/ui/*` primitives (`Dialog`, `Button`, `Input`, `Label`, `Card`, etc.) — don't hand-roll a modal/button/input.
- For anything with a data mutation: local `submitting` boolean state, `try { await onSubmit(...) } finally { setSubmitting(false) }`, and disable the submit button on `submitting`. Components take an `onSubmit`/`onOpenChange` callback prop rather than calling `supabase-data.ts` or a hook's mutation directly — the parent page/hook owns the actual write.
- Modal/dialog components take `open`, `onOpenChange`, and (when editing is supported) an optional `initialValues` prop that switches the component into edit mode (`const isEditing = Boolean(initialValues)`), rather than being two separate components.
- Comments are rare and only for a non-obvious constraint (e.g. "membership can't be edited here — expenses reference these member ids"), never restating what the JSX below it already shows.
- Currency values render through `formatCurrency` from `@/lib/utils`; never inline `.toFixed(2)` / manual `₹` string building.

**Skeleton for a new modal-style component:**
```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SomeEntity } from "@/types";

type NewThingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: SomeEntity;
  onSubmit: (value: Omit<SomeEntity, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<unknown>;
};

export function NewThingModal({ open, onOpenChange, initialValues, onSubmit }: NewThingModalProps) {
  const isEditing = Boolean(initialValues);
  const [submitting, setSubmitting] = useState(false);
  // ...local field state seeded from initialValues...

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({ /* fields */ });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit" : "Create"} thing</DialogTitle>
          <DialogDescription>...</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
          {/* fields */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{isEditing ? "Save changes" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

## Data hooks (`src/hooks/**`)

Components read/write data through a hook, never `supabase-data.ts` directly.

**Reference file:** `src/hooks/useOutingCategories.ts`.

**Rules:**
- `"use client"` at top.
- Use `useAuthReady()` (`@/hooks/useAuthReady`) for `{ user, isConfigured, isReady }`; gate the query with `enabled: isReady || !isConfigured`.
- Query key comes from the central factory `queryKeys` in `@/lib/query-keys.ts` — add a new entry there (`someThing: (userId?: string) => ["someThing", userId] as const`) rather than inlining an array literal in the hook.
- `queryFn`/`mutationFn` call into `@/lib/supabase-data.ts` (add the fetch/save/delete function there if it doesn't exist yet) — hooks never call `supabase-js` directly.
- On mutation `onSuccess`, invalidate the relevant `queryKeys.*` entries. **If the mutation touches transactions, outings, outing_expenses, settlements, or accounts, also call `invalidateFinancialData(queryClient, user?.id)` from `@/lib/invalidate-financial-data`** — those tables aren't fully Realtime-covered and Dashboard/Wealth will show stale numbers otherwise.
- Return a plain object exposing derived values and `(args) => mutation.mutateAsync(args)` wrappers — don't leak the raw `useMutation` result to callers.
