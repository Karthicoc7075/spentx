"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearAiChatHistory,
  saveAiChatMessage,
  subscribeToAiChatHistory,
} from "@/lib/firebase";
import { useAuthReady } from "@/hooks/useAuthReady";
import type { AiChatMessage, AiChatRole } from "@/types";

export function useAiChatHistory() {
  const { user, isConfigured, isReady } = useAuthReady();
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (isConfigured && !isReady) return;

    if (!user?.id) {
      setMessages([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);

    const unsubscribe = subscribeToAiChatHistory(
      user.id,
      (nextMessages) => {
        setMessages(nextMessages);
        setIsLoading(false);
        setError(null);
      },
      (subscribeError) => {
        setError(subscribeError);
        setIsLoading(false);
      },
    );

    return unsubscribe;
  }, [isConfigured, isReady, user?.id]);

  const appendMessage = useCallback(
    async (role: AiChatRole, content: string) => {
      return saveAiChatMessage(user?.id, { role, content });
    },
    [user?.id],
  );

  const clearHistory = useCallback(async () => {
    await clearAiChatHistory(user?.id);
    setMessages([]);
  }, [user?.id]);

  return {
    messages,
    isLoading,
    error,
    appendMessage,
    clearHistory,
    isPersisted: Boolean(user?.id),
  };
}