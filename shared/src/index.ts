import { z } from "zod";

export type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

export const attachmentSchema = z.object({
  id: z.string(),
  storagePath: z.string(),
  downloadURL: z.string().url(),
  contentType: z.string(),
  size: z.number().int().nonnegative(),
  name: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional()
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const userSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  photoURL: z.string().url().nullable(),
  createdAt: z.any(),
  updatedAt: z.any(),
  lastLoginAt: z.any().nullable().optional(),
  lastSeen: z.any().nullable().optional(),
  isOnline: z.boolean().optional(),
  fcmTokens: z.array(z.string()).optional()
});

export type User = z.infer<typeof userSchema>;

export const chatSchema = z.object({
  chatId: z.string(),
  type: z.union([z.literal("dm"), z.literal("group")]).optional(),
  participants: z.array(z.string()).min(2),
  name: z.string().optional(),
  description: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.any(),
  updatedAt: z.any(),
  lastMessage: z.string().nullable(),
  lastMessageAt: z.any().nullable(),
  mutedBy: z.array(z.string()).optional()
});

export type Chat = z.infer<typeof chatSchema>;

export const messageSchema = z.object({
  messageId: z.string(),
  chatId: z.string(),
  senderId: z.string(),
  text: z.string().optional(),
  attachments: z.array(attachmentSchema).optional(),
  type: z.union([
    z.literal("text"),
    z.literal("image"),
    z.literal("video"),
    z.literal("file"),
    z.literal("system")
  ]),
  createdAt: z.any(),
  editedAt: z.any().optional(),
  deletedAt: z.any().optional(),
  reactions: z.record(z.array(z.string())).optional(),
  readBy: z.array(z.string()).optional(),
  moderation: z
    .object({
      status: z.enum(["pending", "approved", "rejected"]),
      reason: z.string().optional()
    })
    .optional()
});

export type Message = z.infer<typeof messageSchema>;

export const typingSchema = z.object({
  chatId: z.string(),
  uid: z.string(),
  typing: z.boolean(),
  updatedAt: z.any()
});

export type TypingState = z.infer<typeof typingSchema>;

export const reportSchema = z.object({
  reportId: z.string(),
  chatId: z.string(),
  messageId: z.string(),
  reporterId: z.string(),
  reason: z.string(),
  createdAt: z.any(),
  metadata: z
    .object({
      context: z.string().optional()
    })
    .optional()
});

export type Report = z.infer<typeof reportSchema>;

export const dmChatId = (uidA: string, uidB: string) => {
  return [uidA, uidB].sort().join("__");
};

export type FirestoreConverter<T> = {
  toFirestore: (input: T) => Record<string, unknown>;
  fromFirestore: (snapshot: { data: () => Record<string, unknown> }, options?: unknown) => T;
};

export const buildZodFirestoreConverter = <T>(
  schema: z.ZodType<T>
): FirestoreConverter<T> => ({
  toFirestore: (input: T) => schema.parse(input) as Record<string, unknown>,
  fromFirestore: (snapshot) => schema.parse({ ...snapshot.data() })
});

export const converters = {
  user: buildZodFirestoreConverter(userSchema),
  chat: buildZodFirestoreConverter(chatSchema),
  message: buildZodFirestoreConverter(messageSchema),
  typing: buildZodFirestoreConverter(typingSchema),
  report: buildZodFirestoreConverter(reportSchema)
};

export const TEN_MINUTES_MS = 10 * 60 * 1000;

