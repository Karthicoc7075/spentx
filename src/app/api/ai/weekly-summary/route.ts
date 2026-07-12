import { NextResponse } from "next/server";
import { generateWeeklySummary } from "@/lib/ai/generateSummary";
import type { SummaryContext } from "@/lib/ai/generateSummary";

export async function POST(request: Request) {
  try {
    const context = (await request.json()) as SummaryContext;
    const summary = await generateWeeklySummary(context);
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(
      { error: "Failed to generate summary" },
      { status: 500 },
    );
  }
}