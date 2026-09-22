import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  isValidModelId,
} from "@/lib/models";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const modelParam = searchParams.get("model");
  const requestedModel =
    modelParam && isValidModelId(modelParam) ? modelParam : DEFAULT_MODEL_ID;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
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
    const ai = new GoogleGenAI({ apiKey });

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
      console.warn(
        `Health probe for "${requestedModel}" failed:`,
        primaryError
      );

      // 2. Fallback policy if requested model probe failed
      if (requestedModel !== FALLBACK_MODEL_ID) {
        console.warn(`Health probe attempting fallback to ${FALLBACK_MODEL_ID}...`);
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: FALLBACK_MODEL_ID,
            contents: "Reply only with: OK",
          });

          const fallbackText = fallbackResponse.text ?? "";
          if (fallbackText.includes("OK")) {
            return NextResponse.json({
              connected: true,
              requestedModel,
              actualModel: FALLBACK_MODEL_ID,
              fallbackUsed: true,
              fallbackReason:
                primaryError instanceof Error
                  ? primaryError.message
                  : "Primary model health check failed",
              model: FALLBACK_MODEL_ID,
            });
          }
        } catch (fallbackError) {
          console.error("Health probe fallback failed:", fallbackError);
        }
      }

      throw primaryError;
    }
  } catch (error) {
    console.error("Gemini health check failed:", error);

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
