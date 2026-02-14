# Feature Build Report: Recurring Invoices

**Target app:** `invoices`
**Slug:** `recurring`
**Generated:** 2026-02-13T15:08:58.019Z
**Status:** ✅ Feature generated successfully

---

## Feature Summary

| Property | Value |
|---|---|
| Name | Recurring Invoices |
| Slug | recurring |
| Description | Schedule invoices to auto-generate on a recurring basis |
| Target App | invoices |
| Pages | 3 |
| Model | recurring-schedule (recurring_schedules) |
| Fields | 6 |

---

## Generated Files

- `types/recurring-schedule.ts`
- `lib/repositories/recurring-scheduleRepository.ts`
- `lib/actions/recurringActions.ts`
- `app/(dashboard)/recurring/page.tsx`
- `app/(dashboard)/recurring/client.tsx`
- `app/(dashboard)/recurring/new/page.tsx`
- `app/(dashboard)/recurring/[id]/page.tsx`
- `APPLY.md`

---

## Next Steps

1. Copy generated files from output/invoices/features/recurring/ into apps/invoices/src/
2. Follow instructions in APPLY.md
3. Run pnpm build --filter @saveaday/invoices
4. Visit /dashboard/recurring in the running app
