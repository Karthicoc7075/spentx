"use client";

import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAiChatHistory } from "@/hooks/useAiChatHistory";
import {
  AI_CONTEXT_MESSAGE_LIMIT,
  toApiMessages,
  toUiMessages,
  withWelcomeMessage,
  type UiChatMessage,
} from "@/lib/ai-chat";
import { cn } from "@/lib/utils";
import type { MonthlyPlan, Transaction } from "@/types";

const quickPrompts = [
  "Where can I save ₹5,000 this month?",
  "How does my dining budget compare to my total spending?",
  "Am I on track with my monthly plan?",
];

type AiCoachDrawerProps = {
  plan?: MonthlyPlan | null;
  transactions: Transaction[];
};

export function AiCoachDrawer({ plan, transactions }: AiCoachDrawerProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<UiChatMessage[]>([]);
  const { messages, appendMessage, clearHistory } = useAiChatHistory();

  const displayMessages = useMemo(
    () => withWelcomeMessage([...toUiMessages(messages), ...pendingMessages]),
    [messages, pendingMessages],
  );

  const financialContext = useMemo(
    () => ({
      expectedIncome: plan?.expectedIncome ?? 0,
      totalPlanned: plan?.totalPlanned ?? 0,
      transactions: transactions.slice(0, 20).map((transaction) => ({
        date: transaction.date,
        merchant: transaction.merchant,
        category: transaction.category,
        amount: transaction.amount,
        type: transaction.type,
      })),
    }),
    [plan, transactions],
  );

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const userMessage: UiChatMessage = { sender: "user", text: trimmed };
    const nextMessages = [...displayMessages, userMessage];
    setInput("");
    setPendingMessages((current) => [...current, userMessage]);
    setIsSending(true);

    try {
      await appendMessage("user", trimmed);

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: toApiMessages(nextMessages).slice(-AI_CONTEXT_MESSAGE_LIMIT),
          financialContext,
        }),
      });

      const json = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !json.reply) {
        throw new Error(json.error ?? "Failed to get a response.");
      }

      await appendMessage("assistant", json.reply);
    } catch (error) {
      const fallback =
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again.";
      await appendMessage("assistant", fallback);
    } finally {
      setPendingMessages([]);
      setIsSending(false);
    }
  }

  return (
    <>
      <Button
        aria-label="Open AI Coach"
        className="fixed right-5 bottom-5 z-40 size-14 rounded-full bg-gradient-to-br from-[#a49af3] to-[#8b7ff0] text-white shadow-xl shadow-[#8b7ff0]/35 ring-4 ring-[#8b7ff0]/15 transition-all duration-200 hover:scale-105 hover:shadow-[#8b7ff0]/45 active:scale-95"
        size="icon"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
          side="right"
        >
          <SheetHeader className="border-b px-5 py-4">
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <SheetTitle className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <Sparkles className="size-4" />
                  </span>
                  AI Coach
                </SheetTitle>
                <SheetDescription>
                  Ask about your plan, spending, and savings.
                </SheetDescription>
              </div>
              <Button
                className="shrink-0"
                variant="ghost"
                onClick={() => void clearHistory()}
              >
                <Trash2 className="size-3.5" />
                Clear
              </Button>
            </div>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {displayMessages.map((message, index) => (
              <div
                key={message.id ?? `message-${index}`}
                className={cn(
                  "max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                  message.sender === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {message.text}
              </div>
            ))}
            {isSending ? (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Thinking...
              </div>
            ) : null}
          </div>

          <div className="space-y-3 border-t px-4 py-4">
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                className="min-h-11 resize-none"
                placeholder="Ask your coach..."
                rows={2}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
              />
              <Button
                disabled={!input.trim() || isSending}
                size="icon"
                onClick={() => void sendMessage(input)}
              >
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}