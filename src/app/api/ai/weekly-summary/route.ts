import { NextResponse } from "next/server";
import { generateWeeklySummary } from "@/lib/ai/generateSummary";
import type { SummaryContext } from "@/lib/ai/generateSummary";
import { withRouteLogging } from "@/lib/server/with-route-logging";
import { requireAiCaller } from "@/lib/server/ai-guard";

async function handler(request: Request) {
  const caller = await requireAiCaller("ai/weekly-summary");
  if ("response" in caller) return caller.response;
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
export const POST = withRouteLogging("ai/weekly-summary", "route_handler", handler);
