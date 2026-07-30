import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type ExpenseTrackerEnv = {
  DB?: D1Database;
  RECEIPTS?: R2Bucket;
  EXPENSETRACKER_OWNER_EMAIL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_RECEIPT_MODEL?: string;
  OPENAI_POLICY_MODEL?: string;
  OPENAI_REALTIME_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_REALTIME_VOICE?: string;
};

function bindings(): ExpenseTrackerEnv {
  return env as unknown as ExpenseTrackerEnv;
}

export function getD1(): D1Database {
  const database = bindings().DB;
  if (!database) {
    throw new Error("The DB binding is unavailable.");
  }
  return database;
}

export function getReceiptsBucket(): R2Bucket {
  const bucket = bindings().RECEIPTS;
  if (!bucket) {
    throw new Error("The RECEIPTS binding is unavailable.");
  }
  return bucket;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getRuntimeEnv(): ExpenseTrackerEnv {
  return bindings();
}
