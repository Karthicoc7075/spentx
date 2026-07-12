"use client";

import { formatCurrency } from "@/lib/utils";
import type { FinancialReportData } from "@/types";

type ReportPreviewProps = {
  report: FinancialReportData | null;
};

export function ReportPreview({ report }: ReportPreviewProps) {
  if (!report) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground dark:border-white/10">
        Configure report options to preview contents before downloading.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-5 dark:border-white/10">
      <div className="border-b pb-4 dark:border-white/10">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          SpentX Report Preview
        </p>
        <h3 className="mt-1 text-lg font-semibold">{report.title}</h3>
        <p className="text-sm text-muted-foreground">{report.periodLabel}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PreviewStat label="Income" value={formatCurrency(report.totalIncome)} />
        <PreviewStat label="Expense" value={formatCurrency(report.totalExpense)} />
        <PreviewStat label="Net Savings" value={formatCurrency(report.netSavings)} />
        <PreviewStat label="Savings Rate" value={`${report.savingsRate}%`} />
      </div>

      {report.planSummary ? (
        <div className="mt-4 rounded-lg border px-3 py-3 text-sm dark:border-white/10">
          <p className="font-medium">Plan vs Actual</p>
          <p className="mt-1 text-muted-foreground">{report.planSummary.message}</p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium">Top categories</p>
          <div className="grid gap-1">
            {report.categories.slice(0, 5).map((item) => (
              <div key={item.name} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span>{formatCurrency(item.amount)} ({item.percent}%)</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Top merchants</p>
          <div className="grid gap-1">
            {report.topMerchants.map((item) => (
              <div key={item.merchant} className="flex justify-between text-sm">
                <span>{item.merchant}</span>
                <span>{formatCurrency(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-muted/30 px-3 py-3 text-sm dark:bg-black/40">
        <p className="font-medium">AI Summary</p>
        <p className="mt-1 text-muted-foreground">{report.narrative}</p>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2 dark:border-white/10">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}