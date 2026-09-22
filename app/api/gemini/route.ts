import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import {
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
  isValidModelId,
} from "@/lib/models";

export const runtime = "nodejs";

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

    // 1. Attempt with the exact requested model
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
      console.warn(
        `Primary model request for "${requestedModel}" failed:`,
        primaryError
      );

      // 2. Explicit Fallback policy if requested model fails and is not already fallback
      if (requestedModel !== FALLBACK_MODEL_ID) {
        console.warn(`Attempting fallback to ${FALLBACK_MODEL_ID}...`);
        try {
          const fallbackResponse = await ai.models.generateContent({
            model: FALLBACK_MODEL_ID,
            contents: body.prompt,
          });

          return NextResponse.json({
            success: true,
            text: fallbackResponse.text ?? "",
            requestedModel,
            actualModel: FALLBACK_MODEL_ID,
            fallbackUsed: true,
            fallbackReason:
              primaryError instanceof Error
                ? primaryError.message
                : "Primary model failed",
          });
        } catch (fallbackError) {
          console.error("Fallback model request also failed:", fallbackError);
          throw primaryError;
        }
      }

      throw primaryError;
    }
  } catch (error) {
    console.error("Gemini API request failed:", error);

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
