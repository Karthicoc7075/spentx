import {
  BANK_MATCH_RULES,
  SEEDED_WALLETS,
  SEEDED_BANKS,
  ALL_SEEDED_INSTITUTIONS,
} from "../src/components/admin/SmsTemplateTagger";

// Test runner for auto-detect logic
function autoDetectFromSms(text: string) {
  const trimmed = text.trim();
  const cleanForMatching = trimmed
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/(?:report|dispute|call|sms\s+block\w*)[:\s]+[^\n\.]+/gi, "");
  const cleanLower = cleanForMatching.toLowerCase();

  // 1. Detect Bank / Wallet
  let detectedBank = "";

  // Disambiguation: Check if SMS is for Paytm Payments Bank (a bank) or Paytm Wallet (a wallet)
  const isPaytmPaymentsBank =
    /\bpaytm\s+(?:payments\s+)?bank\b/i.test(cleanLower) ||
    (/\bpaytm\b/i.test(cleanLower) && /\b(?:a\/c|account|acct)\b/i.test(cleanLower) && !/\bwallet\b/i.test(cleanLower));

  // If money is debited FROM a bank A/c TOWARDS a wallet, the bank is the debiting bank, not the wallet
  const isDebitedFromBankTowardsWallet =
    /\b(?:debited|transferred|spent)\s+from\b/i.test(cleanLower) &&
    /\b(?:a\/c|account|acct)\b/i.test(cleanLower) &&
    /\b(?:towards|to)\s+(?:paytm\s+wallet|amazon\s+pay|payzapp|phonepe\s+wallet|mobikwik|freecharge|wallet)\b/i.test(cleanLower);

  for (const rule of BANK_MATCH_RULES) {
    if (isPaytmPaymentsBank && rule.bank === "Paytm Wallet") continue;
    if (isDebitedFromBankTowardsWallet && SEEDED_WALLETS.includes(rule.bank)) continue;

    const match = rule.keywords.some((kw) => {
      const cleanKw = kw.trim();
      if (cleanKw.length <= 4) {
        const regex = new RegExp(`(?:^|[^a-z0-9])${cleanKw}(?:[^a-z0-9]|$)`, "i");
        return regex.test(cleanForMatching);
      }
      return cleanLower.includes(cleanKw);
    });
    if (match) {
      detectedBank = rule.bank;
      break;
    }
  }

  // 2. Detect Direction
  let detectedDirection: "money_out" | "money_in" | "no_money_moved" | "" = "";
  let detectedPaidFrom = "";
  let detectedMode = "";
  let detectedKind = "";

  const isCredit =
    /\b(?:credited|credit to|received|refund(?:ed)?|cashback|deposited|deposit of|reversal|added to|added)\b/i.test(cleanLower) ||
    /\btransferred to your\b/i.test(cleanLower);

  const isNoMoneyMoved =
    (/\b(?:statement|due date|total (?:amount )?due|min(?:imum)? (?:amount )?due|e-statement|bill generated)\b/i.test(cleanLower) ||
      (/\b(?:avail(?:able)?|avl) limit\b/i.test(cleanLower) && !/\b(?:spent|debited|paid|deducted)\b/i.test(cleanLower))) &&
    !isCredit;

  const isDebit =
    /\b(?:debited|spent|withdrawn|paid|transferred from|sent|txn of|deducted|purchase of|charged)\b/i.test(cleanLower) ||
    /\bused at\b/i.test(cleanLower);

  if (isCredit) {
    detectedDirection = "money_in";
  } else if (isNoMoneyMoved) {
    detectedDirection = "no_money_moved";
  } else if (isDebit) {
    detectedDirection = "money_out";
  }

  // 3. Detect Paid From
  const isViaAppUpiFromBank =
    /\bvia\s+(?:paytm|phonepe|gpay|google pay|bhim)\b/i.test(cleanLower) &&
    /\b(?:a\/c|account|acct|bank)\b/i.test(cleanLower);

  if (isViaAppUpiFromBank || isDebitedFromBankTowardsWallet || isPaytmPaymentsBank) {
    detectedPaidFrom = "bank_account";
  } else if (
    SEEDED_WALLETS.includes(detectedBank) ||
    /\b(?:wallet|paytm wallet|amazon pay(?:\s+balance)?|payzapp(?:\s+wallet)?|phonepe wallet|mobikwik|freecharge)\b/i.test(cleanLower)
  ) {
    detectedPaidFrom = "wallet";
  } else if (
    /\b(?:credit card|cc ending|c\/card)\b/i.test(cleanLower) ||
    (/\bcard ending\b/i.test(cleanLower) && (/\blimit\b/i.test(cleanLower) || /\breward\b/i.test(cleanLower) || /\bcredit\b/i.test(cleanLower)))
  ) {
    detectedPaidFrom = "credit_card";
  } else if (/\b(?:debit card|dc ending|dc\b|atm\/debit)\b/i.test(cleanLower)) {
    detectedPaidFrom = "debit_card";
  } else if (/\b(?:a\/c|account|acct|savings|current a\/c|a\/c no)\b/i.test(cleanLower)) {
    detectedPaidFrom = "bank_account";
  } else if (/\bcard ending\b/i.test(cleanLower) || /\bcard x\b/i.test(cleanLower)) {
    detectedPaidFrom = /\batm\b/i.test(cleanLower) ? "debit_card" : "credit_card";
  }

  // 4. Detect Mode
  if (detectedPaidFrom === "wallet") {
    if (detectedDirection === "money_in") {
      if (/\bcashback\b/i.test(cleanLower)) {
        detectedMode = "cashback";
      } else if (/\brefund\b/i.test(cleanLower)) {
        detectedMode = "refund";
      } else {
        detectedMode = "wallet_topup";
      }
    } else {
      if (/\b(?:upi|vpa)\b/i.test(cleanLower)) {
        detectedMode = "upi";
      } else if (/\b(?:online|e-?com)\b/i.test(cleanLower)) {
        detectedMode = "online";
      } else {
        detectedMode = "wallet_transfer";
      }
    }
  } else if (/\b(?:upi|vpa|gpay|google pay|phonepe|bhim)\b/i.test(cleanLower) || /[a-z0-9._-]+@[a-z]{3,}/i.test(cleanLower)) {
    detectedMode = "upi";
  } else if (/\b(?:atm|atm w\/d|atm cash|cash withdrawal|cash wdl|w\/d)\b/i.test(cleanLower)) {
    detectedMode = "atm";
  } else if (/\b(?:pos|pos purchase|pos swipe|swipe|at pos)\b/i.test(cleanLower)) {
    detectedMode = "pos";
  } else if (/\b(?:netbanking|net banking|internet banking)\b/i.test(cleanLower)) {
    detectedMode = "netbanking";
  } else if (/\b(?:e-?com|online|payment gateway)\b/i.test(cleanLower)) {
    detectedMode = "online";
  } else if (detectedPaidFrom === "credit_card" || detectedPaidFrom === "debit_card") {
    detectedMode = "pos";
  }

  // 5. Detect SMS Kind
  const isCashback = /\bcashback\b/i.test(cleanLower);
  const isRefund = /\b(?:refund|reversal)\b/i.test(cleanLower);

  const isWalletTopupSms =
    !isCashback &&
    !isRefund &&
    ((/\b(?:added to|loaded to|top-?up|topped up)\b/i.test(cleanLower) &&
      /\b(?:wallet|paytm wallet|amazon pay|payzapp)\b/i.test(cleanLower)) ||
     (detectedPaidFrom === "wallet" && detectedDirection === "money_in") ||
     (detectedPaidFrom === "bank_account" && detectedDirection === "money_out" && /\b(?:wallet|paytm wallet|amazon pay|payzapp)\b/i.test(cleanLower)));

  if (isCashback) {
    detectedKind = "cashback";
  } else if (isRefund) {
    detectedKind = "refund";
  } else if (isWalletTopupSms) {
    detectedKind = "wallet_topup";
  } else if (detectedDirection === "no_money_moved") {
    detectedKind = "statement";
  } else if (detectedDirection === "money_in") {
    detectedKind = "income";
  } else if (detectedDirection === "money_out") {
    detectedKind = "payment";
  }

  return {
    bank: detectedBank,
    direction: detectedDirection,
    paidFrom: detectedPaidFrom,
    mode: detectedMode,
    kind: detectedKind,
  };
}

