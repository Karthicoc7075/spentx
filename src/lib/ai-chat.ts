import type { AiChatMessage } from "@/types";

export const AI_WELCOME_MESSAGE =
  "Hi! I am your AI Coach. How can I help you adjust your Monthly Plan or optimize your daily spending today?";

/** Max messages sent to Gemini for conversational context */
export const AI_CONTEXT_MESSAGE_LIMIT = 12;

export type UiChatMessage = {
  id?: string;
  sender: "user" | "ai";
  text: string;
};

export function toUiMessages(messages: AiChatMessage[]): UiChatMessage[] {
  return messages.map((message) => ({
    id: message.id,
    sender: message.role === "user" ? "user" : "ai",
    text: message.content,
  }));
}

export function toApiMessages(messages: UiChatMessage[]) {
  return messages.map((message) => ({
    sender: message.sender,
    text: message.text,
  }));
}

export function withWelcomeMessage(messages: UiChatMessage[]): UiChatMessage[] {
  if (messages.length > 0) return messages;
  return [{ sender: "ai", text: AI_WELCOME_MESSAGE }];
}