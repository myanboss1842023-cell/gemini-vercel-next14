"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
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
  source: "stream" | "generate" | "health_check";
}

export default function HomePage() {
  const [models, setModels] = useState<GeminiModelConfig[]>(SUPPORTED_MODELS);
  const [prompt, setPrompt] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string>(DEFAULT_MODEL_ID);
  const [responseText, setResponseText] = useState("");
  const [sendError, setSendError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [health, setHealth] = useState<HealthState>({ status: "idle" });
  const [lastExecution, setLastExecution] = useState<LastExecutionDiagnostics | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Single source of truth sync with cached server config
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

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSending(false);
    }
  }

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

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isStreaming) {
      // 1. Streaming Mode
      try {
        const res = await fetch("/api/gemini/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt,
            model: selectedModelId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          let errMessage = "Stream generation failed";
          try {
            const errData = await res.json();
            errMessage = errData.error || errMessage;
          } catch {
            // Keep default
          }
          throw new Error(errMessage);
        }

        const requested = res.headers.get("X-Requested-Model") || selectedModelId;
        const actual = res.headers.get("X-Actual-Model") || selectedModelId;
        const fallback = res.headers.get("X-Fallback-Used") === "true";
        const fallbackReasonRaw = res.headers.get("X-Fallback-Reason");
        const fallbackReason = fallbackReasonRaw ? decodeURIComponent(fallbackReasonRaw) : null;

        setHealth({
          status: "connected",
          requestedModel: requested,
          actualModel: actual,
          fallbackUsed: fallback,
          fallbackReason,
        });

        setLastExecution({
          requestedModelId: requested,
          actualModelId: actual,
          fallbackUsed: fallback,
          fallbackReason,
          timestamp: new Date().toLocaleTimeString(),
          source: "stream",
        });

        if (!res.body) {
          throw new Error("No readable response body received.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setResponseText(accumulated);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // Aborted by user
          return;
        }
        setSendError(
          error instanceof Error ? error.message : "Gemini API stream failed"
        );
      } finally {
        setIsSending(false);
        abortControllerRef.current = null;
      }
    } else {
      // 2. Standard Non-Streaming Mode
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
          signal: controller.signal,
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
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSendError(
          error instanceof Error ? error.message : "Gemini API request failed"
        );
      } finally {
        setIsSending(false);
        abortControllerRef.current = null;
      }
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

            <div className="controlsRow">
              <div className="row">
                {isSending ? (
                  <button className="dangerBtn" type="button" onClick={handleStop}>
                    <span className="spinner" aria-hidden="true" />
                    Stop Generation
                  </button>
                ) : (
                  <button className="primary" type="submit">
                    Send
                  </button>
                )}

                <div
                  className="toggleWrapper"
                  onClick={() => !isSending && setIsStreaming(!isStreaming)}
                  title="Enable real-time token streaming"
                >
                  <div className={`toggleSwitch ${isStreaming ? "active" : ""}`}>
                    <div className="toggleCircle" />
                  </div>
                  <span>Real-time Streaming</span>
                </div>
              </div>

              {sendError ? <span className="error">{sendError}</span> : null}
            </div>
          </form>

          <div>
            <h2 className="sectionTitle">Response</h2>
            <div className="response">
              {responseText ? (
                <>
                  <div className="markdown-body">
                    <Markdown>{responseText}</Markdown>
                  </div>
                  {isSending && <span className="streamCursor" />}
                </>
              ) : isSending ? (
                <span className="muted">
                  <span className="spinner" aria-hidden="true" />
                  Streaming tokens from Gemini...
                </span>
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
                disabled={isTesting || isSending}
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
                    {lastExecution.source === "stream"
                      ? "Real-time Stream"
                      : lastExecution.source === "generate"
                      ? "Prompt Generation"
                      : "Connection Health Test"}{" "}
                    at {lastExecution.timestamp}
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
