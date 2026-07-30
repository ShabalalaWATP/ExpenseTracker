"use client";
import { useEffect, useState } from "react";
import {
  resolveStoredTheme,
  THEME_STORAGE_KEY,
  type Theme,
} from "../theme";
import {
  clearUploadDrafts,
  countUploadDrafts,
} from "./receipt-intake/upload-drafts";
import { RecoveryPanel } from "./RecoveryPanel";
import { StatusMessage, ViewHeader } from "./ui";
type OperationalStatus = {
  version: string;
  databaseSchema: string;
  database: { verified: boolean; detail: string };
  storage: { verified: boolean; detail: string };
  ai: {
    configured: boolean;
    models: {
      receipt: string;
      realtime: string;
      transcription: string;
    };
    voice: string;
    lastSuccessAt: string | null;
    lastSuccessModel: string | null;
    lastError: { code: string; message: string; at: string } | null;
  };
  usage: {
    expenses: number;
    receipts: number;
    receiptBytes: number;
    pendingIntakes: number;
  };
};
function applyTheme(theme: Theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
function initialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return resolveStoredTheme(
      window.localStorage.getItem(THEME_STORAGE_KEY),
    );
  } catch {
    return "dark";
  }
}
export function SettingsView({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [aiError, setAiError] = useState("");
  const [localDrafts, setLocalDrafts] = useState(0);
  const [online, setOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [standalone] = useState(
    () =>
      typeof window !== "undefined" &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
  );
  useEffect(() => {
    let active = true;
    void fetch("/api/status", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("App status is unavailable.");
        const body = (await response.json()) as { data: OperationalStatus };
        if (active) setStatus(body.data);
      })
      .catch((error: unknown) => {
        if (active) {
          setAiError(
            error instanceof Error ? error.message : "App status is unavailable.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    void countUploadDrafts().then(setLocalDrafts).catch(() => setLocalDrafts(0));
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  async function clearLocalQueue() {
    if (
      !window.confirm(
        "Remove all receipt uploads waiting on this device? Uploaded server records are not affected.",
      )
    ) return;
    await clearUploadDrafts();
    setLocalDrafts(0);
  }

  function chooseTheme(value: Theme) {
    setTheme(value);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // The selected theme still applies for this page session.
    }
    applyTheme(value);
  }

  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow="Current view"
        title="Settings"
        detail="Manage appearance, check AI setup, review privacy controls and export your data."
        action={
          <button
            className="secondary-button settings-close"
            type="button"
            onClick={onClose}
          >
            Close settings
          </button>
        }
      />

      <div className="settings-ledger">
        <section aria-labelledby="appearance-heading">
          <div className="setting-number" aria-hidden="true">01</div>
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
            <p className="setting-note">Dark mode uses a near-black navy workspace. Only this appearance preference is stored in your browser.</p>
          </div>
        </section>

        <section aria-labelledby="ai-heading">
          <div className="setting-number" aria-hidden="true">02</div>
          <div className="setting-content">
            <p className="eyebrow">Receipt assistance</p>
            <h2 id="ai-heading">AI and voice</h2>
            {status ? (
              <>
                <StatusMessage tone={status.ai.configured ? "neutral" : "warning"}>
                  <strong>
                    {status.ai.configured
                      ? "OpenAI API key configured"
                      : "Manual receipt entry is active"}
                  </strong>
                  <p>
                    {status.ai.configured
                      ? status.ai.lastSuccessAt
                        ? `Last successful extraction: ${new Date(status.ai.lastSuccessAt).toLocaleString("en-GB")} using ${status.ai.lastSuccessModel ?? status.ai.models.receipt}.`
                        : "The credential is configured. No successful extraction has been recorded yet."
                      : "Add OPENAI_API_KEY to the private Sites runtime environment to enable receipt analysis and voice."}
                  </p>
                </StatusMessage>
                <dl className="policy-details compact-details">
                  <div><dt>Receipt extraction</dt><dd>{status.ai.models.receipt}</dd></div>
                  <div><dt>Realtime voice</dt><dd>{status.ai.models.realtime} · {status.ai.voice}</dd></div>
                  <div><dt>Transcription</dt><dd>{status.ai.models.transcription}</dd></div>
                </dl>
                {status.ai.lastError ? (
                  <p className="setting-note">
                    Last recorded issue: {status.ai.lastError.code} on{" "}
                    {new Date(status.ai.lastError.at).toLocaleString("en-GB")}.
                    The original receipt remains safe.
                  </p>
                ) : null}
              </>
            ) : aiError ? (
              <StatusMessage tone="warning">{aiError}</StatusMessage>
            ) : (
              <p className="setting-note">Checking the private runtime configuration…</p>
            )}
          </div>
        </section>

        <section aria-labelledby="device-heading">
          <div className="setting-number" aria-hidden="true">03</div>
          <div className="setting-content">
            <p className="eyebrow">This iPhone or browser</p>
            <h2 id="device-heading">Device and offline capture</h2>
            <ul className="plain-list">
              <li><strong>{online ? "Online" : "Offline"}</strong><span>{online ? "Queued uploads can be sent now." : "New receipt photos wait on this device, but are not secured until the connection returns and upload completes."}</span></li>
              <li><strong>{standalone ? "Installed app" : "Safari site"}</strong><span>{standalone ? "ExpenseTracker is running from the Home Screen." : "For faster capture on iPhone, use Safari Share, then Add to Home Screen."}</span></li>
              <li><strong>{localDrafts} local {localDrafts === 1 ? "upload" : "uploads"}</strong><span>Only interrupted or waiting receipt uploads are retained in this browser.</span></li>
            </ul>
            {localDrafts ? <button className="text-button" type="button" onClick={() => void clearLocalQueue()}>Clear local upload queue</button> : null}
          </div>
        </section>

        <section aria-labelledby="privacy-heading">
          <div className="setting-number" aria-hidden="true">04</div>
          <div className="setting-content">
            <p className="eyebrow">Owner-only data</p>
            <h2 id="privacy-heading">Privacy and control</h2>
            <ul className="plain-list">
              <li><strong>Private evidence</strong><span>Receipt originals and expense records are kept in owner-only storage. They are never public links.</span></li>
              <li><strong>No browser ledger</strong><span>Financial records are stored by the server, not duplicated in Safari.</span></li>
              <li><strong>Strict automatic confirmation</strong><span>Clean receipts are added only after an independent image check agrees on the critical facts. Exceptions wait for your review, and allowance decisions remain deterministic.</span></li>
              <li><strong>Voice is optional</strong><span>The microphone starts only when you choose it. The permanent API key never reaches Safari.</span></li>
            </ul>
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

        <RecoveryPanel />

        <section aria-labelledby="status-heading">
          <div className="setting-number" aria-hidden="true">07</div>
          <div className="setting-content">
            <p className="eyebrow">Operational truth</p>
            <h2 id="status-heading">App status</h2>
            {status ? (
              <dl className="policy-details compact-details">
                <div><dt>Version</dt><dd>{status.version} · schema {status.databaseSchema}</dd></div>
                <div><dt>Database</dt><dd>{status.database.verified ? "Connected" : status.database.detail}</dd></div>
                <div><dt>Receipt storage</dt><dd>{status.storage.detail}</dd></div>
                <div><dt>Records</dt><dd>{status.usage.expenses} expenses · {status.usage.receipts} receipts · {status.usage.pendingIntakes} awaiting review</dd></div>
                <div><dt>Receipt storage used</dt><dd>{(status.usage.receiptBytes / 1024 / 1024).toFixed(1)} MB</dd></div>
              </dl>
            ) : aiError ? (
              <StatusMessage tone="warning">{aiError}</StatusMessage>
            ) : <p className="setting-note">Checking the private services…</p>}
          </div>
        </section>

        <section aria-labelledby="policy-heading">
          <div className="setting-number" aria-hidden="true">08</div>
          <div className="setting-content">
            <p className="eyebrow">Reference</p>
            <h2 id="policy-heading">Allowance rules</h2>
            <p className="setting-note">
              ExpenseTracker applies the configured £30 daily limit automatically. Open this only when you need the source details.
            </p>
            <details className="policy-disclosure">
              <summary>View allowance reference</summary>
              <dl className="policy-details">
                <div><dt>Source</dt><dd>JSP 752 v66.1, May 2026</dd></div>
                <div><dt>Daily limit</dt><dd>£30.00 from 1 April 2026</dd></div>
                <div><dt>Service charge or tip</dt><dd>Permitted within the same £30 limit</dd></div>
                <div><dt>Currency and country</dt><dd>GBP · United Kingdom (GB)</dd></div>
                <div><dt>Aggregation</dt><dd>Available for trips of two nights or more</dd></div>
              </dl>
              <a className="text-button external-link" href="https://www.gov.uk/government/publications/jsp-752-tri-service-regulations-for-expenses-and-allowances" target="_blank" rel="noreferrer">
                View official publication <span aria-hidden="true">↗</span>
              </a>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}
