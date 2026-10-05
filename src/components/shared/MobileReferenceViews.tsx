"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlus,
  CreditCard,
  Eye,
  Landmark,
  MoreVertical,
  PiggyBank,
  Plus,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
  Wallet,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Account, NetWorthBreakdown, PlanAllocation, Transaction } from "@/types";
import { computeAccountBalancesMap } from "@/lib/wealth";
import { formatCurrency } from "@/lib/utils";

const money = (value: number) =>
  value > 0 ? formatCurrency(value) : "₹0";

function MobileNav({ active }: { active: "activity" | "plan" | "wealth" | "accounts" }) {
  const items = [
    { href: "/", label: "Home", icon: WalletCards },
    { href: "/transactions", label: "Activity", icon: Activity, key: "activity" },
    { href: "/analytics", label: "Analytics", icon: TrendingUp },
    { href: "/accounts", label: "Accounts", icon: Landmark, key: "accounts" },
  ];
  return (
    <nav className="sx-mobile-nav">
      {items.slice(0, 2).map((item) => {
        const Icon = item.icon;
        const selected = item.key === active;
        return <Link key={item.href} href={item.href} className={selected ? "active" : ""}><Icon /><span>{item.label}</span></Link>;
      })}
      <Link href="/transactions" className="sx-mobile-fab" aria-label="Add transaction"><Plus /></Link>
      {items.slice(2).map((item) => {
        const Icon = item.icon;
        const selected = item.key === active;
        return <Link key={item.href} href={item.href} className={selected ? "active" : ""}><Icon /><span>{item.label}</span></Link>;
      })}
    </nav>
  );
}

function MobileHeader({ title, subtitle, icon: Icon = WalletCards, back = false }: { title: string; subtitle?: string; icon?: typeof WalletCards; back?: boolean }) {
  return (
    <header className="sx-mobile-header">
      <div className="flex items-center gap-3 min-w-0">
        {back ? <button className="sx-icon-button" aria-label="Back"><ArrowLeft /></button> : <span className="sx-brand-icon"><Icon /></span>}
        <div className="min-w-0"><h1>{title}</h1>{subtitle ? <p>{subtitle}</p> : null}</div>
      </div>
      <div className="flex items-center gap-1"><button className="sx-icon-button"><Bell /></button><span className="sx-avatar"><UserRound /></span></div>
    </header>
  );
}

