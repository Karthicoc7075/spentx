"use client";

import { Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { ReportPreview } from "@/components/reports/ReportPreview";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/hooks/useCategories";
import { useMonthlyPlanQuery } from "@/hooks/useMonthlyPlanQuery";
import { useTransactions } from "@/hooks/useTransactions";
import { downloadReportPdf } from "@/lib/pdf";
import {
  buildFinancialReport,
  buildReportFilters,
  getReportPlanMonth,
} from "@/lib/reports";
import type { ReportType } from "@/types";

type PDFReportGeneratorProps = {
  compact?: boolean;
  footer?: boolean;
};

export function PDFReportGenerator({
  compact = false,
  footer = false,
}: PDFReportGeneratorProps) {
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const [reportType, setReportType] = useState<ReportType>("monthly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filters = buildReportFilters(
    reportType,
    dateFrom || undefined,
    dateTo || undefined,
  );
  const planMonth = getReportPlanMonth(filters);
  const { data: plan } = useMonthlyPlanQuery(
    reportType === "plan-vs-actual" ? planMonth : "",
  );

  const report = useMemo(
    () =>
      buildFinancialReport({
        transactions,
        categories,
        plan: reportType === "plan-vs-actual" ? plan : undefined,
        type: reportType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [transactions, categories, plan, reportType, dateFrom, dateTo],
  );

  if (footer) {
    return (
      <Button variant="outline" onClick={() => downloadReportPdf(report)}>
        <Download className="size-4" />
        Download PDF Report
      </Button>
    );
  }

  return (
    <Card className={compact ? "border-dashed" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          PDF Reports
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: "monthly", label: "Monthly" },
              { value: "custom", label: "Custom range" },
              { value: "plan-vs-actual", label: "Plan vs Actual" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                reportType === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground dark:border-white/10"
              }`}
              type="button"
              onClick={() => setReportType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {reportType === "custom" || reportType === "plan-vs-actual" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        ) : null}

        <ReportPreview report={report} />

        <Button className="w-fit" onClick={() => downloadReportPdf(report)}>
          <Download className="size-4" />
          Download PDF
        </Button>
      </CardContent>
    </Card>
  );
}