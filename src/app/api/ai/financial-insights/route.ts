import { NextResponse } from "next/server";
import { generateFinancialInsights } from "@/lib/ai/financial-insights";
import type { FinancialInsightContext } from "@/types";
import { withRouteLogging } from "@/lib/server/with-route-logging";

async function handler(request: Request) {
  try {
    const { context } = (await request.json()) as {
      context?: FinancialInsightContext;
    };

    if (!context?.month) {
      return NextResponse.json(
        { error: "Financial insight context is required." },
        { status: 400 },
      );
    }

    const insight = await generateFinancialInsights(context);
    return NextResponse.json({ insight });
  } catch (error) {
    console.error("Financial insights API error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate financial insights.",
      },
      { status: 500 },
    );
  }
}
export const POST = withRouteLogging("ai/financial-insights", "route_handler", handler);