function FilterChip({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return <button className={`sx-chip ${active ? "active" : ""}`}>{children}</button>;
}

export function MobileActivityView({ transactions }: { transactions: Transaction[] }) {
  const rows = useMemo(() => transactions.slice(0, 7), [transactions]);
  const fallback = [
    ["Starbucks Coffee", "Food", "-₹240", "Debit", "1:20 PM · Personal · HDFC Bank"],
    ["TechCorp Inc", "Salary", "+₹25,000", "Credit", "9:30 AM · Personal · HDFC Bank"],
    ["Emergency Fund", "Transfer", "₹5,000", "Internal", "11:15 AM · HDFC → SBI"],
    ["Nature’s Basket", "Grocery", "-₹1,250", "Debit", "4:15 PM · Family · SBI UPI"],
    ["Metro Transit Pass", "Transit", "-₹180", "Debit", "2:40 PM · Personal · Metro Card"],
    ["Netflix Premium", "Streaming", "-₹649", "Debit", "8:00 AM · Personal · Autopay"],
    ["Apollo Pharmacy", "Health", "-₹420", "Debit", "6:30 PM · Family · UPI"],
  ];
  return <div className="sx-mobile-page">
    <MobileHeader title="Activity" subtitle="SPENTX LEDGER" icon={CreditCard} />
    <main className="sx-mobile-content">
      <div className="sx-search-row"><div className="sx-search"><Search /><span>Search transactions, payees, tags</span></div><button className="sx-filter"><SlidersHorizontal /> Filters <i /></button></div>
      <div className="sx-alert"><span className="sx-alert-icon"><Activity /></span><div><b>10 new transactions</b><small>Auto-detected from bank SMS & UPI</small></div><button>Review <ChevronRight /></button></div>
      <div className="sx-scroll-chips"><FilterChip active>This Month</FilterChip><FilterChip>Previous Month</FilterChip><FilterChip>Last 3 Months</FilterChip><FilterChip>Last Year</FilterChip></div>
      <section className="sx-dark-card sx-cashflow"><div className="flex items-center justify-between"><small>NET CASHFLOW (SURPLUS)</small><span className="sx-dark-pill">● 49% Savings Rate</span></div><strong>+₹12,360</strong><span className="sx-positive-pill">Surplus</span><div className="sx-split-labels"><span>Retained (49%)</span><span>Spent (51%)</span></div><div className="sx-split-bar"><i /><b /></div><div className="grid grid-cols-2 gap-2 mt-3"><div className="sx-cash-stat"><small>TOTAL IN</small><b>+₹25,000</b></div><div className="sx-cash-stat"><small>TOTAL OUT</small><b className="pink">-₹12,640</b></div></div><p>Prev Period Net: <b>+₹8,420</b></p></section>
      <div className="sx-scroll-chips sx-light-chips"><FilterChip>All Accounts ×</FilterChip><FilterChip>Category: All ×</FilterChip><FilterChip>₹0 – Max ×</FilterChip><button>Reset</button></div>
      <div className="sx-section-label"><b>ALL LEDGER ENTRIES</b><span>24 records</span></div>
      <div className="sx-day-label">Today <small>28 Sep</small><em>Net: +₹24,760</em></div>
      {(rows.length ? rows : fallback).map((item, index) => {
        const isTx = typeof item !== "string" && !Array.isArray(item);
        const merchant = isTx ? item.merchant : (item as string[])[0];
        const category = isTx ? item.category : (item as string[])[1];
        const amount = isTx ? `${item.type === "income" ? "+" : "-"}${formatCurrency(item.amount)}` : (item as string[])[2];
        const meta = isTx ? `${item.date?.slice(11, 16) || "Today"} · ${item.purpose || "Personal"} · ${item.account || "UPI"}` : (item as string[])[4];
        return <div className="sx-transaction" key={`${merchant}-${index}`}><span className={`sx-transaction-icon tone-${index % 4}`}><Wallet /></span><div className="min-w-0 flex-1"><b>{merchant}</b><span><small>{category}</small>{meta}</span></div><div className={`sx-amount ${amount.startsWith("+") ? "income" : amount.startsWith("₹") ? "neutral" : ""}`}><b>{amount}</b><small>{isTx ? item.type === "income" ? "Credit" : "Debit" : (item as string[])[3]}</small></div></div>;
      })}
    </main><MobileNav active="activity" />
  </div>;
}

function PlanCategory({ name, spent, planned, color = "mint", onAdjust }: { name: string; spent: number; planned: number; color?: string; onAdjust?: (delta: number) => void }) {
  const pct = planned ? Math.min(100, Math.round((spent / planned) * 100)) : 0;
  const over = spent > planned;
  return <div className={`sx-plan-category ${over ? "over" : ""}`}><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className={`sx-category-icon ${color}`}><Wallet /></span><div><b>{name}</b><small>{money(spent)} / {money(planned)}</small></div></div><div className="text-right"><b>{over ? `${money(spent - planned)} over limit` : `${money(planned - spent)} left`}</b><small>{over ? `WARNING · ${pct}%` : `${pct}% spent`}</small></div></div><div className="sx-progress"><i style={{ width: `${pct}%` }} /></div><div className="flex items-center justify-between text-xs text-slate-400"><span>{over ? `Exceeded by ${pct - 100}%` : `${pct}% spent`}</span><span className="flex gap-2 items-center"><button onClick={() => onAdjust?.(-500)}>−</button>{money(planned)}<button onClick={() => onAdjust?.(500)}>+</button></span></div></div>;
}

export function MobilePlanView({ plan, onAdjust, onAddCategory }: { plan: { month: string; expectedIncome: number; totalPlanned: number; allocations: PlanAllocation[]; categorySpentActuals: Record<string, number> }; onAdjust?: (id: string, delta: number) => void; onAddCategory?: () => void }) {
  const shown = plan.allocations.filter((a) => a.plannedAmount > 0).slice(0, 6);
  const categories = shown.length ? shown : [
    { id: "food", category: "Food & Dining", plannedAmount: 4000, color: "#10b981" },
    { id: "shopping", category: "Shopping", plannedAmount: 4000, color: "#fb7185" },
    { id: "transport", category: "Transport", plannedAmount: 2000, color: "#38bdf8" },
    { id: "bills", category: "Bills & Utilities", plannedAmount: 1500, color: "#f59e0b" },
    { id: "health", category: "Health & Wellness", plannedAmount: 1000, color: "#34d399" },
    { id: "entertainment", category: "Entertainment", plannedAmount: 1200, color: "#818cf8" },
  ];
  const spent = Object.values(plan.categorySpentActuals).reduce((a, b) => a + b, 0);
  const total = plan.totalPlanned || 12000;
  const spentPct = Math.min(100, Math.round((spent / total) * 100)) || 70;
  return <div className="sx-mobile-page"><MobileHeader title="Plan" subtitle="Manage monthly budget" back /><main className="sx-mobile-content sx-plan-content">
    <div className="sx-month-picker"><ArrowLeft /><b>September 2026</b><ArrowRight /></div>
    <div className="sx-purpose"><span className="sx-category-icon mint"><UserRound /></span><div><small>PURPOSE <i /></small><b>Personal</b><span>Monthly spending plan · 6 categories …</span></div><button>Switch <ChevronDown /></button></div>
    <section className="sx-plan-hero"><div className="flex justify-between"><span className="sx-plan-badge">☷ Personal Plan</span><span className="sx-plan-badge muted">MONTHLY</span></div><div className="sx-plan-total">{money(plan.totalPlanned || 8420)} <small>spent of {money(total)}</small></div><div className="sx-progress dark"><i style={{ width: `${spentPct}%` }} /></div><div className="flex justify-between items-center text-sm"><b>◉ {money(Math.max(0, total - spent))} Remaining</b><span className="sx-plan-badge">{spentPct}% consumed</span></div><div className="sx-plan-stats"><span>INCOME <b>{money(plan.expectedIncome || 25000)}</b></span><span>PLANNED <b>{money(total)}</b></span><span>TOTAL SPENT <b>{money(plan.totalPlanned || 8420)}</b></span></div></section>
    <div className="sx-section-title"><h2>Category Limits <span>{categories.length} categories</span></h2><button onClick={onAddCategory}><Plus /> Add</button></div>
    {categories.map((cat) => <PlanCategory key={cat.id} name={cat.category} spent={plan.categorySpentActuals[cat.category] || (cat.category === "Shopping" ? 4420 : Math.round(cat.plannedAmount * 0.71))} planned={cat.plannedAmount} color={cat.category === "Shopping" ? "rose" : "mint"} onAdjust={(delta) => onAdjust?.(cat.id, delta)} />)}
  </main><MobileNav active="plan" /></div>;
}

function WealthHero({ breakdown, onView }: { breakdown: NetWorthBreakdown; onView?: (view: "combined" | "by-purpose") => void }) {
  const total = breakdown.total || 12200;
  return <section className="sx-dark-card sx-wealth-hero"><div className="flex items-center justify-between"><small>TOTAL WEALTH</small><span className="sx-dark-pill">◉ SpentX Tracked</span></div><strong>{money(total)}</strong><div className="sx-segment"><button className="active" onClick={() => onView?.("combined")}>Combined</button><button onClick={() => onView?.("by-purpose")}>By Category</button></div><div className="grid grid-cols-2 gap-2"><div><small>▱ Savings Goals</small><b>{money(Math.round(total * 0.67))}</b></div><div><small>↗ Investments</small><b>{money(Math.round(total * 0.33))}</b></div></div></section>;
}

export function MobileWealthView({ breakdown, accounts, onView }: { breakdown: NetWorthBreakdown; accounts: Account[]; onView?: (view: "combined" | "by-purpose") => void }) {
  const balances = computeAccountBalancesMap(accounts, []);
  const hasAccounts = accounts.length > 0;
  return <div className="sx-mobile-page"><MobileHeader title="Wealth" icon={WalletCards} /><main className="sx-mobile-content"><div className="flex items-center justify-between pb-2"><span className="sx-overview-dot">● Asset Overview</span><div className="flex gap-1"><button className="sx-soft-icon"><Eye /></button><button className="sx-soft-icon"><MoreVertical /></button></div></div><WealthHero breakdown={breakdown} onView={onView} /><div className="sx-section-title"><h2>Savings Goals <span>2</span></h2><button><Plus /> Add</button></div><div className="sx-goal"><span>🏍️</span><div><b>New Bike</b><small>Target: Dec 2026</small></div><strong>₹45,000 <i>/ ₹80,000</i><small>56% saved</small></strong><div className="sx-progress"><i style={{ width: "56%" }} /></div><small>₹35,000 remaining <em>+ Quick Deposit</em></small></div><div className="sx-goal"><span>✈️</span><div><b>Goa Trip</b><small>Target: Jan 2027</small></div><strong>₹12,000 <i>/ ₹30,000</i><small>40% saved</small></strong><div className="sx-progress"><i style={{ width: "40%" }} /></div><small>₹18,000 remaining <em>+ Quick Deposit</em></small></div><button className="sx-create"><Plus /> Create Another Goal</button><div className="sx-section-title"><div><h2>Investments</h2><small>Capital deployed directly</small></div><button><Plus /> Add</button></div><div className="sx-investments"><div className="sx-invest-total">▣ TOTAL CAPITAL INVESTED <b>₹1,15,000</b></div>{(hasAccounts ? accounts.filter((a) => ["investment", "mutual_fund", "stocks"].includes(a.type)).slice(0, 3) : []).map((a) => <div className="sx-invest-row" key={a.id}><span className="sx-category-icon blue"><Landmark /></span><div><b>{a.name}</b><small>Transfer from HDFC Bank</small></div><strong>{money(balances.get(a.id) || a.openingBalance)}<small>invested</small></strong></div>)}{!hasAccounts ? <><div className="sx-invest-row"><span className="sx-category-icon blue"><Landmark /></span><div><b>HDFC Mutual Fund</b><small>Transfer from HDFC Bank</small></div><strong>₹50,000<small>invested</small></strong></div><div className="sx-invest-row"><span className="sx-category-icon blue"><BriefcaseBusiness /></span><div><b>SBI Mutual Fund</b><small>Transfer from SBI</small></div><strong>₹25,000<small>invested</small></strong></div></> : null}</div><div className="sx-section-title"><h2>Savings</h2><small>Unallocated Pool</small></div><div className="sx-savings"><strong>₹38,500</strong><small>Available unallocated savings</small><p>ⓘ Money saved but not yet committed to a specific goal.</p><button><CirclePlus /> + Add Savings</button></div><p className="sx-on-track">⚙ Your wealth plan is 100% on schedule</p></main><MobileNav active="wealth" /></div>;
}

export function MobileAccountsView({ accounts, transactions }: { accounts: Account[]; transactions: Transaction[] }) {
  const balances = computeAccountBalancesMap(accounts, transactions);
  const bankAccounts = accounts.filter((a) => a.type === "bank");
  const displayBanks = bankAccounts.length ? bankAccounts : [{ id: "hdfc", name: "HDFC Bank", type: "bank" as const, last4: "4521", openingBalance: 8500 }];
  return <div className="sx-mobile-page"><MobileHeader title="Accounts" subtitle="Manage your money · SpentX" icon={WalletCards} /><main className="sx-mobile-content"><div className="sx-account-tabs"><button className="active"><WalletCards /> Accounts</button><Link href="/wealth"><TrendingUp /> Wealth</Link></div><section className="sx-dark-card sx-account-hero"><div className="flex justify-between"><small>Total Balance</small><span className="sx-dark-pill">● 82% Liquid</span></div><strong>{money((accounts.length ? accounts.reduce((sum, a) => sum + (balances.get(a.id) || a.openingBalance), 0) : 12640) || 12640)}</strong><p>◉ Liquid liquidity as of today</p><div className="sx-segment"><button className="active">◉ Combined</button><button>▱ By Purpose</button></div><div className="flex gap-2"><span className="sx-account-pill">● Bank: <b>₹8,500</b></span><span className="sx-account-pill">● Cash: <b>₹2,140</b></span></div></section><div className="sx-section-title"><h2>My Accounts <span>5 active</span></h2><button><CirclePlus /> Add new</button></div><div className="sx-label-row">BANK ACCOUNTS <span>2 linked</span></div>{displayBanks.map((a, index) => <div className="sx-account-card" key={a.id}><span className={`sx-account-icon ${index ? "light" : "dark"}`}><Landmark /></span><div><b>{a.name} {index === 0 ? <i>Primary</i> : null}</b><small>•••• {a.last4 || "7812"} · Personal Checking</small></div><strong>{index === 0 ? "₹8,500" : "₹0"}<small>{index === 0 ? "Active" : "Zero balance"}</small></strong><ChevronRight /></div>)}<div className="sx-label-row">CASH</div><div className="sx-account-card cash"><span className="sx-account-icon green"><Wallet /></span><div><b>Cash in Hand <i>Physical</i></b><small>Physical Wallet · Personal</small></div><strong>₹2,140</strong></div><div className="sx-label-row">WALLETS & UPI</div><div className="sx-wallet-card"><div><span className="sx-account-icon light"><CreditCard /></span><b>Paytm Wallet<small>Personal</small></b><strong>₹1,500</strong></div><div><span className="sx-account-icon purple"><Smartphone /></span><b>PhonePe Wallet<small>Family Pool</small></b><strong>₹500</strong></div></div><div className="sx-snapshot"><div><span className="sx-account-icon green"><CalendarDays /></span><b>Daily Snapshot<small>Archived cross-account balances</small></b></div><div className="sx-snapshot-inner"><b>29 Sep 2026 <em>Total: ₹45,200</em></b><span>▥ HDFC Bank <b>₹42,000</b></span><span>▣ Cash <b>₹3,200</b></span></div><button>View History <ArrowRight /></button></div><div className="sx-liquidity"><Sparkles /><b>Liquidity Ratio: 82% <small>Optimal</small><span>Healthy allocation across accessible checking …</span></b></div></main><MobileNav active="accounts" /></div>;
}
