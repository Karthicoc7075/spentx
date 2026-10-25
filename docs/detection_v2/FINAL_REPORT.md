# SpentX Detection v2: Final Report (Oct 25, 2026)

Branch `feature/smart-detection-flow-v2` in both repos. Nothing was merged to main. Phase-by-phase details are in AUDIT.md §1–§20.

## Flow
1. An SMS or app notification is parsed, then matched to an account.
2. An unknown account gets the card "New <Bank> account ••1234 found" with two choices:
   - **Not Mine:** hidden, can be restored.
   - **Add:** Savings, Current, Credit card or Wallet.
3. The same payment from SMS and from a notification is merged into one (cross-source dedupe).
4. The merchant comes from your own rule first, then the admin list:
   - auto-add ON: "Added ₹X Merchant"
   - auto-add OFF: "Detected ₹X on Merchant · Verify"
   - unknown merchant: Verify, then the rule is saved.
5. The transaction is saved once in encrypted Hive, then synced to the cloud.
6. The Added notification has Undo and Edit. Pending and failed payments are silent, show an amber or red badge, and are not counted.

## Commits
**App (spentx-app), pushed:**
- `1fe0aee`, `790794b`, `6a27696`: P5, accounts
- `b011468`, `c68d11f`, `290e057`: P6, save, refund link, notifications
- `5fad2a3`, `6698a85`, `df4b9e5`, `0b2e143`, `0be74ad`: P7
- `0b77b09`: final bug-check fixes

**Outer (spentx):**
- `de554d3`: P5 migration
- `ceda50e`, `241ad31`, `e7cbded`: P7
- plus this docs commit

## Tests
- flutter test: 1178 total, 1178 pass, 0 fail.
- flutter analyze: 21 info-level issues, all pre-existing. No warnings or errors.
- Web: `npm test` and tsc both pass.
- Parser check against the Python reference: 202 of 272 agree.

## Final bug check fixes (`0b77b09`)
- Editing an account no longer turns a credit card or wallet into "Bank".
- An ICICI "credited with Rs.2000.00" SMS no longer gives the payee "With Rs.2000.00".

## Emulator (emulator-5554)
- 11 SMS were injected. None of their raw text appears in logcat. FLAG_SECURE is on, so screenshots come out black and the UI was checked from text dumps instead.
- Launch, Log in and Create account screens work.
- Sign-in needs a phone OTP, so the in-app scenarios were not tested on the emulator.
- Files are in `../emulator_shots/` (relative to the repo root):
  - `p5/01_launch.png`, `p5/02_home.png`
  - `p7/01_after_sms.png`, `p7/01_after_sms_ui.txt`
  - `final/01_launch_ui.txt`, `final/02_login_ui.txt`, `final/03_back_ui.txt`, `final/04_signup_ui.txt`

## SQL to run manually, in this order (none of it has been run)
1. `supabase/migrations/20261025120000_p3_block_rules_notifications.sql` (skip if already run)
2. `supabase/migrations/20261025150000_p5_account_bank_subtype.sql`
3. `supabase/migrations/20261025170000_p7_sms_template_requests.sql`

## Removed code (`0b2e143`, 13 unreferenced files)
- detection_parser
- background_sms_coordinator
- sms_notification_handler
- sms_parser_service
- sms_verification_service
- sms_detection_debug_service
- sms_lab_block_rule_sheet
- sms_activity_screen (SmsTransactionsScreen; `/sms-activity` already routed to DetectedSmsScreen)
- sms_confirmation_sheet
- paste_message_screen
- sms_rule_list_screen
- smart/sms_list_screen
- v4/merchant_transaction_orchestrator

## Remaining risks
1. A refund with no reference links only when there is exactly one same-merchant match.
2. The masker's name detection is a heuristic.
3. Template requests start sending once SQL 3 is run. Before that they fail harmlessly and retry.
4. 70 parser differences from the Python reference remain. Most are extra ATM/fee merchants or last-4 differences.
5. The in-app scenarios were not tested on the emulator because sign-in needs a phone OTP.
6. The app notification rules (GPay, PhonePe, Paytm, CRED, PayZapp) have not been checked against real notifications.
7. A debug cold start on the emulator takes about 90s and can show an ANR if you tap during the splash. A release build should be checked on the phone.

## Real phone steps
1. Run the SQL above in order.
2. Install a release build from the branch, sign in, and grant SMS and notification access.
3. Check these cases:
   - **Known merchant:** a UPI debit shows "Added ₹X Merchant". Undo and Edit both work.
   - **Unknown merchant:** shows "Detected ₹X on Merchant · Verify". After you verify, the rule is saved.
   - **Pending:** no notification, an amber badge, and the amount is not counted. It flips to success, or to red Failed.
   - **Refund:** links to the original purchase.
   - **New account:** "New <Bank> account ••1234 found". Test both Not Mine and Add.
   - **Same payment as SMS and app notification:** only one transaction.
   - **OTP and promo SMS:** ignored.
   - **Unreadable bank SMS:** shows an "Unparsed · tap to tag" card, and a masked row appears in Admin, Template Requests.
4. Edit a credit card account and confirm its type stays.
