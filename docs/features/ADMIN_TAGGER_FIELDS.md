# Admin SMS Template Tagger Specification

This document details the complete design and field taxonomy for the Admin SMS Template Trainer/Tagger in SpentX Web and Mobile.

---

## 1. Core Architecture Principles

1. **Common Parser First**: The heuristic regex parser (`V4 / SmsRuleEngine`) handles 90%+ of standard bank SMS automatically. Templates are only created for non-standard, bank-specific, or edge-case formats.
2. **One Template = One Format**: A template represents a reusable SMS pattern across users, not a single one-off SMS.
3. **Sparse Extraction**: A template only extracts the tokens that actually exist in that SMS. Missing tokens fall back safely to defaults (e.g., date defaults to the SMS receive timestamp).
4. **Zero Cross-Contamination**: Available balances and card credit limits must **never** become transaction amounts.
5. **App Decides Self-Transfer**: Tagging a transfer word does not automatically make it an internal transfer. The app's ledger only treats it as an internal transfer if **both** source and destination accounts are owned by the user.

---

## 2. Field Taxonomy & Token Badges

### A. Money & Balances
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `amount` | **Amount** | The exact money spent, received, or moved. Must never overlap balance or limit. | `150.00`, `2,499` |
| `balance` | **Balance** | Account available balance quoted in message. | `Avl Bal: Rs 14,250` |
| `cardLimit` | **Available Limit** | Available credit card limit. Never parsed as an expense. | `Avail Limit: Rs 1,50,000` |

### B. Transaction Types & Transfer Words
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `debitType` | **Debit word** | Money leaving (Expense). | `debited`, `spent`, `paid` |
| `creditType` | **Credit word** | Money entering (Income). | `credited`, `received` |
| `transferType` | **Transfer word (app confirms)** | Money movement indicator. The app confirms a self-transfer **only if both accounts belong to the user**. | `transferred to`, `sent to a/c` |
| `atmWithdraw` | **ATM word** | Cash withdrawal (Bank to Cash transfer). | `withdrawn at ATM`, `ATM w/d` |
| `billPayment` | **CC Bill payment** | Credit card bill repayment (Transfer, not spending). | `received payment towards card` |
| `refundType` | **Refund / reversal** | Returned money linked to original spend (reduces expense, not income). | `refund of`, `reversal for` |

### C. Parties & Accounts
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `title` / `merchantName` | **Title / Merchant** | Store, company, or person where money went. | `SWIGGY`, `AMAZON`, `ZOMATO` |
| `bankName` | **Bank name** | Bank or financial institution name. | `HDFC Bank`, `SBI`, `ICICI` |
| `accountLast4` | **Account last4** | User's bank account last 3–4 digits. | `A/c XX0034`, `A/c *1234` |
| `cardLast4` | **Card last4** | User's credit or debit card last 4 digits. | `Card ending 8191`, `Card x4321` |
| `accountType` | **Account type** | Account class descriptor. | `Savings`, `Current`, `Credit Card` |

> [!IMPORTANT]
> **Admin Guidance for Beneficiary Accounts:**
> If an SMS states *"transferred to A/c XX9999 (John Doe)"*, admins **must tag `XX9999` as `ignoreText`**, NOT `accountLast4`. Tagging the beneficiary's account as `accountLast4` causes the user's personal ledger to confuse the receiver's account with their own!

### D. Channels & Identifiers
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `paymentMode` | **Payment mode** | Specific payment rail (`UPI`, `NEFT`, `IMPS`, `RTGS`, `POS`, `ATM`, `AutoPay`). | `via UPI`, `thru NEFT`, `at POS` |
| `referenceId` | **Ref / UTR** | Unique bank transaction identifier for deduplication. | `UPI Ref 410012342350`, `UTR 987654` |
| `upiId` | **UPI ID** | VPA handle used for friend splits and merchant rules. | `swiggy@icici`, `friend@okaxis` |
| `chequeNumber` | **Cheque number** | Cheque leaf number for clearing tracker. | `Cheque No. 000123` |

### E. Date & Time
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `date` | **Date only** | Calendar date of transaction. | `28-Oct-26`, `28/10/2026` |
| `time` | **Time only** | Time of transaction. | `19:28:51`, `07:30 PM` |
| `dateTime` | **Date + time** | Single token with combined timestamp. | `2026-10-28:19:28:51` |

### F. Credit Card Statements & Dues
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `totalDue` | **Total due** | Full monthly statement bill amount. | `Total Amt Due: Rs. 18,450.00` |
| `minimumDue` | **Minimum due** | Minimum payable amount. | `Min Amt Due: Rs. 950.00` |
| `dueDate` | **Due date** | Payment due date (triggers reminder, not expense). | `Due date: 15-Nov-26` |
| `emi` | **EMI** | Purchase conversion or monthly installment mention. | `EMI of Rs 1,500/mo` |
| `feeOrInterest` | **Fee / Interest** | Charges, late fees, or GST (counted as bank fee expense). | `Late fee Rs. 500` |

### G. Status & Utility
| Field ID | Tag Label | Purpose & Rule | Example in SMS |
| :--- | :--- | :--- | :--- |
| `status` | **Status** | Failed, declined, pending, or success. | `FAILED`, `Declined`, `Pending` |
| `autoPay` | **AutoPay / mandate** | Recurring mandate / standing instruction alert. | `AutoPay scheduled for` |
| `ignoreText` | **Ignore** | Noise, beneficiary accounts, helpline numbers, disclaimer footers. | `Call 1800...`, `SMS BLOCK to 56767` |

