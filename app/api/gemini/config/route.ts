import { NextResponse } from "next/server";
import {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_ID,
  FALLBACK_MODEL_ID,
} from "@/lib/models";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    models: SUPPORTED_MODELS,
    defaultModelId: DEFAULT_MODEL_ID,
    fallbackModelId: FALLBACK_MODEL_ID,
  });
}
