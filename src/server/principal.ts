import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ApiError } from "./http";
import { runtimeConfig } from "./runtime-config";

export const SINGLETON_OWNER_ID = "singleton-owner";

export type Principal = {
  ownerId: typeof SINGLETON_OWNER_ID;
  email: string;
  actorHash: string;
};

function hex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hashEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email),
  );
  return hex(new Uint8Array(digest)).slice(0, 32);
}

export async function requirePrincipal(): Promise<Principal> {
  const user = await getChatGPTUser();
  if (!user?.email) {
    throw new ApiError(401, "authentication_required", "Sign in to continue.");
  }

  const email = user.email.trim().toLowerCase();
  const expected = runtimeConfig().ownerEmail;
  if (!expected) {
    throw new ApiError(
      503,
      "owner_not_configured",
      "The private owner has not been configured for this deployment.",
    );
  }
  if (email !== expected) {
    throw new ApiError(
      403,
      "owner_forbidden",
      "This private ledger belongs to a different account.",
    );
  }

  return {
    ownerId: SINGLETON_OWNER_ID,
    email,
    actorHash: await hashEmail(email),
  };
}
