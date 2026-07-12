"use client";

import { useInvestments } from "@/hooks/useInvestments";
import { useTransactions } from "@/hooks/useTransactions";
import {
  buildInvestmentRecord,
  buildInvestmentTransaction,
  type InvestmentFormValues,
} from "@/lib/investments";

export function useInvestmentEntry() {
  const { addTransaction } = useTransactions();
  const { addInvestment } = useInvestments();

  async function saveInvestmentEntry(values: InvestmentFormValues) {
    const investmentId = crypto.randomUUID();
    const savedTransaction = await addTransaction(
      buildInvestmentTransaction(values, investmentId),
    );
    const savedInvestment = await addInvestment(
      buildInvestmentRecord(values, savedTransaction.id),
      investmentId,
    );

    return { transaction: savedTransaction, investment: savedInvestment };
  }

  return { saveInvestmentEntry };
}