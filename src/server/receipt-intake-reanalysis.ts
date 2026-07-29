import { getReceiptsBucket } from "@/db";
import { ApiError } from "./http";
import type { Principal } from "./principal";
import { analyseReceiptIntake } from "./receipt-intake-processing";
import { requireIntake } from "./receipt-intake-repository";

export async function reanalyseStoredReceiptIntake(
  principal: Principal,
  id: string,
) {
  const intake = await requireIntake(principal, id);
  if (intake.status === "confirmed") {
    throw new ApiError(
      409,
      "receipt_confirmed",
      "This receipt is already confirmed.",
    );
  }
  if (!intake.analysis_object_key) {
    throw new ApiError(
      409,
      "analysis_copy_missing",
      "This receipt has no prepared analysis copy. Upload the photo again to read it with the new model.",
    );
  }
  const object = await getReceiptsBucket().get(intake.analysis_object_key);
  if (!object) {
    throw new ApiError(
      404,
      "analysis_copy_missing",
      "The prepared analysis copy is unavailable. The original receipt remains safe.",
    );
  }
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  return analyseReceiptIntake(
    principal,
    id,
    bytes,
    intake.analysis_object_key.endsWith(".png")
      ? "image/png"
      : "image/jpeg",
  );
}
