import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  getFallbackModelId,
  isValidModelId,
} from "@/lib/models";

export const runtime = "nodejs";

function formatFallbackReason(err: unknown): string {
  if (!err) return "Primary model unavailable";
  const str = err instanceof Error ? err.message : String(err);
  if (str.includes("503") || str.includes("high demand") || str.includes("UNAVAILABLE")) {
    return "This model is currently experiencing high demand (503). Automatic fallback was activated.";
  }
  if (str.includes("429") || str.includes("quota") || str.includes("ResourceExhausted")) {
    return "Rate limit / quota exceeded on primary model. Automatic fallback was activated.";
  }
  if (str.includes("404") || str.includes("NOT_FOUND")) {
    return "Requested model was not found or is currently decommissioned.";
  }
  return str.length > 150 ? `${str.slice(0, 147)}...` : str;
}

export async function POST(req: Request) {
  let requestedModel = DEFAULT_MODEL_ID;

  try {
    const body = (await req.json()) as { prompt?: unknown; model?: unknown };

    if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Prompt is required",
          requestedModel,
          actualModel: null,
          fallbackUsed: false,
        },
        { status: 400 }
      );
    }

    if (typeof body.model === "string" && isValidModelId(body.model)) {
      requestedModel = body.model;
    } else if (typeof body.model === "string") {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid or unsupported model: ${body.model}`,
          requestedModel: body.model,
          actualModel: null,
          fallbackUsed: false,
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "GEMINI_API_KEY environment variable is not configured",
          requestedModel,
          actualModel: null,
          fallbackUsed: false,
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    // 1. Attempt with exact requested model
    try {
      const response = await ai.models.generateContent({
        model: requestedModel,
        contents: body.prompt,
      });

      return NextResponse.json({
        success: true,
        text: response.text ?? "",
        requestedModel,
        actualModel: requestedModel,
        fallbackUsed: false,
        fallbackReason: null,
      });
    } catch (primaryError) {
      const cleanReason = formatFallbackReason(primaryError);

      // Determine candidate fallback models
      const primaryFallback = getFallbackModelId(requestedModel);
      const candidates = [
        primaryFallback,
        FALLBACK_MODEL_ID,
      ].filter((m, idx, arr) => m !== requestedModel && arr.indexOf(m) === idx);

      for (const fallbackModel of candidates) {
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: fallbackModel,
            contents: body.prompt,
          });

          return NextResponse.json({
            success: true,
            text: fallbackResponse.text ?? "",
            requestedModel,
            actualModel: fallbackModel,
            fallbackUsed: true,
            fallbackReason: cleanReason,
          });
        } catch {
          // Continue to next fallback candidate if available
        }
      }

      // If all fallbacks failed, throw the primary error to be handled below
      throw primaryError;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gemini API request failed";

    return NextResponse.json(
      {
        success: false,
        error: message,
        requestedModel,
        actualModel: null,
        fallbackUsed: false,
      },
      { status: 500 }
    );
  }
}
