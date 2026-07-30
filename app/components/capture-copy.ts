export function captureDetail(initialDate?: string): string {
  return initialDate
    ? "AI reads the printed date on uploaded receipts. Manual entry starts with the selected calendar date."
    : "Secure one receipt or a whole batch, then confirm only the details that need your attention.";
}
