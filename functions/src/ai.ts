import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { z } from "zod";

import { DEFAULT_CHAT_SUMMARY_MESSAGE, GEMINI_API_KEY, isGeminiStub } from "./config";

const SUMMARY_MODEL = "gemini-1.5-flash-latest";
const DRAFT_MODEL = "gemini-1.5-flash-latest";
const MODERATION_MODEL = "gemini-pro";

type GeminiResponse = {
  summary?: string;
  suggestions?: string[];
  approved?: boolean;
  reason?: string;
};

const transcriptSchema = z.array(
  z.object({
    senderId: z.string(),
    text: z.string().optional(),
    createdAt: z.date(),
    type: z.string().default("text")
  })
);

const blocklist = ["spam", "phishing", "terrorism"];

const db = admin.firestore();

const fetchRecentMessages = async (chatId: string, limit = 30) => {
  const snapshot = await db
    .collection("chats")
    .doc(chatId)
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const messages = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const rawCreatedAt = data.createdAt;
      const createdAt =
        rawCreatedAt instanceof admin.firestore.Timestamp
          ? rawCreatedAt.toDate()
          : typeof rawCreatedAt?.toDate === "function"
          ? rawCreatedAt.toDate()
          : typeof rawCreatedAt?.seconds === "number"
          ? new Date(rawCreatedAt.seconds * 1000)
          : new Date();

      return {
        senderId: (data.senderId as string) ?? "unknown",
        text: data.text as string | undefined,
        createdAt,
        type: (data.type as string) ?? "text"
      };
    })
    .reverse();

  return transcriptSchema.parse(messages);
};

const callGemini = async (model: string, prompt: string): Promise<string> => {
  if (isGeminiStub) {
    return "[stubbed] Gemini API key not configured.";
  }

  const endpoint = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  );
  endpoint.searchParams.set("key", GEMINI_API_KEY);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error("Gemini API error", { status: response.status, errorBody });
    throw new Error("Gemini API call failed");
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini response missing text");
  }

  return text.trim();
};

export const generateChatSummary = async (chatId: string): Promise<GeminiResponse> => {
  const messages = await fetchRecentMessages(chatId);
  if (messages.length === 0) {
    return { summary: DEFAULT_CHAT_SUMMARY_MESSAGE };
  }

  if (isGeminiStub) {
    const lastSpeaker = messages[messages.length - 1];
    return {
      summary: `Recent activity from ${lastSpeaker.senderId}: "${lastSpeaker.text ?? "sent an update"}".`
    };
  }

  const transcript = messages
    .map((message) => `${message.senderId}: ${message.text ?? `[${message.type}]`}`)
    .join("\n");

  const prompt = `
You are an assistant summarizing a chat conversation.
Provide a concise summary (2-3 sentences) focusing on decisions, blockers, and next steps if mentioned.
Transcript:
${transcript}
  `.trim();

  try {
    const summary = await callGemini(SUMMARY_MODEL, prompt);
    return { summary };
  } catch (error) {
    logger.error("Failed to summarize chat with Gemini", { error, chatId });
    return { summary: DEFAULT_CHAT_SUMMARY_MESSAGE };
  }
};

export const generateDraftReplies = async (
  chatId: string,
  lastMessage: string
): Promise<GeminiResponse> => {
  const messages = await fetchRecentMessages(chatId, 10);

  if (isGeminiStub) {
    return {
      suggestions: [
        `On ${chatId}: sounds good!`,
        "I'll take a look shortly.",
        "Thanks for the update, let's keep the thread going."
      ]
    };
  }

  const context = messages
    .map((message) => `${message.senderId}: ${message.text ?? `[${message.type}]`}`)
    .join("\n");

  const prompt = `
You are an assistant composing short chat replies (max 120 characters each).
Provide three practical, friendly reply options in bullet form.
Latest message to respond to:
${lastMessage}

Recent context:
${context}
  `.trim();

  try {
    const text = await callGemini(DRAFT_MODEL, prompt);
    const suggestions = text
      .split("\n")
      .map((line) => line.replace(/^[\-\d\.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

    if (suggestions.length === 0) {
      throw new Error("No suggestions returned");
    }

    return { suggestions };
  } catch (error) {
    logger.error("Gemini draft reply failure", { error, chatId });
    return {
      suggestions: [
        "👍 Sounds good!",
        "Let me check and get back to you.",
        "Thanks for the heads up!"
      ]
    };
  }
};

export const moderateContent = async (message: string): Promise<GeminiResponse> => {
  const normalized = message.toLowerCase();
  if (blocklist.some((term) => normalized.includes(term))) {
    return {
      approved: false,
      reason: "Message contains restricted terms."
    };
  }

  if (isGeminiStub) {
    return { approved: true };
  }

  const prompt = `
You are a safety filter for a chat platform.
Classify the following message as either "allow" or "block".
If blocked, provide a short reason referencing policy categories.
Message:
${message}
  `.trim();

  try {
    const text = await callGemini(MODERATION_MODEL, prompt);
    if (text.toLowerCase().includes("block")) {
      return {
        approved: false,
        reason: text
      };
    }

    return { approved: true };
  } catch (error) {
    logger.error("Gemini moderation failure", { error });
    return { approved: true };
  }
};


