# Google Play Data Safety Declaration — SpentX

This document provides the exact questionnaire responses for completing the Google Play Console **Data Safety** form for the SpentX application. All answers reflect verified application behavior and production code.

---

## 1. Overview Questions

| Question | Answer | Rationale |
|---|---|---|
| **Does your app collect or share any of the required user data types?** | **Yes** | SpentX collects financial data and account information to provide money management functionality. |
| **Is all user data collected by your app encrypted in transit?** | **Yes** | All data transmitted off the device uses HTTPS / TLS 1.3 to private Supabase infrastructure. |
| **Do you provide a way for users to request that their data be deleted?** | **Yes** | Users can delete account and all data in-app (Settings → Account Actions → Delete Account) and via a public deletion portal (`https://spentx.app/delete-account`). |
| **Does your app target children under 13?** | **No** | General audience (18+ personal finance). |

---

## 2. Data Types Declaration

### A. Financial Info

#### 1. User payment info (Bank accounts, cards, UPI IDs)
- **Collected?** Yes
- **Shared?** No (never shared with third parties)
- **Processed ephemerally?** No (stored to track ongoing balances)
- **Required or Optional?** Required for money management
- **Purposes:**
  - App functionality
  - Account management
- **Encryption:** Encrypted in transit (HTTPS) and at rest (Android Keystore AES-GCM; Supabase Postgres storage).
- **Deletion:** Deletion requestable by user.

#### 2. Purchase history (Transactions, expenses, incomes, transfers)
- **Collected?** Yes
- **Shared?** No
- **Processed ephemerally?** No (stored in user ledger)
- **Required or Optional?** Required for financial tracking
- **Purposes:**
  - App functionality
  - Analytics (user's personal monthly cashflow charts)
- **Encryption:** Encrypted in transit and at rest.
- **Deletion:** Deletion requestable by user.

---

### B. Personal Info

#### 1. Email address
- **Collected?** Yes
- **Shared?** No
- **Processed ephemerally?** No
- **Required or Optional?** Required (for account authentication and password reset)
- **Purposes:**
  - App functionality
  - Account management
- **Encryption:** Encrypted in transit and at rest.
- **Deletion:** Deletion requestable by user.

#### 2. User IDs (User identifier / account ID)
- **Collected?** Yes
- **Shared?** No
- **Processed ephemerally?** No
- **Required or Optional?** Required
- **Purposes:**
  - App functionality
  - Account management
- **Encryption:** Encrypted in transit and at rest.
- **Deletion:** Deletion requestable by user.

---

### C. Messages

#### 1. SMS or MMS
- **Collected?** Yes
- **Shared?** No
- **Processed ephemerally?** Yes (for raw text) / No (for derived financial entries)
  - **Details:** Incoming bank SMS messages are parsed **100% on-device** to extract financial transactions.
  - Non-financial messages and OTPs are discarded immediately.
  - Raw SMS text is **never** uploaded to servers.
  - Ephemeral review text is stored locally in encrypted storage for a maximum of 30 days, then purged automatically.
  - Completed transactions retain only structured metadata (amount, merchant, date, masked account) and a one-way cryptographic SHA-256 hash for deduplication.
- **Required or Optional?** Optional (the user can use manual transaction entry without granting SMS access)
- **Purposes:**
  - App functionality (automated transaction detection for money management)
- **Encryption:** Encrypted at rest (Android Keystore AES); never uploaded to network.
- **Deletion:** Deletion requestable by user.

---

### D. Contacts

#### 1. Contacts
- **Collected?** No (accessed on-device only)
  - **Details:** Optional permission `READ_CONTACTS` is used strictly on-device to match UPI payee phone numbers/handles to friendly contact names (e.g. Friends/Family). Contact data is **never transmitted off the device** and never collected by our servers. Per Google Play Data Safety guidelines, data accessed solely on-device that never leaves the device does not constitute "Collection."

---

### E. App Activity / Diagnostics

#### 1. Crash logs & Diagnostics
- **Collected?** No (in release builds, debug logs are disabled, and diagnostic logs auto-clear locally after 7 days; no automatic third-party crash reporting SDK is bundled).
- **Shared?** No.

---

## 3. Security Practices Summary for Google Play Store Listing

1. **Data is encrypted in transit:** Data is transferred over a secure connection (HTTPS / TLS 1.3).
2. **Data is encrypted at rest:** Sensitive credentials, database keys, and local SQLite/Hive stores are encrypted using keys in the Android Keystore.
3. **Users can request that data be deleted:** You can delete your account and associated personal and financial data directly in the app or via the web deletion URL.
4. **Independent Security Review:** Not currently certified by a third-party MASA assessor, but adheres to standard mobile security hardening practices.
