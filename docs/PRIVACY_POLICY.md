# SpentX Public Privacy Policy

**Last Updated:** October 30, 2026  
**Effective Date:** October 30, 2026

SpentX ("we", "our", or "us") provides a personal finance management application designed to give you clarity and control over your spending, accounts, budgets, and savings goals. We are committed to safeguarding your privacy and ensuring transparency regarding how your data is accessed, processed, synchronized, and deleted.

---

## 1. Summary of Core Privacy Principles

- **On-Device SMS Processing:** Transactional bank and payment SMS are parsed locally on your device. Your real SMS is **never** uploaded automatically or shared with any third party. Only a masked copy with fake values (a "template request", which you can turn off) is sent to help us support new SMS formats, and a full SMS is sent only if you tap "Send this SMS to SpentX support".
- **Zero Raw SMS on Completed Transactions:** Once a transaction is parsed or confirmed, only structured financial fields (amount, date, merchant, category, masked account/reference) and a one-way cryptographic SHA-256 fingerprint (for deduplication) are retained. Raw SMS text is permanently stripped.
- **Immediate Discard of OTPs and Personal SMS:** One-time passwords (OTPs), authentication codes, and non-financial personal conversations are detected and discarded immediately. They are never stored, logged, or synced.
- **Encrypted Local Storage:** Local databases on your device are encrypted using industry-standard AES encryption with hardware-backed encryption keys held in the Android Keystore.
- **Encrypted in Transit:** All network communications between the app and our cloud services utilize TLS 1.3 / HTTPS encryption.
- **No Third-Party Advertising or Selling of Data:** We do not sell, rent, or monetize your personal or financial data. We do not use third-party advertising SDKs or tracking trackers.
- **User Control and Deletion:** You have the absolute right to export or permanently delete your account and all associated financial records at any time directly in the app or via our public web portal.

---

## 2. Information We Collect and Process

### A. Account Information
When you create an account or sign in to SpentX, we collect:
- Your email address (used for authentication, password recovery, and essential service notices).
- Internal unique account identifier (`user_id`).
- Profile preferences (display name, currency preferences, selected theme).

### B. Financial Ledger Data
To provide money management features, SpentX maintains your financial ledger:
- Financial transactions: Amount, transaction timestamp, payment direction (expense, income, transfer), merchant/payee name, category, payment mode/channel (UPI, NetBanking, Debit/Credit Card, Cash), and masked account numbers (e.g. `*1234`).
- Financial accounts: Account nickname, institution name, account type (Bank, Credit Card, Wallet, Cash), and opening balances.
- Budgets and Savings Goals: Monthly budget limits, target savings goals, milestone targets, and target completion dates.
- Outings and Shared Expenses: Split ledger records among friends or group trips that you choose to manage within the app.

### C. SMS Data (Android Device Only)
If you grant the optional SMS permission (`RECEIVE_SMS` and/or `READ_SMS`):
- **What is accessed:** The app reads incoming and existing SMS messages sent by registered financial institutions (e.g., banks, credit card issuers, and UPI payment gateways).
- **Purpose:** Solely to automatically detect financial transactions and keep your expense ledger and balances accurate without manual entry.
- **On-Device Processing:** All SMS parsing occurs locally on your phone.
- **Filtering & Dropping:** Messages identified as OTPs, 2-factor authentication codes, personal texts, or non-financial alerts are dropped instantly before any storage or processing.
- **Raw SMS Text Retention:**
  - Completed transactions: **Zero** raw text stored.
  - Ephemeral review items (unverified detections or ignored alerts): Stored locally in encrypted storage for a maximum of 30 days, after which they are automatically purged by automated retention jobs.
  - Account suggestion samples: A maximum of 3 temporary samples are kept locally for up to 14 days to resolve newly discovered accounts.
- **Cloud Synchronization:** Raw SMS text is strictly prohibited by our synchronization payload whitelist and is **never** synced to our cloud servers. The only SMS-related data that can leave your phone is described in sections F and G below.

### D. Payment App Notifications (Optional)
If you explicitly enable notification access (`NotificationListenerService`):
- Android provides notification access to apps. However, SpentX **strictly filters notifications** to only process the specific payment or banking applications you explicitly select (e.g., Google Pay, PhonePe, Paytm, or bank apps).
- Notifications from all other applications are ignored immediately and never read, processed, or logged.

### E. Contacts (Optional On-Device Matching)
If you grant contacts access (`READ_CONTACTS`), SpentX uses it solely on-device to match UPI phone numbers or handles to contact names (e.g., Family or Friends) to categorize person-to-person transfers. Your contact list is **never** uploaded to our servers or shared with any third party.

