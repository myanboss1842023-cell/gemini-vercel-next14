import { NextRequest } from "next/server";
import { getGeminiClient } from "@/lib/gemini-client";
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

export async function POST(req: NextRequest) {
  let requestedModel = DEFAULT_MODEL_ID;

  try {
    const body = (await req.json()) as { prompt?: unknown; model?: unknown };

    if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Prompt is required",
          requestedModel,
          actualModel: null,
          fallbackUsed: false,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (typeof body.model === "string" && isValidModelId(body.model)) {
      requestedModel = body.model;
    } else if (typeof body.model === "string") {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid or unsupported model: ${body.model}`,
          requestedModel: body.model,
          actualModel: null,
          fallbackUsed: false,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let ai;
    try {
      ai = getGeminiClient();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "GEMINI_API_KEY environment variable is not configured",
          requestedModel,
          actualModel: null,
          fallbackUsed: false,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    let activeStream: AsyncIterable<{ text?: string }> | null = null;
    let actualModel = requestedModel;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;

    // 1. Attempt streaming with requested model
    try {
      activeStream = await ai.models.generateContentStream({
        model: requestedModel,
        contents: body.prompt,
      });
    } catch (primaryError) {
      fallbackReason = formatFallbackReason(primaryError);

      // Attempt fallback
      const primaryFallback = getFallbackModelId(requestedModel);
      const candidates = [primaryFallback, FALLBACK_MODEL_ID].filter(
        (m, idx, arr) => m !== requestedModel && arr.indexOf(m) === idx
      );

      for (const candidate of candidates) {
        try {
          activeStream = await ai.models.generateContentStream({
            model: candidate,
            contents: body.prompt,
          });
          actualModel = candidate;
          fallbackUsed = true;
          break;
        } catch {
          // Continue to next candidate
        }
      }

      if (!activeStream) {
        throw primaryError;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (activeStream) {
            for await (const chunk of activeStream) {
              const chunkText = chunk.text ?? "";
              if (chunkText) {
                controller.enqueue(encoder.encode(chunkText));
              }
            }
          }
          controller.close();
        } catch (streamErr) {
          controller.error(streamErr);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache, no-transform",
        "X-Requested-Model": requestedModel,
        "X-Actual-Model": actualModel,
        "X-Fallback-Used": fallbackUsed ? "true" : "false",
        "X-Fallback-Reason": fallbackReason ? encodeURIComponent(fallbackReason) : "",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stream generation failed";

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        requestedModel,
        actualModel: null,
        fallbackUsed: false,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
