#!/usr/bin/env node
/**
 * Retag sms_template_rules: add missing Debit word / Credit word / ATM /
 * account last 4 / bank name placeholders to template_pattern (+ matching
 * extraction_map entries, like the admin form's Save does).
 *
 * READ-ONLY against Supabase. It only writes local files:
 *   supabase/migrations/<timestamp>_sms_template_rules_retag.sql
 *   scripts/retag-report.txt
 * Review the SQL, then run it yourself in the Supabase SQL editor.
 *
 * Usage (from the web repo root):  node scripts/retag-sms-templates.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

// ---------------------------------------------------------------- env
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv(path.join(ROOT, ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) in .env.local");
  process.exit(1);
}
const usingKey = process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : "NEXT_PUBLIC_SUPABASE_ANON_KEY";

// ------------------------------------------------- placeholders (same as SmsTemplateTagger.tsx)
// tokenTag(field) = `{${field.toUpperCase()}}`; extraction_map[originalText] = field id.
const F = {
  debitType: { field: "debitType", ph: "{DEBITTYPE}" },
  creditType: { field: "creditType", ph: "{CREDITTYPE}" },
  atmWithdraw: { field: "atmWithdraw", ph: "{ATMWITHDRAW}" },
  accountLast4: { field: "accountLast4", ph: "{ACCOUNTLAST4}" },
  bankName: { field: "bankName", ph: "{BANKNAME}" },
};
const ACCOUNT_PH = /\{(ACCOUNTLAST4|CARDLAST4|CARDNUMBER|ACCOUNTNUMBER)\}/;

const DEBIT_RE = /\b(debited|spent|paid|withdrawn|deducted|sent|purchased|purchase|charged)\b/gi;
const CREDIT_RE = /\b(credited|received|deposited|added|refunded|refund)\b/gi;
const ATM_RE = /\bATM\b/gi;
const LAST4_RES = [
  /(?<=(?:\bX{1,}|\*{1,}|\bx)\s?)\d{4}(?!\d)/g, // XX1234, **1234, x1234
  /(?<=\bending\s+(?:with\s+|in\s+)?)\d{4}(?!\d)/gi, // ending 1234
  /(?<=\b(?:card|a\/c|acct|account)\s*(?:no\.?\s*)?)\d{4}(?!\d)/gi, // Card 1234 / A/c 1234
];

// bank_name key -> how the bank names itself in SMS (full and short names).
const BANKS = {
  HDFC: ["HDFC Bank", "HDFC"], Axis: ["Axis Bank", "Axis"], SBI: ["State Bank of India", "SBI"],
  ICICI: ["ICICI Bank", "ICICI"], Kotak: ["Kotak Mahindra Bank", "Kotak Bank", "Kotak"],
  IDFC: ["IDFC FIRST Bank", "IDFC Bank", "IDFC"], YES: ["YES BANK"], IndusInd: ["IndusInd Bank", "IndusInd"],
  PNB: ["Punjab National Bank", "PNB"], BOB: ["Bank of Baroda", "BOB"], Canara: ["Canara Bank", "Canara"],
  UnionBank: ["Union Bank of India", "Union Bank"], FederalBank: ["Federal Bank"],
  KarurVysyaBank: ["Karur Vysya Bank", "KVB"], SouthIndianBank: ["South Indian Bank", "SIB"],
  CityUnionBank: ["City Union Bank", "CUB"], AUSmallFinanceBank: ["AU Small Finance Bank", "AU Bank"],
  AirtelPaymentsBank: ["Airtel Payments Bank"], BankOfIndia: ["Bank of India", "BOI"],
  BankOfMaharashtra: ["Bank of Maharashtra", "BOM"], CSBBank: ["CSB Bank"], CentralBank: ["Central Bank of India", "CBI"],
  DBS: ["DBS Bank", "DBS"], DCBBank: ["DCB Bank"], DhanlaxmiBank: ["Dhanlaxmi Bank", "DLB"],
  ESAFSmallFinanceBank: ["ESAF Small Finance Bank", "ESAF SFB"], EquitasSmallFinanceBank: ["Equitas Small Finance Bank", "Equitas Bank"],
  FinoPaymentsBank: ["Fino Payments Bank", "Fino Bank"], IDBI: ["IDBI Bank", "IDBI"], IOB: ["Indian Overseas Bank", "IOB"],
  IndiaPostPaymentsBank: ["India Post Payments Bank", "IPPB"], IndianBank: ["Indian Bank"],
  JammuKashmirBank: ["J&K Bank", "JK Bank", "JKBank"], JanaSmallFinanceBank: ["Jana Small Finance Bank", "Jana SFB"],
  JioPaymentsBank: ["Jio Payments Bank"], KarnatakaBank: ["Karnataka Bank", "KBL"], NainitalBank: ["Nainital Bank"],
  PunjabAndSindBank: ["Punjab & Sind Bank", "PSB"], RBL: ["RBL Bank", "RBL"],
  SuryodaySmallFinanceBank: ["Suryoday Small Finance Bank", "Suryoday SFB"], TamilnadMercantileBank: ["Tamilnad Mercantile Bank", "TMB"],
  UCOBank: ["UCO Bank"], UjjivanSmallFinanceBank: ["Ujjivan Small Finance Bank", "Ujjivan SFB"],
  PayZapp: ["PayZapp"], Paytm: ["Paytm Payments Bank", "Paytm"], AmazonPay: ["Amazon Pay"], PhonePe: ["PhonePe"], Mobikwik: ["Mobikwik"],
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Names of this row's own bank only (never another bank mentioned in the SMS). */
function bankRegexFor(row) {
  const bn = (row.bank_name || "").trim();
  const bnN = norm(bn);
  if (!bnN || bnN === "unknown") return null;
  const cands = new Set([bn, bn.replace(/([a-z])([A-Z])/g, "$1 $2")]);
  for (const [k, names] of Object.entries(BANKS)) {
    const kN = norm(k);
    if (bnN === kN || bnN.startsWith(kN) || kN.startsWith(bnN)) names.forEach((n) => cands.add(n));
  }
  const alts = [...cands].filter((c) => norm(c).length >= 2).sort((a, b) => b.length - a.length)
    .map((a) => `${esc(a).replace(/ /g, "\\s+")}(?:\\s+Bank)?`);
  return new RegExp(`(?<![A-Za-z0-9])(?:${alts.join("|")})(?![A-Za-z0-9])`, "gi");
}

