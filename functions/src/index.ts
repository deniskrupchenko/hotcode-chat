import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { z } from "zod";

import { generateChatSummary, generateDraftReplies, moderateContent } from "./ai";
import { DEFAULT_CHAT_SUMMARY_MESSAGE, REGION } from "./config";
import { assertRateLimit } from "./rateLimiter";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

const summarizeInput = z.object({
  chatId: z.string().min(1, "chatId is required")
});

const draftInput = z.object({
  chatId: z.string().min(1, "chatId is required"),
  messageContext: z.string().min(1, "messageContext is required")
});

const moderationInput = z.object({
  message: z.string().min(1, "message is required")
});

const presencePayload = z.object({
  status: z.enum(["online", "away", "offline"]).default("online")
});

const ensureAuthenticated = (context: CallableRequest<unknown>) => {
  if (!context.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  return context.auth.uid;
};

const ensureChatParticipant = async (uid: string, chatId: string) => {
  const chatSnap = await db.collection("chats").doc(chatId).get();
  if (!chatSnap.exists) {
    throw new HttpsError("not-found", "Chat not found.");
  }

  const chatData = chatSnap.data() as { participants?: string[]; mutedBy?: string[]; name?: string; type?: string };
  if (!Array.isArray(chatData.participants) || !chatData.participants.includes(uid)) {
    throw new HttpsError("permission-denied", "You are not a participant of this chat.");
  }

  return { chatId, ...chatData };
};

export const aiSummarizeChat = onCall({ region: REGION }, async (request) => {
  const uid = ensureAuthenticated(request);
  const { chatId } = summarizeInput.parse(request.data ?? {});

  await ensureChatParticipant(uid, chatId);
  assertRateLimit(`aiSummarize:${uid}`, { windowMs: 60_000, maxRequests: 3 });

  const result = await generateChatSummary(chatId);
  return {
    summary: result.summary ?? DEFAULT_CHAT_SUMMARY_MESSAGE
  };
});

export const aiDraftReply = onCall({ region: REGION }, async (request) => {
  const uid = ensureAuthenticated(request);
  const { chatId, messageContext } = draftInput.parse(request.data ?? {});

  await ensureChatParticipant(uid, chatId);
  assertRateLimit(`aiDraft:${uid}`, { windowMs: 60_000, maxRequests: 5 });

  const result = await generateDraftReplies(chatId, messageContext);
  return {
    suggestions: result.suggestions ?? [
      "Working on it!",
      "I'll circle back soon.",
      "Let's continue this thread shortly."
    ]
  };
});

export const aiModerateMessage = onCall({ region: REGION }, async (request) => {
  const uid = ensureAuthenticated(request);
  const { message } = moderationInput.parse(request.data ?? {});

  assertRateLimit(`aiModerate:${uid}`, { windowMs: 30_000, maxRequests: 10 });
  const result = await moderateContent(message);
  return {
    approved: result.approved ?? true,
    reason: result.reason
  };
});

type MessageData = {
  senderId: string;
  text?: string;
  type?: string;
  attachments?: Array<{ downloadURL?: string; name?: string }>;
};

const sendMessageNotification = async (
  chatId: string,
  messageId: string,
  message: MessageData
) => {
  const chatSnap = await db.collection("chats").doc(chatId).get();
  if (!chatSnap.exists) {
    return;
  }

  const chat = chatSnap.data() as {
    participants?: string[];
    name?: string;
    type?: string;
    mutedBy?: string[];
  };
  const participants = chat.participants ?? [];
  const mutedBy = chat.mutedBy ?? [];
  const targets = participants.filter(
    (memberId) => memberId !== message.senderId && !mutedBy.includes(memberId)
  );

  if (targets.length === 0) {
    return;
  }

  const userDocs = await Promise.all(
    targets.map((memberId) => db.collection("users").doc(memberId).get())
  );

  const tokens = new Set<string>();
  userDocs.forEach((docSnap) => {
    const data = docSnap.data() as { fcmTokens?: string[] } | undefined;
    data?.fcmTokens?.forEach((token) => tokens.add(token));
  });

  if (tokens.size === 0) {
    logger.info("No push tokens to notify", { chatId, messageId });
    return;
  }

  const notificationTitle =
    chat.type === "group"
      ? chat.name ?? "New group message"
      : "New message";
  const notificationBody =
    message.text ??
    (message.attachments?.length
      ? `${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}`
      : "New activity in your chat.");

  const payload = {
    tokens: Array.from(tokens),
    notification: {
      title: notificationTitle,
      body: notificationBody
    },
    data: {
      chatId,
      messageId,
      type: message.type ?? "text"
    }
  };

  const response = await messaging.sendEachForMulticast(payload);
  const failures = response.responses.filter((result) => !result.success);
  if (failures.length) {
    logger.warn("Some notifications failed", {
      chatId,
      messageId,
      failures: failures.map((failure) => failure.error?.message)
    });
  } else {
    logger.info("Delivered FCM notifications", {
      chatId,
      messageId,
      count: response.successCount
    });
  }
};

export const onMessageCreated = onDocumentCreated(
  {
    region: REGION,
    document: "chats/{chatId}/messages/{messageId}"
  },
  async (event) => {
    const message = event.data?.data() as MessageData | undefined;
    if (!message) {
      logger.warn("No message payload for onMessageCreated", event.params);
      return;
    }

    try {
      await sendMessageNotification(event.params.chatId, event.params.messageId, message);
    } catch (error) {
      logger.error("Failed to send push notification", {
        error,
        chatId: event.params.chatId,
        messageId: event.params.messageId
      });
    }
  }
);

const verifyBearerToken = async (authorizationHeader?: string) => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new HttpsError("unauthenticated", "Missing bearer token.");
  }

  const token = authorizationHeader.replace("Bearer ", "").trim();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new HttpsError("unauthenticated", "Invalid authentication token.");
  }
};

