# SpentX – File Map (paths verified with ls on 2026-10-22)

ROOT = `/Users/karthi/Documents/SpentX Web/spentx-web copy 3`
APP  = `/Users/karthi/Documents/SpentX Web/spentx-web copy 3/Mobile app/SpentX`
KT   = `APP/android/app/src/main/kotlin/com/spentx/app/spentx`

## Top level
| What | Path |
|---|---|
| Root (Next.js web app + admin panel) | `/Users/karthi/Documents/SpentX Web/spentx-web copy 3` |
| Admin panel pages | `ROOT/src/app/admin`, API `ROOT/src/app/api/admin`, components `ROOT/src/components/admin` |
| Web source | `ROOT/src` |
| Flutter app | `APP` |
| Master plan (source) | `/Users/karthi/SpentX-detection-change-plan.md` (copy in this folder) |
| Supabase migrations | `ROOT/supabase/migrations` |
| Migration checks | `ROOT/supabase/migration-checks` |
| Backup scripts | `ROOT/supabase/backup` (`backup.sh`, `restore_staging.sh`, `verify.sql`, `RESTORE.md`) |
| Backups (outside repo) | `/Users/karthi/spentx-backups` |
| Dart tests | `APP/test` (fixtures in `APP/test/fixtures/pre_phase0`) |
| Kotlin unit tests | `APP/android/app/src/test/kotlin/com/spentx/app/spentx` |
| Kotlin debug-only | `APP/android/app/src/debug/kotlin/com/spentx/app/spentx/QueueSelfTestReceiver.kt` |
| Android manifest | `APP/android/app/src/main/AndroidManifest.xml` |
| Gradle app config | `APP/android/app/build.gradle.kts` |

## lib/ key folders (APP/lib)
`core/audit`, `core/finance`, `core/sync`, `core/services`, `core/theme`, `data/local`, `models`, `features/sms`, `features/sms_parser`, `features/accounts`, `features/transactions`, `features/settings`, `features/security`.

