import { NextResponse } from "next/server";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { requireAiCaller } from "@/lib/server/ai-guard";

async function handler(request: Request) {
  const caller = await requireAiCaller("ai");
  if ("response" in caller) return caller.response;
  try {
    const { messages: rawMessages, financialContext } = await request.json();
    const messages = Array.isArray(rawMessages) ? rawMessages.slice(-20) : [];
    
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not configured. Please paste your Gemini key in .env.local" },
        { status: 500 }
      );
    }

    const systemPrompt = `You are a helpful, friendly, and expert personal finance AI Coach for SpentX.
You have access to the user's current monthly summary stats to give precise advice.
Context:
- Monthly Income: ₹${financialContext?.expectedIncome || "0"}
- Monthly Expense Budget: ₹${financialContext?.totalPlanned || "0"}
- Recent transactions (up to 20):
${JSON.stringify(financialContext?.transactions || [])}

Rules:
- Be concise, supportive, and action-oriented.
- Highlight specific numbers (e.g. food spent, remaining balance) when referencing data.
- Suggest realistic savings adjustments.
- Format your response with clear, bulleted markdown. Keep answers brief (under 150 words).`;

    // Map conversation history (sender/text or role/content) to Gemini format
    const contents = messages.map((m: {
      sender?: string;
      text?: string;
      role?: string;
      content?: string;
    }) => {
      const role =
        m.role === "user" || m.sender === "user" ? "user" : "model";
      const text = m.content ?? m.text ?? "";
      return { role, parts: [{ text }] };
    });

    // Prepend the system prompt structure safely to the first user turn
    if (contents.length > 0) {
      contents[0].parts[0].text = `${systemPrompt}\n\nUser: ${contents[0].parts[0].text}`;
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contents }),
      }
    );

    if (!response.ok) {
      console.error("Gemini API error:", response.status, await response.text());
      return NextResponse.json(
        { error: "The AI coach is unavailable right now. Try again later." },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I apologize, I could not compute a response.";

    return NextResponse.json({ reply });
  } catch (error: unknown) {
    console.error("AI Coach API error:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}

export const POST = withRouteLogging("ai", "route_handler", handler);
