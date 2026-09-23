import { NextRequest, NextResponse } from "next/server";
import { getGeminiClient } from "@/lib/gemini-client";
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  getFallbackModelId,
  isValidModelId,
} from "@/lib/models";

export const runtime = "nodejs";

function formatFallbackReason(err: unknown): string {
  if (!err) return "Primary health probe failed";
  const str = err instanceof Error ? err.message : String(err);
  if (str.includes("503") || str.includes("high demand") || str.includes("UNAVAILABLE")) {
    return "Model is currently experiencing high demand (503). Verified connectivity via fallback.";
  }
  if (str.includes("429") || str.includes("quota") || str.includes("ResourceExhausted")) {
    return "Rate limit / quota on primary model. Verified connectivity via fallback.";
  }
  return str.length > 150 ? `${str.slice(0, 147)}...` : str;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modelParam = searchParams.get("model");
  const requestedModel =
    modelParam && isValidModelId(modelParam) ? modelParam : DEFAULT_MODEL_ID;

  let ai;
  try {
    ai = getGeminiClient();
  } catch {
    return NextResponse.json(
      {
        connected: false,
        requestedModel,
        actualModel: null,
        fallbackUsed: false,
        error: "GEMINI_API_KEY environment variable is not configured",
      },
      { status: 500 }
    );
  }

  try {
    // 1. Probe with exact requested model
    try {
      const response = await ai.models.generateContent({
        model: requestedModel,
        contents: "Reply only with: OK",
      });

      const text = response.text ?? "";
      if (text.includes("OK")) {
        return NextResponse.json({
          connected: true,
          requestedModel,
          actualModel: requestedModel,
          fallbackUsed: false,
          fallbackReason: null,
          model: requestedModel,
        });
      }

      return NextResponse.json(
        {
          connected: false,
          requestedModel,
          actualModel: null,
          fallbackUsed: false,
          error: "Model did not return valid health probe response",
        },
        { status: 502 }
      );
    } catch (primaryError) {
      const cleanReason = formatFallbackReason(primaryError);

      // 2. Candidate fallbacks
      const candidates = [
        getFallbackModelId(requestedModel),
        FALLBACK_MODEL_ID,
      ].filter((m, idx, arr) => m !== requestedModel && arr.indexOf(m) === idx);

      for (const fallbackModel of candidates) {
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: fallbackModel,
            contents: "Reply only with: OK",
          });

          const fallbackText = fallbackResponse.text ?? "";
          if (fallbackText.includes("OK")) {
            return NextResponse.json({
              connected: true,
              requestedModel,
              actualModel: fallbackModel,
              fallbackUsed: true,
              fallbackReason: cleanReason,
              model: fallbackModel,
            });
          }
        } catch {
          // Continue to next candidate
        }
      }

      throw primaryError;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Health check failed";

    return NextResponse.json(
      {
        connected: false,
        requestedModel,
        actualModel: null,
        fallbackUsed: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
