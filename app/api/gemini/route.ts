import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
]);

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { prompt?: unknown; model?: unknown };

    if (typeof body.prompt !== "string" || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Prompt is required" },
        { status: 400 }
      );
    }

    const model =
      typeof body.model === "string" && ALLOWED_MODELS.has(body.model)
        ? body.model
        : "gemini-flash-latest";

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model,
      contents: body.prompt,
    });

    return NextResponse.json({
      success: true,
      text: response.text,
    });
  } catch (error) {
    console.error("Gemini API request failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Gemini API request failed",
      },
      { status: 500 }
    );
  }
}
