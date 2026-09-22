"use client";

import { FormEvent, useState } from "react";

const MODEL_OPTIONS = [
  {
    label: "Gemini 3.8 Flash (smartest, default)",
    value: "gemini-3.8-flash",
  },
  {
    label: "Gemini 3.7 Flash",
    value: "gemini-3.7-flash",
  },
  {
    label: "Gemini 3.6 Flash (cheaper, faster)",
    value: "gemini-3.6-flash",
  },
  {
    label: "Gemini 3.5 Flash-Lite (cheapest)",
    value: "gemini-3.5-flash-lite",
  },
] as const;

type HealthState =
  | { status: "idle" }
  | { status: "connected"; model: string }
  | { status: "disconnected"; error?: string };

export default function HomePage() {
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.8-flash");
  const [responseText, setResponseText] = useState("");
  const [sendError, setSendError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [health, setHealth] = useState<HealthState>({ status: "idle" });

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
          model: selectedModel,
        }),
      });

      const data: {
        success?: boolean;
        text?: string;
        error?: string;
      } = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gemini API request failed");
      }

      setResponseText(data.text || "");
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
      const res = await fetch("/api/health", {
        method: "GET",
        cache: "no-store",
      });

      const data: {
        connected?: boolean;
        model?: string;
        error?: string;
      } = await res.json();

      if (data.connected) {
        setHealth({
          status: "connected",
          model: data.model || "gemini-3.5-flash-lite",
        });
        return;
      }

      setHealth({
        status: "disconnected",
        error: data.error,
      });
    } catch (error) {
      setHealth({
        status: "disconnected",
        error: error instanceof Error ? error.message : "Health check failed",
      });
    } finally {
      setIsTesting(false);
    }
  }

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
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={isSending}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
                <span className="pill pill-green">
                  ✓ Connected — {health.model}
                </span>
              ) : health.status === "disconnected" ? (
                <span className="pill pill-red">
                  ✗ Not connected{health.error ? ` — ${health.error}` : ""}
                </span>
              ) : (
                <span className="pill pill-neutral">Not tested</span>
              )}
            </div>
          </div>
        </section>

        <p className="footerNote">
          The Gemini SDK runs only in the server API routes. Keep your
          GEMINI_API_KEY in Vercel Environment Variables and never expose it to
          the browser.
        </p>
      </div>
    </main>
  );
}
