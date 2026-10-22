import assert from 'node:assert/strict';
import { isConfirmedTransaction, computePeriodTotals, sumPeriodOutingSpend } from '../src/lib/period-totals';
import { computeAccountBalancesMap } from '../src/lib/wealth';
import { computeClosingBalance } from '../src/lib/balance-carryover';
import { computeCategorySpentActuals } from '../src/lib/plan';
import { buildCategoryTotals } from '../src/lib/category-totals';
import { computeHeroStats, computeTopMerchants } from '../src/lib/analytics';
import { financialOutingExpenses, computeTripSummary, computeOutingRollupAmount, computeOutingUserPaidAmount } from '../src/lib/outings';
import { isOutingSpendStatus } from '../src/lib/outing-sync';
import { isSpendingExpense, sumInvestments } from '../src/lib/investments';
import { filterTransactions } from '../src/lib/utils';
import { createDefaultGlobalFilters } from '../src/lib/filter-defaults';
import type { Account, Outing, OutingExpense, Transaction, TransactionStatus } from '../src/types';

const tx = (partial: Partial<Transaction> = {}): Transaction => ({
  id: 'tx', merchant: 'Shop', source: 'manual', transactionDate: '2026-10-22',
  date: '2026-10-22', totalAmount: 100, amount: 100, type: 'expense',
  category: 'Food', accountId: 'bank', account: 'Bank', status: 'completed', ...partial,
});
const account: Account = { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 1000 };
const outing: Outing = { id: 'trip', name: 'Trip', startDate: '2026-10-22',
  status: 'active', members: [{ id: 'you', name: 'You', isCurrentUser: true }], autoAddMode: true };
const expense: OutingExpense = { id: 'expense', outingId: 'trip', description: 'Shop',
  amount: 100, category: 'Food', date: '2026-10-22', paidByMemberId: 'you',
  splitType: 'equally', splits: [], source: 'bank-detected', linkedTransactionId: 'tx' };
let passed = 0;
function check(name: string, fn: () => void) { fn(); passed++; console.log(`✓ ${name}`); }
for (const status of ['unknown', 'pending', 'failed', 'cancelled', 'reversed', 'unverified', 'rejected', 'unexpected'] as TransactionStatus[]) {
  check(`${status}: spending, balance, budget, analytics and outing exclusion; review preserved`, () => {
    const row = tx({ status }); const before = JSON.stringify(row);
    assert.equal(isConfirmedTransaction(row), false);
    assert.equal(isSpendingExpense(row), false);
    assert.equal(computePeriodTotals([row]).expense, 0);
    assert.equal(computeAccountBalancesMap([account], [row]).get('bank'), 1000);
    assert.equal(computeClosingBalance(1000, [row]), 1000);
    assert.deepEqual(computeCategorySpentActuals([row], '2026-10'), {});
    assert.deepEqual(buildCategoryTotals([row], []), []);
    assert.equal(computeHeroStats([row]).totalExpense, 0);
    assert.deepEqual(computeTopMerchants([row]), []);
    assert.equal(sumInvestments([tx({ status, category: 'Investment' })]), 0);
    const tagged = { ...row, outingId: 'trip' };
    assert.equal(isOutingSpendStatus(tagged), false);
    assert.equal(sumPeriodOutingSpend([tagged]), 0);
    assert.equal(computeOutingRollupAmount([], undefined, [tagged], 'trip'), 0);
    assert.equal(computeOutingRollupAmount([expense], undefined, [tagged], 'trip'), 0);
    assert.equal(computeOutingUserPaidAmount(outing, [expense], [tagged]), 0);
    assert.equal(computeTripSummary(outing, financialOutingExpenses([expense], [tagged]), []).totalSpent, 0);
    assert.equal(expense.amount, 100);
    assert.equal(filterTransactions([row], createDefaultGlobalFilters()).length, 1);
    assert.equal(JSON.stringify(row), before);
  });
}
check('confirmed, Needs category and Unassigned spending remain; unassigned moves no account', () => {
  const rows = [tx(), tx({ id: 'category', category: 'Needs category' }),
    tx({ id: 'unassigned', accountId: undefined, account: undefined })];
  assert.equal(computePeriodTotals(rows).expense, 300);
  assert.equal(computeAccountBalancesMap([account], rows).get('bank'), 800);
  assert.equal(computeCategorySpentActuals(rows, '2026-10').Food, 200);
  assert.equal(computeOutingRollupAmount([], undefined, rows.map(t => ({ ...t, outingId: 'trip' })), 'trip'), 300);
  assert.equal(isConfirmedTransaction(tx({ status: undefined })), true);
});
check('refunded original, repayment and transfers retain existing accounting', () => {
  const original = tx({ status: 'refunded' });
  const repayment = tx({ id: 'return', type: 'income', category: 'Friend Returns', totalAmount: 30, amount: 30 });
  const transfer = tx({ id: 'transfer', category: 'Transfer', tags: ['transfer'], totalAmount: 20, amount: 20 });
  assert.deepEqual(computePeriodTotals([original, repayment, transfer]), {
    income: 0, grossExpense: 100, reimbursements: 30, expense: 70, net: -70,
  });
  assert.equal(computePeriodTotals([original, { ...repayment, status: 'unknown' }]).expense, 100);
  assert.equal(computeAccountBalancesMap([account], [original, repayment]).get('bank'), 930);
});
check('unknown rollup cannot hide a confirmed spend', () => {
  const spend = tx({ outingId: 'trip' });
  const rollup = tx({ id: 'rollup', outingId: 'trip', status: 'unknown', tags: ['outing-rollup'], totalAmount: 900 });
  assert.equal(computePeriodTotals([spend, rollup]).expense, 100);
});
console.log(`All ${passed} financial-status checks passed`);
