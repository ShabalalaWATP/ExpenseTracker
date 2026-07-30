import { database } from "./db";
import { ApiError } from "./http";
import type { Principal } from "./principal";

export async function requireOwnedReceiptTrip(
  principal: Principal,
  tripId: string | null,
): Promise<void> {
  if (!tripId) return;
  const trip = await database()
    .prepare("SELECT id FROM trips WHERE owner_id = ? AND id = ?")
    .bind(principal.ownerId, tripId)
    .first<{ id: string }>();
  if (!trip) {
    throw new ApiError(
      400,
      "trip_invalid",
      "The selected trip does not exist.",
    );
  }
}
