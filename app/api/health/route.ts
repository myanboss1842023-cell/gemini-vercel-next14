import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: "Reply only with: OK",
    });

    const text = response.text ?? "";

    if (text.includes("OK")) {
      return NextResponse.json({
        connected: true,
        model: "gemini-3.5-flash-lite",
      });
    }

    return NextResponse.json({ connected: false });
  } catch (error) {
    console.error("Gemini health check failed:", error);

    const message =
      error instanceof Error ? error.message : "Health check failed";

    return NextResponse.json(
      {
        connected: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