### F. SMS Template Requests (On by Default, Can Be Turned Off)
When SpentX finds a bank SMS format it does not yet recognise, it can send us a **template request** so we can add support for that format and improve detection for everyone.
- **What is sent:** A copy of the SMS where every personal value (amounts, account and card numbers, reference numbers, UPI IDs, names, balances and dates) is replaced with a fake value of the same shape. The bank name, sender ID, message wording and format are kept so we can build the template. Your real SMS is **never** sent automatically.
- **Device identifier:** A random app-generated device ID, stored on our servers only as a one-way hash, is used to apply daily sending limits. If you are signed in, the request is also linked to your account.
- **Phone only:** Requests can be sent even if you use SpentX on this phone only, without signing in.
- **No internet:** If the phone has no internet, the request waits and is sent when the connection is back.
- **Limits:** A small number of requests per device per day, with a maximum of 500 characters each. Repeated formats are counted, not stored again.
- **Turning it off:** You can turn template requests off at any time in Settings. Turning it off also clears any requests still waiting to be sent.
- **Retention:** Requests are kept until our team reviews them. Reviewed requests are deleted automatically after 30 days without new activity.

### G. Send This SMS to SpentX Support (Only When You Tap It)
If you choose **Send this SMS to SpentX support** for a message, that SMS is sent to our support team only to fix detection for it. This happens only when you tap it, follows the same daily limits, is readable only by SpentX admins, and is deleted automatically after 30 days.

---

## 3. How We Use Your Information

SpentX uses your information exclusively to provide and improve personal financial management services:
1. Calculating your current account balances, monthly spending, and savings rates.
2. Categorizing your transactions and alerting you to budget limits.
3. Automatically detecting incoming transactions from bank alerts to eliminate manual bookkeeping.
4. Improving SMS detection by adding support for new bank SMS formats from masked template requests.
5. Synchronizing your encrypted financial data across your personal devices via our authenticated cloud infrastructure.
6. Providing secure authentication and brute-force lockout protection.

---

## 4. Data Storage and Security Practices

- **Android Keystore Encryption:** Local database boxes (Hive) and cached data are protected using AES encryption with keys stored in the Android Keystore hardware security module.
- **PIN and Session Protection:** PIN protection employs salted PBKDF2-SHA256 hashing (100,000+ iterations). Failed PIN entry attempts are tracked in encrypted storage with escalating delays after 5 incorrect attempts and complete lockout after 10 attempts.
- **Screenshot Protection:** Sensitive financial screens and recent-app previews are protected using Android's `FLAG_SECURE` to prevent unauthorized screenshots or display in recent-app task switchers.
- **Cloud Security:** Backend records are hosted on Supabase Postgres with strict Row-Level Security (RLS) policies. Every query is scoped to your authenticated user ID; anonymous users and other authenticated users cannot access your data.
- **Zero Logging of Sensitive Data:** Application logs, diagnostic crash reports, and system logcat automatically redact amounts, account numbers, UPI IDs, passwords, and SMS text.

---

## 5. Data Retention and Deletion

### A. Retention Schedule
- **Financial Transactions & Accounts:** Retained in your private account until you explicitly edit or delete them, or delete your account.
- **Pending Review SMS:** Automatically deleted from your local device after 30 days.
- **Template Requests:** Kept until reviewed, then deleted automatically after 30 days without new activity.
- **Support SMS:** Deleted automatically from our servers after 30 days.
- **Diagnostic and Debug Logs:** Automatically purged after 7 days; completely disabled in release builds.

### B. Account and Data Deletion Rights
You have the right to permanently delete your account and all associated data at any time. We provide two official deletion pathways:

1. **In-App Account Deletion:**
   - Open **SpentX** → Go to **Settings** → Scroll to **Account Actions** → Tap **Delete Account**.
   - Verify your PIN or biometrics and confirm deletion.
   - All cloud data (transactions, accounts, budgets, goals, rules, and user profile) and all local encrypted data are permanently wiped immediately.

2. **Public Web Deletion Request Portal:**
   - If you have uninstalled the app or cannot access your device, visit our public deletion portal at:  
     `https://spentx.app/delete-account`
   - Signed-in users can execute immediate deletion. Unauthenticated users can submit their registered account email address to receive a verified deletion confirmation link.

### C. Scope of Deletion
Upon account deletion:
- All financial transactions, accounts, categories, budgets, recurring bills, investments, savings goals, outing splits, and personal rules are permanently erased from our Supabase database.
- Your authentication credentials and user profile are permanently deleted from Supabase Auth.
- All local encrypted databases, Keystore entries, and preferences on your device are wiped.
- No personal or financial records are retained. Only non-personally identifiable administrative audit records (stating that a user deletion took place) may be kept for up to 90 days solely to comply with legal obligations and prevent fraud.

---

## 6. Children's Privacy
SpentX is intended for general audiences aged 18 and older. We do not knowingly collect or solicit personal data from children under the age of 13 (or under 16 in certain jurisdictions). If we learn that we have collected personal data from a child, we will delete that information immediately.

---

## 7. Changes to This Privacy Policy
We may update this Privacy Policy periodically to reflect enhancements in security, changes in application features, or evolving regulatory requirements. When updates occur, we will revise the "Last Updated" date at the top of this document.

---

## 8. Contact Information
If you have any questions, concerns, or privacy requests regarding this Privacy Policy or your data, please contact us at:

- **Email:** privacy@spentx.app  
- **Website:** https://spentx.app  
- **Data Protection Officer:** compliance@spentx.app
