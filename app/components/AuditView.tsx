"use client";

import { AuditReportPanel } from "./AuditReportPanel";
import { ViewHeader } from "./ui";

export function AuditView() {
  return (
    <div className="view page-enter">
      <ViewHeader
        eyebrow="Audit response"
        title="Build an evidence-led response"
        detail="Review a date range, answer only the questions that need context, then download a Word report with the supporting receipt photos."
      />
      <AuditReportPanel />
    </div>
  );
}
