"use client";

import { useEffect, useState } from "react";
import { StatusMessage } from "./ui";

type IntegrityReport = {
  expectedObjects: number;
  verifiedObjects: number;
  healthy: boolean;
  orphanedObjects: string[];
};

type RecoveryPlan = {
  totalBytes: number;
  evidenceCount: number;
  parts: Array<{ part: number; byteSize: number; evidenceCount: number }>;
};

export function RecoveryPanel() {
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  const [plan, setPlan] = useState<RecoveryPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/recovery/plan", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The recovery plan is unavailable.");
        const body = await response.json() as { data: RecoveryPlan };
        setPlan(body.data);
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "The recovery plan is unavailable.",
        ),
      );
  }, []);

  async function runIntegrityCheck() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/recovery/integrity", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json() as {
        data?: IntegrityReport;
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message || "The integrity check failed.");
      }
      setIntegrity(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The integrity check failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="recovery-heading">
      <div className="setting-number" aria-hidden="true">06</div>
      <div className="setting-content">
        <p className="eyebrow">Evidence safety</p>
        <h2 id="recovery-heading">Backup and integrity</h2>
        <p className="setting-note">
          Recovery ZIPs contain the ledger, original receipts, checksums and a
          recovery guide. Large backups are safely divided into numbered parts.
          Keep every part private and encrypted.
        </p>
        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        {integrity ? (
          <StatusMessage tone={integrity.healthy ? "success" : "warning"}>
            <strong>
              {integrity.healthy
                ? "Evidence is healthy"
                : "Evidence needs attention"}
            </strong>
            <p>
              {integrity.verifiedObjects} of {integrity.expectedObjects} expected
              originals verified byte-for-byte. {integrity.orphanedObjects.length}{" "}
              unlinked storage objects found.
            </p>
          </StatusMessage>
        ) : null}
        {plan ? (
          <p className="setting-note">
            {plan.evidenceCount} originals,{" "}
            {(plan.totalBytes / 1024 / 1024).toFixed(1)} MB,{" "}
            {plan.parts.length} {plan.parts.length === 1 ? "part" : "parts"}.
          </p>
        ) : null}
        <div className="settings-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={busy}
            onClick={() => void runIntegrityCheck()}
          >
            {busy ? "Checking…" : "Check evidence integrity"}
          </button>
          {plan?.parts.map(({ part }) => (
            <a
              key={part}
              className="primary-button"
              href={`/api/recovery/backup?part=${part}`}
              download
            >
              {plan.parts.length === 1
                ? "Download recovery ZIP"
                : `Download part ${part} of ${plan.parts.length}`}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