export const presencePing = onRequest({ region: REGION }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  let uid: string;
  try {
    uid = await verifyBearerToken(req.get("Authorization") ?? undefined);
  } catch (error) {
    const message =
      error instanceof HttpsError ? error.message : "Authentication failed.";
    res.status(401).json({ ok: false, message });
    return;
  }

  try {
    assertRateLimit(`presence:${uid}`, { windowMs: 15_000, maxRequests: 10 });
  } catch (error) {
    if (error instanceof HttpsError && error.code === "resource-exhausted") {
      res.status(429).json({ ok: false, message: error.message });
      return;
    }
    throw error;
  }

  let payload: z.infer<typeof presencePayload>;
  try {
    const body =
      typeof req.body === "string" && req.body.length
        ? JSON.parse(req.body)
        : req.body ?? {};
    payload = presencePayload.parse(body);
  } catch (error) {
    res.status(400).json({ ok: false, message: "Invalid payload." });
    return;
  }

  try {
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          lastSeen: FieldValue.serverTimestamp(),
          isOnline: payload.status === "online"
        },
        { merge: true }
      );

    res.json({ ok: true });
  } catch (error) {
    logger.error("Failed to update presence", { error, uid });
    res.status(500).json({ ok: false, message: "Unable to update presence." });
  }
});

export const syncAuthUsersToFirestore = onCall({ region: REGION }, async (request) => {
    const uid = ensureAuthenticated(request);
    
    // Only allow this to run once per user (optional: add admin check)
    assertRateLimit(`syncUsers:${uid}`, { windowMs: 60_000, maxRequests: 1 });

  try {
    let nextPageToken: string | undefined;
    let totalSynced = 0;
    const now = FieldValue.serverTimestamp();

    do {
      const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
      nextPageToken = listUsersResult.pageToken;

      // Process users in batches of 500 (Firestore batch limit)
      const BATCH_SIZE = 500;
      let batch = db.batch();
      let batchCount = 0;

      for (const userRecord of listUsersResult.users) {
        const userDocRef = db.collection("users").doc(userRecord.uid);
        const userDoc = await userDocRef.get();

        // Only create if doesn't exist, or update if missing required fields
        if (!userDoc.exists || !userDoc.data()?.email) {
          const displayName =
            userRecord.displayName ||
            (userRecord.email ? userRecord.email.split("@")[0] : userRecord.uid);

          const userData: Record<string, unknown> = {
            uid: userRecord.uid,
            email: userRecord.email || "",
            displayName,
            photoURL: userRecord.photoURL || null,
            updatedAt: now
          };

          if (!userDoc.exists) {
            userData.createdAt = now;
          }

          batch.set(userDocRef, userData, { merge: true });
          batchCount++;

          // Commit batch when it reaches the limit
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            totalSynced += batchCount;
            batch = db.batch();
            batchCount = 0;
          }
        }
      }

      // Commit remaining operations
      if (batchCount > 0) {
        await batch.commit();
        totalSynced += batchCount;
      }
    } while (nextPageToken);

    logger.info("Synced Firebase Auth users to Firestore", { totalSynced, syncedBy: uid });
    return { success: true, synced: totalSynced };
  } catch (error) {
    logger.error("Failed to sync Firebase Auth users to Firestore", { error, syncedBy: uid });
    throw new HttpsError("internal", "Failed to sync users. Please try again.");
  }
});


