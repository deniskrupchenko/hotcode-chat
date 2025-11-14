import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  loadEnv({ path: envPath });
}

export const REGION = "us-central1";

export const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.GCLOUD_PROJECT ??
  process.env.GCP_PROJECT ??
  "__REPLACE__";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

export const isGeminiStub = !GEMINI_API_KEY;

export const DEFAULT_CHAT_SUMMARY_MESSAGE =
  "No recent conversation to summarize yet. Start chatting to see AI highlights here.";


