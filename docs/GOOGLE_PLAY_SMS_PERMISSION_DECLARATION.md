# Google Play SMS Permission Declaration & Demo Video Guide

This document details the declaration for the **SMS and Call Log Permissions Policy** for SpentX in Google Play Console, specifically qualifying under the **Money Management Exception** (`Financial services / money management apps`).

---

## 1. Google Play Console Declaration Form Fields

### A. Permitted Use Case
- **Selected Exception Category:** `Financial / Money management`
- **Core App Functionality:** SpentX is a personal finance and expense management application. Its core functionality is providing users with real-time financial tracking, expense classification, account balance calculations, and budget management derived automatically from transactional SMS messages sent by banks, credit card providers, and payment gateways.

### B. Permissions Requested
1. `android.permission.RECEIVE_SMS`
   - **Reason:** Required to detect incoming financial transaction alerts in real time as payments occur, updating the user's ledger and available account balances without requiring tedious manual transaction entry.
2. `android.permission.READ_SMS`
   - **Reason:** Required to allow users who install the app or set up new accounts to optionally import past transactional history (past 1–12 months) from banking alerts, establishing opening balances and baseline monthly spending trends.

---

## 2. Technical Safeguards & Privacy Declarations

### A. Non-Financial SMS & OTP Handling
- **Immediate Discard:** SpentX implements deterministic heuristic filtering before any message is parsed or stored.
- **OTPs (One-Time Passwords):** Messages matching 2FA, OTP, verification code, or login patterns are dropped immediately upon reception. They are never written to any database, never cached in memory, and never logged in debug outputs.
- **Personal & Promotional SMS:** Messages from personal contacts, peer chats, or non-financial senders that lack financial transaction markers (debit, credit, account number, amount, currency) are immediately filtered out and ignored.

### B. On-Device Parsing & Network Isolation
- **100% Local Parsing:** All SMS parsing (regex, entity extraction, merchant identification, and account reconciliation) is executed purely on-device via local Dart and Kotlin engines.
- **Zero Raw SMS Upload:** The network synchronization layer enforces an explicit whitelist for Supabase uploads. Raw SMS bodies are strictly absent from the sync schema. Completed transactions store only structured metadata (amount, currency, transaction timestamp, merchant/payee, masked account) along with a one-way SHA-256 cryptographic hash used solely for deduplication.
- **Ephemeral Review Storage:** If an SMS requires manual verification (e.g., unknown account or unrecognized merchant format), the encrypted text is stored locally on the device for a maximum of 30 days before being automatically purged by background retention workers.

---

## 3. Demo Video Requirements & Script

Google Play policy requires a demo video demonstrating how the SMS permission relates directly to the app's core feature. The video must be uploaded to YouTube (set as Unlisted) and linked in the declaration form.

### Video Requirements Checklist
- [ ] Must be captured on an actual Android device or emulator with phone layout.
- [ ] Must show the in-app prominent disclosure dialog BEFORE the Android system permission prompt appears.
- [ ] Must show the Android runtime permission dialog where the user grants the permission.
- [ ] Must show an incoming bank SMS or an import of past SMS.
- [ ] Must show the newly parsed transaction landing in the SpentX ledger with the extracted amount, date, and merchant.
- [ ] Must demonstrate that personal SMS and OTPs do NOT appear in the app.
- [ ] Must demonstrate the Settings screen where the user can disable SMS detection at any time.

---

### Step-by-Step Demo Video Script (Duration: ~60–90 seconds)

1. **Scene 1: App Launch & Prominent Disclosure (0:00 – 0:15)**
   - Open SpentX.
   - Navigate to **Detection & Permissions** (or Onboarding).
   - Display the clear **Prominent Disclosure Screen** stating:
     *"SpentX accesses SMS messages from your banks and financial institutions to automatically detect expenses and track balances. SpentX never reads personal messages or OTPs, and message text never leaves this device."*
   - Tap **"Allow SMS"**.

2. **Scene 2: Android System Permission Grant (0:15 – 0:25)**
   - The Android runtime dialog appears (`Allow SpentX to send and view SMS messages?`).
   - Tap **"While using the app"** / **"Allow"**.
   - Show status updating to **"Allowed"**.

3. **Scene 3: Transaction Detection in Action (0:25 – 0:50)**
   - Send or simulate a bank SMS:
     *"Rs 450.00 spent on your HDFC Bank Card xx1234 at STARBUCKS on 22-OCT-26. Avail Bal: Rs 15,240.00"*
   - Show the SpentX notification arriving: *"₹450 spent at Starbucks (HDFC Bank)"*.
   - Tap notification or open SpentX Home screen.
   - Show the new transaction recorded in the ledger with:
     - Amount: ₹450.00
     - Merchant: Starbucks
     - Account: HDFC Bank (xx1234)
     - Category: Food & Dining

4. **Scene 4: OTP and Non-Financial Safety (0:50 – 1:05)**
   - Send or simulate a personal message or OTP SMS:
     *"Your verification OTP is 849201 for login. Do not share with anyone."*
   - Show that no transaction is created, no notification is shown, and the message is completely ignored by SpentX.

5. **Scene 5: User Control & Revocation (1:05 – 1:20)**
   - Go to **Settings** → **Detection & Permissions**.
   - Show that SMS detection can be toggled OFF by the user at any time.
   - Show the **Delete Account** option in Settings under Account Actions, demonstrating full user control.