console.log("=== RUNNING WALLET SMS TEMPLATE TAGGER TESTS ===\n");

// Case 0: PayZapp SMS with HDFC security link
const payzappSms = `Rs.3000 Deducted
From PayZapp Wallet
On 28-10-2026 07:26:22
Bal: Rs.272.64
Not you? Report:
https://1.hdfc.bank.in/HDFCBK/s/EAygxOWe or SMS BLOCKPZW to 5676712.`;

const r0 = autoDetectFromSms(payzappSms);
console.log("Case 0 (PayZapp with HDFC dispute link):", r0);
if (r0.bank !== "PayZapp Wallet") throw new Error(`Expected PayZapp Wallet, got ${r0.bank}`);
if (r0.paidFrom !== "wallet") throw new Error(`Expected wallet, got ${r0.paidFrom}`);
if (r0.direction !== "money_out") throw new Error(`Expected money_out, got ${r0.direction}`);
if (r0.mode !== "wallet_transfer") throw new Error(`Expected wallet_transfer, got ${r0.mode}`);
if (r0.kind !== "payment") throw new Error(`Expected payment, got ${r0.kind}`);

// Case 1: User Test 1 (Paytm Wallet Spend)
const test1 = "Rs.200 paid to SWIGGY from your Paytm Wallet. Txn ID 2345678901. Updated Balance Rs.150.";
const r1 = autoDetectFromSms(test1);
console.log("Case 1 (Paytm Wallet spend to Swiggy):", r1);
if (r1.bank !== "Paytm Wallet") throw new Error(`Expected Paytm Wallet, got ${r1.bank}`);
if (r1.paidFrom !== "wallet") throw new Error(`Expected wallet, got ${r1.paidFrom}`);
if (r1.direction !== "money_out") throw new Error(`Expected money_out, got ${r1.direction}`);
if (r1.mode !== "wallet_transfer") throw new Error(`Expected wallet_transfer, got ${r1.mode}`);
if (r1.kind !== "payment") throw new Error(`Expected payment, got ${r1.kind}`);

