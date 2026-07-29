"use client";

import { useEffect, useState } from "react";
import { StatusMessage } from "./ui";

type ClaimPackagePlan = {
  totalBytes: number;
  evidenceCount: number;
  parts: Array<{ part: number; byteSize: number; evidenceCount: number }>;
};

export function ClaimPackageDownloads({ claimId }: { claimId: string }) {
  const [plan, setPlan] = useState<ClaimPackagePlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const encoded = encodeURIComponent(claimId);
    void fetch(`/api/claims/${encoded}/package/plan`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("The submission package plan is unavailable.");
        }
        const body = await response.json() as { data: ClaimPackagePlan };
        setPlan(body.data);
      })
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error
            ? caught.message
            : "The submission package plan is unavailable.",
        ),
      );
  }, [claimId]);

  if (error) return <StatusMessage tone="warning">{error}</StatusMessage>;
  if (!plan) return <p className="setting-note">Preparing package links…</p>;
  const encoded = encodeURIComponent(claimId);
  return (
    <div className="claim-package-downloads">
      {plan.parts.length > 1 ? (
        <p className="handoff-copy">
          This package has {plan.parts.length} numbered parts. Download and
          submit every part.
        </p>
      ) : null}
      {plan.parts.map(({ part }) => (
        <a
          key={part}
          className="secondary-button full-button"
          href={`/api/claims/${encoded}/package?part=${part}`}
          download
        >
          {plan.parts.length === 1
            ? "Download submission package"
            : `Download part ${part} of ${plan.parts.length}`}
        </a>
      ))}
    </div>
  );
}
