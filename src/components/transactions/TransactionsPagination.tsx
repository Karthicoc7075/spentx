"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const TRANSACTION_PAGE_SIZES = [30, 50, 100, 200] as const;
export type TransactionPageSize = (typeof TRANSACTION_PAGE_SIZES)[number];

type TransactionsPaginationProps = {
  currentPage: number;
  pageSize: TransactionPageSize;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: TransactionPageSize) => void;
};

export function TransactionsPagination({
  currentPage,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: TransactionsPaginationProps) {
  if (totalCount === 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize) || 1);
  const start = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalCount);

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => {
      if (totalPages <= 5) return true;
      if (page === 1 || page === totalPages) return true;
      return Math.abs(page - currentPage) <= 1;
    });

  return (
    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {totalCount === 0
          ? "Showing 0 transactions"
          : `Showing ${start}–${end} of ${totalCount} transactions`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Rows per page
          <select
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
            value={pageSize}
            onChange={(event) =>
              onPageSizeChange(Number(event.target.value) as TransactionPageSize)
            }
          >
            {TRANSACTION_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous page"
            disabled={currentPage <= 1}
            size="icon-sm"
            variant="outline"
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>

          {pageNumbers.map((page, index) => {
            const prev = pageNumbers[index - 1];
            const showEllipsis = prev != null && page - prev > 1;

            return (
              <span key={page} className="inline-flex items-center gap-1">
                {showEllipsis ? (
                  <span className="px-1 text-sm text-muted-foreground">…</span>
                ) : null}
                <Button
                  className="min-w-8"
                  variant={page === currentPage ? "default" : "outline"}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </Button>
              </span>
            );
          })}

          <Button
            aria-label="Next page"
            disabled={currentPage >= totalPages}
            size="icon-sm"
            variant="outline"
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}