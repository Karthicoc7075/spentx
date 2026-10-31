# Storage and sync feature status

Updated 2026-10-31. Scope: the four-step storage naming and data-safety work.

| Feature | Status (Done/Partial/Not started) | Tested | Notes |
|---|---|---|---|
| Step 1 — Preserve unsynced data during session problems | Done | Full suite: 1,872 passed; analysis: 0 errors | Wi-Fi without internet, session drops, missing setup rows and unconfirmed revoke preserve data. Only confirmed account deletion or explicit Reset/Delete may discard unsynced data. App: `aa31f07`, `82a84c3`, `86cb5b9`, `dc8bc18`. |
| Step 2 — Phone only money upload protection | Done | Full suite: 1,872 passed; analysis: 0 errors | No money uploads; Cloud sync transition asks Upload my phone data / Start fresh / Cancel. Admin downloads, template requests and Send to support remain available. App: `0f6de75`, `ed8d973`, `59839ee`. |
| Step 3 — Storage and connectivity names | Done | Full suite: 1,872 passed; analysis: 0 errors | `storage_mode` (`phoneOnly` / `cloudSync`), `phone_only_user`, `hasNoInternet`; website `isOnline`. App: `f85233a` through `7843698`; website: `daf8ce5`, `574f61e`, `66294f0`. |
| Step 4 — Docs and remaining UI/comments | Done | Full suite: 1,872 passed; analysis: 0 errors | Current sync rule documented: keep and requeue unseen local rows; remove only confirmed server-deleted rows with edit guards. Rename local-first guide and update links. App text: `7aab0f6`; app docs/comments: `5b28cd5`; website docs: this commit. |
| Play Data safety and store listing | Not started | Not submitted | Guidance supplied in the completion report; Play Console changes are outside this repository task. |

Validation on 2026-10-31: `flutter test` passed all 1,872 tests (exit 0). `flutter analyze` reported 0 errors, 0 warnings and two existing `deprecated_member_use` infos in unchanged `test/category_catalog_test.dart:545` (exit 1 because infos are fatal by default). No runtime logic changed. Both repositories passed `git diff --check`; guide links resolve. Device/manual release testing was not run in this documentation task.