// Case 2: User Test 2 (Paytm Wallet Top-up from HDFC Bank)
const test2 = "Rs.500 added to your Paytm Wallet from HDFC Bank. Txn ID 2345678902. Balance Rs.650.";
const r2 = autoDetectFromSms(test2);
console.log("Case 2 (Paytm Wallet Top-up from HDFC Bank):", r2);
if (r2.bank !== "Paytm Wallet") throw new Error(`Expected Paytm Wallet, got ${r2.bank}`);
if (r2.paidFrom !== "wallet") throw new Error(`Expected wallet, got ${r2.paidFrom}`);
if (r2.direction !== "money_in") throw new Error(`Expected money_in, got ${r2.direction}`);
if (r2.mode !== "wallet_topup") throw new Error(`Expected wallet_topup, got ${r2.mode}`);
if (r2.kind !== "wallet_topup") throw new Error(`Expected wallet_topup, got ${r2.kind}`);

// Case 3: User Test 3 (Cashback into Amazon Pay balance)
const test3 = "Cashback of ₹25 added to your Amazon Pay balance for order 402-123456.";
const r3 = autoDetectFromSms(test3);
console.log("Case 3 (Cashback into Amazon Pay balance):", r3);
if (r3.bank !== "Amazon Pay") throw new Error(`Expected Amazon Pay, got ${r3.bank}`);
if (r3.paidFrom !== "wallet") throw new Error(`Expected wallet, got ${r3.paidFrom}`);
if (r3.direction !== "money_in") throw new Error(`Expected money_in, got ${r3.direction}`);
if (r3.mode !== "cashback") throw new Error(`Expected cashback, got ${r3.mode}`);
if (r3.kind !== "cashback") throw new Error(`Expected cashback, got ${r3.kind}`);

// Case 4: Disambiguation - Paytm Payments Bank A/c
const test4 = "Paytm Payments Bank A/c XX1234 debited by Rs 500. Avl Bal: Rs 4,500.";
const r4 = autoDetectFromSms(test4);
console.log("Case 4 (Paytm Payments Bank A/c):", r4);
if (r4.bank !== "Paytm Payments Bank") throw new Error(`Expected Paytm Payments Bank, got ${r4.bank}`);
if (r4.paidFrom !== "bank_account") throw new Error(`Expected bank_account, got ${r4.paidFrom}`);

// Case 5: Disambiguation - via Paytm UPI from HDFC Bank A/c
const test5 = "INR 300 debited from HDFC Bank A/c XX5678 via Paytm UPI to ZOMATO.";
const r5 = autoDetectFromSms(test5);
console.log("Case 5 (via Paytm UPI from Bank A/c):", r5);
if (r5.bank !== "HDFC Bank") throw new Error(`Expected HDFC Bank, got ${r5.bank}`);
if (r5.paidFrom !== "bank_account") throw new Error(`Expected bank_account, got ${r5.paidFrom}`);
if (r5.mode !== "upi") throw new Error(`Expected upi, got ${r5.mode}`);

// Case 6: Bank Debit SMS for Wallet Top-up
const test6 = "Rs.500 debited from HDFC Bank A/c XX5678 towards Paytm Wallet. Ref 2345678902.";
const r6 = autoDetectFromSms(test6);
console.log("Case 6 (Bank debit towards Paytm Wallet):", r6);
if (r6.bank !== "HDFC Bank") throw new Error(`Expected HDFC Bank, got ${r6.bank}`);
if (r6.paidFrom !== "bank_account") throw new Error(`Expected bank_account, got ${r6.paidFrom}`);
if (r6.direction !== "money_out") throw new Error(`Expected money_out, got ${r6.direction}`);
if (r6.kind !== "wallet_topup") throw new Error(`Expected wallet_topup, got ${r6.kind}`);

console.log("\n✅ ALL 7 TEST CASES PASSED SUCCESSFULLY!");
