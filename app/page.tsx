"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  SUPPORTED_MODELS,
  DEFAULT_MODEL_ID,
  getModelDisplayName,
  GeminiModelConfig,
} from "@/lib/models";

type HealthState =
  | { status: "idle" }
  | {
      status: "connected";
      requestedModel: string;
      actualModel: string;
      fallbackUsed: boolean;
      fallbackReason?: string | null;
    }
  | {
      status: "disconnected";
      requestedModel?: string;
      error?: string;
    };

interface LastExecutionDiagnostics {
  requestedModelId: string;
  actualModelId: string;
  fallbackUsed: boolean;
  fallbackReason?: string | null;
  timestamp: string;
  source: "generate" | "health_check";
}

export default function HomePage() {
  const [models, setModels] = useState<GeminiModelConfig[]>(SUPPORTED_MODELS);
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [responseText, setResponseText] = useState("");
  const [sendError, setSendError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [health, setHealth] = useState<HealthState>({ status: "idle" });
  const [lastExecution, setLastExecution] = useState<LastExecutionDiagnostics | null>(null);

  useEffect(() => {
    // Single source of truth sync from authoritative server config
    fetch("/api/gemini/config")
      .then((res) => res.json())
      .then((data: { models?: GeminiModelConfig[]; defaultModelId?: string }) => {
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
        }
        if (data.defaultModelId) {
          setSelectedModelId(data.defaultModelId);
        }
      })
      .catch((err) => {
        console.warn("Failed to load /api/gemini/config:", err);
      });
  }, []);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!prompt.trim()) {
      setSendError("Please enter a prompt.");
      setResponseText("");
      return;
    }

    setIsSending(true);
    setSendError("");
    setResponseText("");

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          model: selectedModelId,
        }),
      });

      const data: {
        success?: boolean;
        text?: string;
        requestedModel?: string;
        actualModel?: string;
        fallbackUsed?: boolean;
        fallbackReason?: string | null;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gemini API request failed");
      }

      setResponseText(data.text || "");

      const actual = data.actualModel || selectedModelId;
      const requested = data.requestedModel || selectedModelId;
      const fallback = Boolean(data.fallbackUsed);

      setHealth({
        status: "connected",
        requestedModel: requested,
        actualModel: actual,
        fallbackUsed: fallback,
        fallbackReason: data.fallbackReason,
      });

      setLastExecution({
        requestedModelId: requested,
        actualModelId: actual,
        fallbackUsed: fallback,
        fallbackReason: data.fallbackReason,
        timestamp: new Date().toLocaleTimeString(),
        source: "generate",
      });
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Gemini API request failed"
      );
    } finally {
      setIsSending(false);
    }
  }

  async function handleHealthCheck() {
    setIsTesting(true);
    setHealth({ status: "idle" });

    try {
      const res = await fetch(
        `/api/health?model=${encodeURIComponent(selectedModelId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data: {
        connected?: boolean;
        requestedModel?: string;
        actualModel?: string;
        fallbackUsed?: boolean;
        fallbackReason?: string | null;
        model?: string;
        error?: string;
      } = await res.json();

      if (data.connected) {
        const actual = data.actualModel || data.model || selectedModelId;
        const requested = data.requestedModel || selectedModelId;
        const fallback = Boolean(data.fallbackUsed);

        setHealth({
          status: "connected",
          requestedModel: requested,
          actualModel: actual,
          fallbackUsed: fallback,
          fallbackReason: data.fallbackReason,
        });

        setLastExecution({
          requestedModelId: requested,
          actualModelId: actual,
          fallbackUsed: fallback,
          fallbackReason: data.fallbackReason,
          timestamp: new Date().toLocaleTimeString(),
          source: "health_check",
        });
        return;
      }

      setHealth({
        status: "disconnected",
        requestedModel: data.requestedModel || selectedModelId,
        error: data.error,
      });
    } catch (error) {
      setHealth({
        status: "disconnected",
        requestedModel: selectedModelId,
        error: error instanceof Error ? error.message : "Health check failed",
      });
    } finally {
      setIsTesting(false);
    }
  }

  const selectedModelConfig = models.find((m) => m.id === selectedModelId);

  return (
    <main className="shell">
      <div className="container">
        <header className="header">
          <p className="eyebrow">Secure server-side API playground</p>
          <h1>Gemini API Playground</h1>
          <p className="subtitle">
            Next.js 14 + App Router + TypeScript + Vercel
          </p>
        </header>

        <section className="card stack">
          <div>
            <label className="label" htmlFor="model">
              Gemini Model
            </label>
            <select
              id="model"
              value={selectedModelId}
              onChange={(event) => setSelectedModelId(event.target.value)}
              disabled={isSending}
            >
              {models.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.displayName} {option.description ? `— ${option.description}` : ""}
                </option>
              ))}
            </select>
          </div>

          <form className="stack" onSubmit={handleSend}>
            <div>
              <label className="label" htmlFor="prompt">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask Gemini something..."
                disabled={isSending}
              />
            </div>

            <div className="row">
              <button className="primary" type="submit" disabled={isSending}>
                {isSending ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Generating...
                  </>
                ) : (
                  "Send"
                )}
              </button>
              {sendError ? <span className="error">{sendError}</span> : null}
            </div>
          </form>

          <div>
            <h2 className="sectionTitle">Response</h2>
            <div className="response">
              {responseText ? (
                responseText
              ) : (
                <span className="muted">Gemini response appears here...</span>
              )}
            </div>
          </div>

          <div className="divider" />

          <div>
            <h2 className="sectionTitle">API Connection</h2>
            <div className="healthRow">
              <button
                className="secondary"
                type="button"
                onClick={handleHealthCheck}
                disabled={isTesting}
              >
                {isTesting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Testing...
                  </>
                ) : (
                  "Test Gemini API"
                )}
              </button>

              {health.status === "connected" ? (
                health.fallbackUsed ? (
                  <span className="pill pill-amber" title={health.fallbackReason || "Fallback active"}>
                    ⚠️ Connected — {getModelDisplayName(health.actualModel)} ({health.actualModel})
                  </span>
                ) : (
                  <span className="pill pill-green">
                    ✓ Connected — {getModelDisplayName(health.actualModel)}
                  </span>
                )
              ) : health.status === "disconnected" ? (
                <span className="pill pill-red">
                  ✗ Not connected{health.error ? ` — ${health.error}` : ""}
                </span>
              ) : (
                <span className="pill pill-neutral">Not tested</span>
              )}
            </div>

            {health.status === "connected" && health.fallbackUsed && (
              <div className="fallbackNotice">
                <strong>Fallback: ACTIVE</strong> — Requested: {getModelDisplayName(health.requestedModel)} (<code>{health.requestedModel}</code>) &rarr; Executed: {getModelDisplayName(health.actualModel)} (<code>{health.actualModel}</code>).
                {health.fallbackReason ? ` Reason: ${health.fallbackReason}` : ""}
              </div>
            )}
          </div>

          <div className="divider" />

          <div>
            <h2 className="sectionTitle">Diagnostics &amp; Model Sync</h2>
            <div className="diagList">
              <div className="diagRow">
                <span className="diagKey">Selected UI Model:</span>
                <span className="diagVal">
                  {selectedModelConfig ? selectedModelConfig.displayName : selectedModelId}
                </span>
              </div>
              <div className="diagRow">
                <span className="diagKey">Requested Model ID:</span>
                <span className="diagVal">
                  <code>{selectedModelId}</code>
                </span>
              </div>
              <div className="diagRow">
                <span className="diagKey">Actual Executed Model:</span>
                <span className="diagVal">
                  {lastExecution ? (
                    <code>{lastExecution.actualModelId}</code>
                  ) : (
                    <span className="muted">None executed yet</span>
                  )}
                </span>
              </div>
              <div className="diagRow">
                <span className="diagKey">Fallback Status:</span>
                <span className="diagVal">
                  {lastExecution ? (
                    lastExecution.fallbackUsed ? (
                      <span className="pill pill-amber" style={{ minHeight: "26px", fontSize: "11px", padding: "0 8px" }}>
                        ACTIVE (Fallback from {lastExecution.requestedModelId})
                      </span>
                    ) : (
                      <span className="pill pill-green" style={{ minHeight: "26px", fontSize: "11px", padding: "0 8px" }}>
                        INACTIVE (100% Model Match)
                      </span>
                    )
                  ) : (
                    <span className="muted">Standby (Run test or prompt)</span>
                  )}
                </span>
              </div>
              {lastExecution && (
                <div className="diagRow">
                  <span className="diagKey">Last Verified By:</span>
                  <span className="diagVal" style={{ color: "#8c9cb6", fontSize: "12px" }}>
                    {lastExecution.source === "generate" ? "Prompt Generation" : "Connection Health Test"} at {lastExecution.timestamp}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        <p className="footerNote">
          The Gemini SDK runs only in the server API routes. Keep your
          GEMINI_API_KEY in Environment Variables and never expose it to
          the browser.
        </p>
      </div>
    </main>
  );
}
