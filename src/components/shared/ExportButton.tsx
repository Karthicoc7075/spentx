"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCategories } from "@/hooks/useCategories";
import { useTransactions } from "@/hooks/useTransactions";
import { downloadReportPdf } from "@/lib/pdf";
import { buildFinancialReport } from "@/lib/reports";
import { useToast } from "@/providers/toast-provider";

export function ExportButton() {
  const { transactions } = useTransactions();
  const { categories } = useCategories();
  const { notify } = useToast();

  function handleExport() {
    try {
      const report = buildFinancialReport({
        transactions,
        categories,
        type: "monthly",
      });
      downloadReportPdf(report);
      notify({ title: "Report exported" });
    } catch {
      notify({
        title: "Export failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Button className="gap-2 px-4" type="button" onClick={handleExport}>
      <Download className="size-4" />
      Export
    </Button>
  );
}
