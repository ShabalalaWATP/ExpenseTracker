"use client";

import { useEffect, useState } from "react";
import { StatusMessage, ViewHeader } from "./ui";

type Theme = "system" | "light" | "dark";

type AiStatus = {
  configured: boolean;
  models: {
    chat: string;
    receipt: string;
    realtime: string;
    transcription: string;
  };
  voice: string;
  privacy: string;
};

function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

export function SettingsView() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    const saved = window.localStorage.getItem("expense-tracker-theme");
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system";
  });
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    void fetch("/api/ai/status", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("AI status is unavailable.");
        const body = (await response.json()) as { data: AiStatus };
        if (active) setAi(body.data);
      })
      .catch((error: unknown) => {
        if (active) {
          setAiError(
            error instanceof Error ? error.message : "AI status is unavailable.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  function chooseTheme(value: Theme) {
    setTheme(value);
    window.localStorage.setItem("expense-tracker-theme", value);
    applyTheme(value);
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow="Preferences and controls"
        title="Settings"
        detail="Review the active policy, appearance and how your private evidence is handled."
      />

      <div className="settings-ledger">
        <section aria-labelledby="policy-heading">
          <div className="setting-number" aria-hidden="true">01</div>
          <div className="setting-content">
            <p className="eyebrow">Read-only policy</p>
            <h2 id="policy-heading">UK Day Subsistence</h2>
            <dl className="policy-details">
              <div><dt>Source</dt><dd>JSP 752 v66.1, May 2026</dd></div>
              <div><dt>Daily limit</dt><dd>£30.00 from 1 April 2026</dd></div>
              <div><dt>Currency and country</dt><dd>GBP · United Kingdom (GB)</dd></div>
              <div><dt>Aggregation</dt><dd>Permitted for two nights or more, with an explicit method choice</dd></div>
            </dl>
            <a className="text-button external-link" href="https://www.gov.uk/government/publications/jsp-752-tri-service-regulations-for-expenses-and-allowances" target="_blank" rel="noreferrer">
              View official publication <span aria-hidden="true">↗</span>
            </a>
            <StatusMessage tone="neutral">
              ExpenseTracker is a calculation and evidence aid. It does not decide entitlement or replace the authoritative policy.
            </StatusMessage>
          </div>
        </section>

        <section aria-labelledby="appearance-heading">
          <div className="setting-number" aria-hidden="true">02</div>
          <div className="setting-content">
            <p className="eyebrow">On this device</p>
            <h2 id="appearance-heading">Appearance</h2>
            <fieldset className="theme-choice">
              <legend className="sr-only">Colour theme</legend>
              {(["system", "light", "dark"] as Theme[]).map((option) => (
                <label key={option}>
                  <input type="radio" name="theme" value={option} checked={theme === option} onChange={() => chooseTheme(option)} />
                  <span className={`theme-swatch ${option}`} aria-hidden="true"><i /><i /></span>
                  <strong>{option[0].toUpperCase() + option.slice(1)}</strong>
                </label>
              ))}
            </fieldset>
            <p className="setting-note">Only this appearance preference is stored in your browser.</p>
          </div>
        </section>

        <section aria-labelledby="privacy-heading">
          <div className="setting-number" aria-hidden="true">03</div>
          <div className="setting-content">
            <p className="eyebrow">Private by construction</p>
            <h2 id="privacy-heading">Privacy and data control</h2>
            <ul className="plain-list">
              <li><strong>Private evidence</strong><span>Receipt originals and expense records are kept in owner-only storage. They are never public links.</span></li>
              <li><strong>No browser ledger</strong><span>Financial records are server-authoritative. Closing Safari does not leave a second local financial record.</span></li>
              <li><strong>No AI decisions</strong><span>AI can suggest receipt fields, but only you can confirm them. Allowance calculations remain deterministic.</span></li>
              <li><strong>Voice by choice</strong><span>The microphone starts only after you choose voice clarification. The permanent API key never reaches Safari.</span></li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="ai-heading">
          <div className="setting-number" aria-hidden="true">04</div>
          <div className="setting-content">
            <p className="eyebrow">Server-side assistance</p>
            <h2 id="ai-heading">Receipt AI and voice</h2>
            {ai ? (
              <>
                <StatusMessage tone={ai.configured ? "neutral" : "warning"}>
                  <strong>
                    {ai.configured
                      ? "AI receipt review is ready"
                      : "Manual mode is active"}
                  </strong>
                  <p>
                    {ai.configured
                      ? ai.privacy
                      : "Add OPENAI_API_KEY to the private Sites runtime environment to enable analysis and voice."}
                  </p>
                </StatusMessage>
                <dl className="policy-details compact-details">
                  <div><dt>Receipt extraction</dt><dd>{ai.models.receipt}</dd></div>
                  <div><dt>Chat</dt><dd>{ai.models.chat}</dd></div>
                  <div><dt>Realtime voice</dt><dd>{ai.models.realtime} · {ai.voice}</dd></div>
                  <div><dt>Transcription</dt><dd>{ai.models.transcription}</dd></div>
                </dl>
              </>
            ) : aiError ? (
              <StatusMessage tone="warning">{aiError}</StatusMessage>
            ) : (
              <p className="setting-note">Checking the private runtime configuration…</p>
            )}
          </div>
        </section>

        <section aria-labelledby="export-heading">
          <div className="setting-number" aria-hidden="true">05</div>
          <div className="setting-content">
            <p className="eyebrow">Owner-only download</p>
            <h2 id="export-heading">Export your ledger</h2>
            <p className="setting-note">
              JSON contains the complete structured ledger and audit history.
              CSV is a spreadsheet-friendly expense register. Receipt images
              remain in private storage.
            </p>
            <div className="settings-actions">
              <a className="primary-button" href="/api/export?format=json" download>
                Download JSON
              </a>
              <a className="secondary-button" href="/api/export?format=csv" download>
                Download CSV
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
