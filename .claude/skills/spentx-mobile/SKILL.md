---
name: spentx-mobile
description: Use whenever adding a new Flutter/Dart file (screen, widget, provider, model, or test) under "Mobile app/SpentX/lib/**" or its test/ folder in this repo — so the new file matches this project's established structure/conventions instead of inventing a new one. Triggers on requests like "add a screen/widget/provider to the mobile app", "add a Flutter feature", "write a Dart test".
---

# SpentX mobile (Flutter) patterns

Concrete, copy-from-a-real-file conventions for this repo. When asked to add a new mobile screen, widget, provider, model, or test, follow the sections below instead of improvising a structure.

**Reference folders:** `lib/features/friends/`, `lib/features/transactions/`, `lib/features/wealth/`.

**Feature folder layout** — every feature lives under `lib/features/<feature>/` with up to three subfolders:
- `domain/` — data model classes (plain Dart, or `HiveObject` + `@HiveType`/`@HiveField` only for the two entities that need on-device offline storage today: accounts and transactions — most features don't need Hive, just plain model classes with `copyWith`/`fromJson`/`toJson`).
- `data/` — services that talk to Supabase or device APIs (e.g. `sms_receiver_service.dart`).
- `presentation/` — screens (`<feature>_screen.dart`) and dialogs/sheets (`add_<x>_sheet.dart`, `edit_<x>_sheet.dart`); reusable sub-widgets for that feature go in `presentation/widgets/`.

**State management:** Riverpod. New shared/cross-screen state goes in `lib/core/providers/<feature>_provider.dart` (not inside the feature folder) — that's where `friends_provider.dart`, `outing_provider.dart`, `transaction_provider.dart`, etc. all live, alongside the domain classes they expose (see `SharedExpense`/`Friend` defined right in `friends_provider.dart`).

**Tests:** pure-Dart assertion scripts under `Mobile app/SpentX/test/*_test.dart` — **not** `flutter_test`/`package:test`. Pattern (see `test/sms_notification_copy_test.dart`):
```dart
// Pure Dart assertions (no flutter_test dependency in this project).
// Run: dart run test/<name>_test.dart
import 'package:spentx/features/<feature>/<thing>.dart';

void _assert(bool cond, String msg) {
  if (!cond) {
    throw Exception('ASSERT FAILED: $msg');
  }
}

void main() {
  print('── <Section> ──');
  final result = thingUnderTest(/* ... */);
  _assert(result == expected, 'result=$result');
  print('  <section> OK');
}
```
Run with `dart run test/<name>_test.dart` from `Mobile app/SpentX/`. If the new test should run in CI/local checks alongside the existing one, add a matching `npm run test:mobile-<name>` script in the root `package.json` (same shape as `test:mobile-sms`) and fold it into `test:all`.

**Cross-platform reminder:** this Flutter app and the web app share one Supabase backend. Before adding/renaming a field on either side, check `bugs/BUGS.md` and `docs/DATABASE_SCHEMA.md` — many open bugs there are exactly "web and mobile disagree on this field's name/shape/default."