---

## 3. Template-Level Settings

Every template must configure these top-level properties in the editor:

1. **SMS Kind (Dropdown)**:
   - `Payment` (Standard debit/credit money movement)
   - `Statement` (Credit card monthly bill reminder)
   - `Transfer` (ATM cash withdrawal or internal account transfer)
   - `Failed` (Failed / declined transaction alert)
   - `Account Update` (KYC, balance alert, non-monetary update)
2. **Bank Name (Input / Dropdown)**:
   - Normalized bank key (e.g., `HDFC`, `SBI`, `ICICI`, `Axis`, `Kotak`, `AirtelPaymentsBank`).
3. **Sender IDs (Comma-Separated Input)**:
   - Sender headers that use this format (e.g., `VM-HDFCBK, VK-HDFCBK, HDFCBK, BP-HDFCBK`).
4. **Date Format (Input / Dropdown)**:
   - Expected date pattern format if date is extracted (e.g., `dd-MMM-yy`, `dd/MM/yyyy`, `yyyy-MM-dd:HH:mm:ss`).

---

## 4. Required Fields Per SMS Kind (Pre-Save Validation)

Before saving, the tagger validates that the minimum required fields for the chosen **SMS Kind** are present:

| SMS Kind | Required Fields | Prohibited Fields |
| :--- | :--- | :--- |
| **`Payment`** | `amount` AND (`debitType` OR `creditType`) AND (`accountLast4` OR `cardLast4` OR `bankName`) | `totalDue`, `dueDate` |
| **`Statement`** | `totalDue` AND `dueDate` AND (`cardLast4` OR `bankName`) | `debitType` (Must NOT create a transaction) |
| **`Transfer`** | `amount` AND (`atmWithdraw` OR `transferType` OR `billPayment`) | — |
| **`Failed`** | `amount` AND `status` | `debitType` (Must not add to spend) |
| **`Account Update`** | `balance` OR `cardLimit` | `amount`, `debitType` |

---

## 5. Page 2 Layout & Interaction Rules

The Page 2 tagging interface is structured strictly in top-to-bottom order:

1. **Details Summary Bar**:
   - `Money out · Debit card · POS · Payment · Success [ ✏️ Edit ]`
   - Clicking Edit returns to Page 1 with all tagged tokens preserved.
   - Returning to Page 2 automatically prunes tags that no longer fit (with a brief notice banner) and re-evaluates required tags.

2. **Beneficiary Protection Banner (Conditional)**:
   - Displays only if the SMS mentions receiver account keywords (`"to A/c"`, `"credited to"`, `"towards A/c"`) or multiple account numbers.
   - Instructs admin to tag receiver account numbers as `ignoreText` so the user's personal account is never overwritten.

3. **SMS Word Badges Cloud (Touch-Friendly)**:
   - Tap word 1, then tap word 2 to select an entire phrase (no keyboard shift key required).
   - Trailing punctuation (`.` `,` `;` `:`) is automatically stripped into non-selectable separators (`"28-Oct-26."` → `"28-Oct-26"` + `"."`).
   - Consecutive words for a merchant (e.g. `"Big Basket"`) share a unified Amber badge and compile into a single `{MERCHANT}` placeholder.
   - Prepositions (`at`, `on`, `via`, `to`) are automatically excluded from merchant tags.

4. **Filtered Tag Palette**:
   - Displays only relevant tags determined by Page 1 choices (Direction + Paid from + Mode + SMS kind + Status).
   - Single `"Merchant"` tag (duplicate `"Merchant name"` removed).
   - Redundant `"Payment mode"` tag removed (already selected on Page 1).
   - `[ + Show more tags ]` toggle link to access secondary tags if needed.

5. **Mode-Specific Required Tags Checklist (Rule A + B + C + D)**:
   - **UPI Mode:** Amount + (UPI ID or Merchant) + Account last4 + Debit word.
   - **Card Mode:** Amount + Card last4 + Merchant ("where spent") + Debit word.
   - **ATM Mode:** Amount + ATM word + Account or Card last4 (no merchant required).
   - **Income / Transfer / Statement:** Kind-specific rules.

6. **Title Section**:
   - Displays resolved title (`Merchant` → `UPI ID` → `Category Default`).
   - If there is no merchant in the SMS (like ATM or Bank Charges), the app automatically uses **Category as the Title** (`"ATM Cash Withdrawal"`, `"Bank Charges"`, etc.). A merchant tag is optional in those cases.
   - 1-tap Category suggestion pills (`ATM Cash Withdrawal`, `Bank Charges`, `Annual Fee`, `Utility Bills`, etc.) plus custom fixed title option.

---

## 6. Pre-Save Quality Checks & Guardrails

The Admin Tagger executes automated checks before saving:
1. **Single Amount Only**: Exactly one transaction amount is tagged.
2. **Reference Isolation**: Ref / UTR numbers are not confused with amounts or account numbers.
3. **No Stray Numbers**: Flags any untagged 4+ digit numeric strings.
4. **Required Tags Present**: Rule A + B + C + D validation pass.
5. **Corpus Conflict Test**: Guards against cross-bank false matches.
