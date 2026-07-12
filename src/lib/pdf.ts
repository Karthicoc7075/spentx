import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { FinancialReportData } from "@/types";

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function generateReportPdf(report: FinancialReportData) {
  const doc = new jsPDF();
  const margin = 14;
  let y = 20;

  doc.setFontSize(18);
  doc.text("SpentX Financial Report", margin, y);
  y += 10;

  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(report.title, margin, y);
  y += 6;
  doc.text(`Period: ${report.periodLabel}`, margin, y);
  y += 6;
  doc.text(
    `Generated: ${new Date(report.generatedAt).toLocaleString("en-IN")}`,
    margin,
    y,
  );
  y += 12;

  doc.setTextColor(0);
  doc.setFontSize(13);
  doc.text("Summary", margin, y);
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Metric", "Amount"]],
    body: [
      ["Total Income", formatInr(report.totalIncome)],
      ["Total Expense", formatInr(report.totalExpense)],
      ["Net Savings", formatInr(report.netSavings)],
      ["Savings Rate", `${report.savingsRate}%`],
    ],
    theme: "grid",
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 12;

  if (report.planSummary) {
    doc.setFontSize(13);
    doc.text("Plan vs Actual", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Planned", "Actual", "Variance"]],
      body: [
        [
          formatInr(report.planSummary.plannedTotal),
          formatInr(report.planSummary.actualTotal),
          `${report.planSummary.variancePercent}%`,
        ],
      ],
      theme: "grid",
      styles: { fontSize: 10 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 6;
    doc.setFontSize(10);
    doc.text(report.planSummary.message, margin, y, { maxWidth: 180 });
    y += 14;
  }

  doc.setFontSize(13);
  doc.text("Category Breakdown", margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    head: [["Category", "Amount", "%"]],
    body: report.categories.map((item) => [
      item.name,
      formatInr(item.amount),
      `${item.percent}%`,
    ]),
    theme: "striped",
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 41, 59] },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY + 12;

  if (report.topMerchants.length > 0) {
    doc.setFontSize(13);
    doc.text("Top Merchants", margin, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [["Merchant", "Amount"]],
      body: report.topMerchants.map((item) => [
        item.merchant,
        formatInr(item.amount),
      ]),
      theme: "striped",
      styles: { fontSize: 10 },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 12;
  }

  doc.setFontSize(13);
  doc.text("AI Summary", margin, y);
  y += 8;
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(report.narrative, 180);
  doc.text(lines, margin, y);

  return doc;
}

export function downloadReportPdf(report: FinancialReportData) {
  const doc = generateReportPdf(report);
  const slug = report.periodLabel.replace(/\s+/g, "-").toLowerCase();
  doc.save(`spentx-report-${slug}.pdf`);
}