// ------------------------------------------------- pattern <-> sample
const PH_RE = /\{[A-Za-z0-9_]+\}/g;
function segments(pattern) {
  const out = [];
  let last = 0;
  for (const m of pattern.matchAll(PH_RE)) {
    if (m.index > last) out.push({ lit: true, text: pattern.slice(last, m.index) });
    out.push({ lit: false, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < pattern.length) out.push({ lit: true, text: pattern.slice(last) });
  return out;
}
function patternMatchesSample(pattern, sample) {
  const src = segments(pattern).map((s) => (s.lit ? esc(s.text) : "[\\s\\S]+?")).join("");
  try { return new RegExp(`^${src}$`).test(sample); } catch { return false; }
}

/** Replace matches of `re` in literal segments only. Returns originals replaced. */
function applyRule(segs, re, ph, sample, { firstOnly = false, map = {}, field } = {}) {
  const found = [];
  const out = [];
  for (const s of segs) {
    if (!s.lit || (firstOnly && found.length)) { out.push(s); continue; }
    let last = 0;
    re.lastIndex = 0;
    for (const m of s.text.matchAll(re)) {
      if (firstOnly && found.length) break;
      const word = m[0];
      if (!sample.toLowerCase().includes(word.toLowerCase())) continue;
      // Word already saved in extraction_map as another field: leave it alone.
      if (word in map && map[word] !== field) continue;
      if (m.index > last) out.push({ lit: true, text: s.text.slice(last, m.index) });
      out.push({ lit: false, text: ph });
      found.push(word);
      last = m.index + word.length;
    }
    if (last < s.text.length) out.push({ lit: true, text: s.text.slice(last) });
  }
  return { segs: out, found };
}

// ------------------------------------------------- main
async function fetchAll() {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("sms_template_rules").select("*").order("id").range(from, from + 999);
    if (error) throw new Error(`Supabase read failed (${error.message}). If RLS blocks it, add SUPABASE_SERVICE_ROLE_KEY to .env.local.`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  if (!rows.length) {
    throw new Error(`0 rows read with ${usingKey}. If RLS blocks anon reads, add SUPABASE_SERVICE_ROLE_KEY to .env.local.`);
  }
  return rows;
}

function retag(row) {
  const pattern = row.template_pattern || "";
  const sample = row.sample_message || "";
  if (!pattern || !sample) return { skip: "no pattern/sample" };
  if (!patternMatchesSample(pattern, sample)) return { skip: "pattern does not match sample" };

  let segs = segments(pattern);
  const added = [];
  const map = row.extraction_map && typeof row.extraction_map === "object" ? { ...row.extraction_map } : {};
  const addMap = (words, field) => {
    for (const w of words) if (!(w in map)) map[w] = field;
  };

  const steps = [];
  if (!pattern.includes(F.bankName.ph)) {
    const re = bankRegexFor(row);
    if (re) steps.push([F.bankName, re, true]);
  }
  if (!ACCOUNT_PH.test(pattern)) for (const re of LAST4_RES) steps.push([F.accountLast4, re, true]);
  steps.push([F.atmWithdraw, ATM_RE, false]);
  steps.push([F.debitType, DEBIT_RE, false]);
  steps.push([F.creditType, CREDIT_RE, false]);

  for (const [f, re, firstOnly] of steps) {
    // one account number per row
    const once = f === F.accountLast4 && added.includes(f.ph);
    if (once) continue;
    const r = applyRule(segs, re, f.ph, sample, { firstOnly, map, field: f.field });
    if (!r.found.length) continue;
    segs = r.segs;
    addMap(r.found, f.field);
    added.push(f.ph);
  }
  const newPattern = segs.map((s) => s.text).join("");
  if (newPattern === pattern) return { unchanged: true };
  if (!patternMatchesSample(newPattern, sample)) return { skip: "retagged pattern would not match sample" };
  return { newPattern, newMap: map, added };
}

function dq(s) {
  let tag = "sx";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
}

function buildSql(changes, total) {
  const BK = "public.sms_template_rules_backup_retag_20261029";
  const phs = Object.values(F).map((f) => f.ph);
  const L = [];
  L.push(`-- sms_template_rules retag: add {DEBITTYPE}/{CREDITTYPE}/{ATMWITHDRAW}/{ACCOUNTLAST4}/{BANKNAME}`);
  L.push(`-- Generated by scripts/retag-sms-templates.mjs on ${new Date().toISOString()}`);
  L.push(`-- Rows read: ${total}. Rows to update: ${changes.length}. Run the whole file once in the Supabase SQL editor.`);
  L.push("");
  L.push("-- ============ Section 1: backup (stops if it already exists) ============");
  L.push(`DO $bk$ BEGIN
  IF to_regclass('${BK}') IS NOT NULL THEN
    RAISE EXCEPTION 'Backup ${BK} already exists - retag was already run. Stopping.';
  END IF;
END $bk$;`);
  L.push(`CREATE TABLE ${BK} AS SELECT * FROM public.sms_template_rules;`);
  L.push(`ALTER TABLE ${BK} ENABLE ROW LEVEL SECURITY;`);
  L.push(`REVOKE ALL ON ${BK} FROM public, anon, authenticated;`);
  L.push("");
  L.push("-- ============ Section 2: precheck counts ============");
  L.push(`SELECT (SELECT count(*) FROM public.sms_template_rules) AS live_rows,
       (SELECT count(*) FROM ${BK}) AS backup_rows,
       ${total} AS rows_seen_by_script;`);
  L.push("");
  L.push("-- ============ Section 3: updates (one transaction) ============");
  L.push("BEGIN;");
  L.push(`DO $upd$
DECLARE n int; total int := 0;
BEGIN
  IF to_regclass('${BK}') IS NULL THEN RAISE EXCEPTION 'Backup missing - aborting.'; END IF;
  IF (SELECT count(*) FROM public.sms_template_rules) <> (SELECT count(*) FROM ${BK})
     OR (SELECT count(*) FROM public.sms_template_rules) <> ${total} THEN
    RAISE EXCEPTION 'Row counts differ from backup / script run - aborting.';
  END IF;`);
  for (const c of changes) {
    L.push(`  UPDATE public.sms_template_rules
     SET template_pattern = ${dq(c.newPattern)},
         extraction_map = ${dq(JSON.stringify(c.newMap))}::jsonb,
         updated_at = now()
   WHERE id = '${c.id}' AND template_pattern = ${dq(c.oldPattern)};
  GET DIAGNOSTICS n = ROW_COUNT; total := total + n;`);
  }
  L.push(`  IF total <> ${changes.length} THEN
    RAISE EXCEPTION 'Expected ${changes.length} updated rows, got % - rolled back (rows changed since script run?).', total;
  END IF;
END $upd$;`);
  L.push("COMMIT;");
  L.push("");
  L.push("-- ============ Section 4: verify ============");
  L.push(`SELECT (SELECT count(*) FROM public.sms_template_rules) AS live_rows,
       (SELECT count(*) FROM ${BK}) AS backup_rows,
       (SELECT count(*) FROM public.sms_template_rules t JOIN ${BK} b USING (id)
         WHERE t.template_pattern IS DISTINCT FROM b.template_pattern) AS rows_changed_expect_${changes.length};`);
  L.push(
    `SELECT ${phs
      .map((p) => {
        const a = p.slice(1, -1).toLowerCase();
        return `(SELECT count(*) FROM public.sms_template_rules WHERE template_pattern LIKE '%${p}%') AS ${a}_now,\n       (SELECT count(*) FROM ${BK} WHERE template_pattern LIKE '%${p}%') AS ${a}_before`;
      })
      .join(",\n       ")};`,
  );
  L.push("");
  L.push("-- ============ Section 5: rollback (run only if needed) ============");
  L.push(`-- UPDATE public.sms_template_rules t
--    SET template_pattern = b.template_pattern,
--        extraction_map = b.extraction_map,
--        updated_at = b.updated_at
--   FROM ${BK} b
--  WHERE t.id = b.id;`);
  L.push("");
  return L.join("\n");
}

const rows = await fetchAll();
const changes = [];
const skipped = {};
let unchanged = 0;
const perTag = Object.fromEntries(Object.values(F).map((f) => [f.ph, 0]));
for (const row of rows) {
  const r = retag(row);
  if (r.skip) { skipped[r.skip] = (skipped[r.skip] || 0) + 1; continue; }
  if (r.unchanged) { unchanged++; continue; }
  for (const ph of new Set(r.added)) perTag[ph]++;
  changes.push({ id: row.id, bank: row.bank_name, oldPattern: row.template_pattern, newPattern: r.newPattern, newMap: r.newMap, added: r.added });
}

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const sqlPath = path.join("supabase", "migrations", `${stamp}_sms_template_rules_retag.sql`);
fs.mkdirSync(path.join(ROOT, "supabase", "migrations"), { recursive: true });
fs.writeFileSync(path.join(ROOT, sqlPath), buildSql(changes, rows.length));

const R = [];
R.push(`sms_template_rules retag report (${new Date().toISOString()}, read with ${usingKey})`);
R.push(`Rows read: ${rows.length}`);
R.push(`Rows changed: ${changes.length}`);
R.push(`Rows unchanged: ${unchanged}`);
R.push(`Rows skipped: ${Object.values(skipped).reduce((a, b) => a + b, 0)} ${JSON.stringify(skipped)}`);
R.push("Rows per added tag:");
for (const [ph, n] of Object.entries(perTag)) R.push(`  ${ph}: ${n}`);
R.push(`SQL: ${sqlPath}`);
R.push("");
R.push("Examples:");
for (const c of changes.slice(0, 3)) {
  R.push(`- ${c.id} (${c.bank})`);
  R.push(`  before: ${c.oldPattern}`);
  R.push(`  after:  ${c.newPattern}`);
}
R.push("");
R.push("All changes:");
for (const c of changes) R.push(`${c.id}\t${c.added.join(",")}\t${c.newPattern}`);
const report = R.join("\n");
fs.writeFileSync(path.join(ROOT, "scripts", "retag-report.txt"), report + "\n");
console.log(report.split("\nAll changes:")[0]);
console.log("Full report: scripts/retag-report.txt");