## Key classes → files
| Area | Class / function | Path |
|---|---|---|
| Encrypted Hive | `SecureHive` | `APP/lib/data/local/hive_service.dart` |
| Hive key | `HiveKeyManager` | `APP/lib/data/local/hive_key_manager.dart` |
| Safe migration | `SafeBoxMigration` | `APP/lib/data/local/safe_box_migration.dart` |
| Session storage | `SecureSessionStorage` | `APP/lib/core/services/secure_session_storage.dart` |
| Secure storage options | – | `APP/lib/core/services/secure_storage_options.dart` |
| Auth | `AuthService` | `APP/lib/core/services/auth_service.dart` |
| PIN | `PinService` | `APP/lib/core/services/pin_service.dart` |
| Key recovery UI | – | `APP/lib/features/security/presentation/key_recovery_screen.dart` |
| Set-aside data UI | – | `APP/lib/features/settings/presentation/screens/set_aside_data_screen.dart` |
| Writer lock (Dart) | `HiveWriterLock` | `APP/lib/core/sync/hive_writer_lock.dart` |
| Writer lock (Kotlin) | `HiveWriterLock` | `KT/HiveWriterLock.kt` |
| Native queues | `SecureQueueStore`, `QueueStoreCore`, `DurableQueue`, `RetryQueue`, `SmsPendingQueue`, `TransactionPendingQueue`, `QueueChannel` | `KT/SecureQueueStore.kt`, `KT/QueueStoreCore.kt`, `KT/DurableQueue.kt`, `KT/RetryQueue.kt`, `KT/SmsPendingQueue.kt`, `KT/TransactionPendingQueue.kt`, `KT/QueueChannel.kt` |
| SMS receiver | `SmsReceiver` | `KT/SmsReceiver.kt` |
| Notification listener | `NotificationListenerService` | `KT/NotificationListenerService.kt` |
| Worker | `SpentXBackgroundWorker`, `SmsWorkScheduler` | `KT/SpentXBackgroundWorker.kt`, `KT/SmsWorkScheduler.kt` |
| Boot | `BootReceiver` | `KT/BootReceiver.kt` |
| Native prefs | `SpentXDetectionPrefs` | `KT/SpentXDetectionPrefs.kt` |
| Main activity / channels | `MainActivity` | `KT/MainActivity.kt` |
| Dart queue client | `NativeQueueClient` | `APP/lib/features/sms/background/native_queue_client.dart` |
| Background processor | `BackgroundSmsProcessor` | `APP/lib/features/sms/background/background_sms_processor.dart` |
| Background sync | – | `APP/lib/core/sync/background_data_sync.dart` |
| Native settings sync | `AutoDetectionNativeSync` | `APP/lib/core/services/auto_detection_native_sync.dart` |
| Parser | `BankSmsV4Parser` | `APP/lib/features/sms/v4/bank_sms_v4_parser.dart` |
| Rule engine | `SmsRuleEngine`, `SmsTemplateEngine` | `APP/lib/features/sms/rules/engine/sms_rule_engine.dart`, `APP/lib/features/sms/rules/engine/sms_template_engine.dart` |
| Status / transfer | `StatusClassifier`, `TransferClassifier` | `APP/lib/features/sms_parser/status_classifier.dart`, `APP/lib/features/sms_parser/transfer_classifier.dart` |
| Notification parsing | – | `APP/lib/features/sms_parser/notification_parse_rules.dart` |
| Parse confidence | – | `APP/lib/features/sms_parser/sms_parse_confidence.dart` |
| Bank keywords / balance | – | `APP/lib/core/utils/bank_keywords.dart` |
| Admin SMS rule sync | `SmsRulesRefreshService` | `APP/lib/core/sync/sms_rules_refresh_service.dart` |
| Global merchant rule sync | `GlobalMerchantRulesSync` | `APP/lib/core/sync/global_merchant_rules_sync.dart` |
| Merchant categoriser | `MerchantCategoryEngine`, `MerchantCategorySuggester` | `APP/lib/features/sms/autosave/merchant_category_engine.dart`, `APP/lib/features/sms/autosave/merchant_category_suggester.dart` |
| Learning | `MerchantLearningService`, edit learning | `APP/lib/features/sms/v4/merchant_learning_service.dart`, `APP/lib/features/sms/v4/edit_learning.dart` |
| Own UPI | `SelfUpiService` | `APP/lib/features/sms/self_upi/self_upi_service.dart` |
| Totals rule | `Countable` | `APP/lib/core/finance/countable.dart` |
| Server dedupe key | `TxRefKey` | `APP/lib/core/finance/tx_ref_key.dart` |
| Source evidence | `SourceEvidenceStore` | `APP/lib/features/sms/evidence/source_evidence_store.dart` |
| Dedupe | `SmsDedupeRegistry`, `SmsDedupeKey` | `APP/lib/features/sms/autosave/sms_dedupe_registry.dart` |
| Audit | `AuditLog` | `APP/lib/core/audit/audit_log.dart` |
| Account matcher | `AccountResolver`, `StrictAccountMatcher` | `APP/lib/features/sms/autosave/account_resolver.dart`, `APP/lib/features/sms/autosave/strict_account_matcher.dart` |
| Account auto-create / link | `AccountAutoCreate`, account number link | `APP/lib/features/accounts/data/account_auto_create.dart`, `APP/lib/features/accounts/data/account_number_link.dart` |
| Bank balance check | `BankBalanceCheck`, `BankBalanceStore` | `APP/lib/features/accounts/data/bank_balance_check.dart` |
| Auto-save | `SmsAutoSaveGate`, `SmsAutoSaveUndo`, policy | `APP/lib/features/sms/autosave/sms_auto_save_gate.dart`, `APP/lib/features/sms/autosave/sms_auto_save_undo.dart`, `APP/lib/features/sms/autosave/sms_auto_save_policy.dart` |
| Session user id (plain prefs, S5 item) | `SmsSessionUser` | `APP/lib/features/sms/autosave/sms_session_user.dart` |
| Detection pipeline | `SmsDetectionPipeline`, `AutoRuleEngine`, `DetectionQueueNotifier` | `APP/lib/features/sms/detected/sms_detection_pipeline.dart`, `APP/lib/features/sms/detected/auto_rule_engine.dart`, `APP/lib/features/sms/detected/detection_queue.dart` |
| History import | `SmsHistoryImport` | `APP/lib/features/sms/detected/sms_history_import.dart` |
| SMS notifications (Phase 5) | – | `APP/lib/features/sms/sms_notification.dart` |
| SMS debug log (Phase 6 item) | `SmsDetectionDebugLog` | `APP/lib/features/sms/detected/sms_detection_debug_log.dart` |
| Sync | `SyncService`, `SyncQueue`, schema map | `APP/lib/core/sync/sync_service.dart`, `APP/lib/core/sync/sync_queue.dart`, `APP/lib/core/sync/supabase_schema_map.dart` |
| Ledger provider | `TransactionNotifier` | `APP/lib/features/transactions/data/transaction_provider.dart` |
| Models | Transaction / Account | `APP/lib/models/transaction.dart`, `APP/lib/models/account_model.dart` |
| Detection & Permissions UI | – | `APP/lib/features/settings/presentation/screens/detection_permissions_screen.dart` |
| History import UI | – | `APP/lib/features/settings/presentation/screens/history_import_screen.dart` |
| Pending SMS UI | – | `APP/lib/features/settings/presentation/screens/pending_sms_screen.dart` |
| Link / Unlink account UI | – | `APP/lib/features/transactions/presentation/widgets/link_account_sheet.dart` |
| Balance warning UI | – | `APP/lib/features/accounts/presentation/widgets/bank_balance_warning.dart` |
| Soft UI tokens | – | `APP/lib/core/theme/soft_palette.dart`, `APP/lib/core/theme/spentx_tokens.dart` |
| Bundled merchant rules | – | `APP/assets/rules/merchant_rules.json` |

## Git repositories (checked 2026-10-22)
| Repo | Path | Branch | Latest commit | Remote | Uncommitted |
|---|---|---|---|---|---|
| Mobile | `APP` | main | `9a8e413` Phase 4 gaps (2026-10-22 10:10 IST); 17 commits since baseline `d96669b` | none | clean (only ignored `build/`) |
| Root (web) | `ROOT` | main | `f0dae45` S5b live migration status audit (2026-10-21 14:19 IST) | origin github.com/Karthicoc7075/spentx | 8 modified web files (`src/components/dashboard/DashboardPage.tsx`, `src/components/shared/AddTransactionSlideOver.tsx`, `src/components/transactions/TransactionsPage.tsx`, `src/components/wealth/NewSavingsGoalModal.tsx`, `src/components/wealth/QuickDepositModal.tsx`, `src/lib/invalidate-financial-data.ts`, `src/lib/investments.ts`, `src/lib/mock-data.ts`) + modified `supabase/migration-checks/STATUS-2026-10-21.md`; untracked: the 11 Phase 0–4 SQL migrations / check folders, P0 guide, snapshots, and this handoff folder |

The web-file modifications predate this work and are not from the mobile phases; don't commit them without asking the user. The mobile repo is git-ignored by the root repo.
