'use client';

import { useEffect, useMemo, useRef, useState } from "react";

import { Timestamp, collection, doc, getDoc, onSnapshot, where, query } from "firebase/firestore";

import { useAuthContext } from "@/components/providers/auth-context";
import { db } from "@/lib/firebase/client";
import type { Chat, User } from "@shared/index";

export type ChatSummary = {
  chatId: string;
  type: Chat["type"];
  participants: string[];
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
};

type UseChatsResult = {
  chats: ChatSummary[];
  loading: boolean;
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "object" && value !== null && "seconds" in (value as Record<string, unknown>)) {
    const { seconds, nanoseconds } = value as { seconds: number; nanoseconds: number };
    return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
  }
  return null;
};

export const useChats = (): UseChatsResult => {
  const { user } = useAuthContext();
  const [rawChats, setRawChats] = useState<Chat[]>([]);
  const [userDirectory, setUserDirectory] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const userDirectoryRef = useRef<Record<string, User>>({});

  useEffect(() => {
    userDirectoryRef.current = userDirectory;
  }, [userDirectory]);

  useEffect(() => {
    if (!user) {
      setRawChats([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const chatsRef = collection(db, "chats");
    const q = query(chatsRef, where("participants", "array-contains", user.uid));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const chats = snapshot.docs.map((docSnapshot) => {
          const chatData = docSnapshot.data() as Chat;
          return { ...chatData, chatId: docSnapshot.id };
        });
        chats.sort((a, b) => {
          const aDate = toDate(a.lastMessageAt ?? a.updatedAt ?? a.createdAt)?.getTime() ?? 0;
          const bDate = toDate(b.lastMessageAt ?? b.updatedAt ?? b.createdAt)?.getTime() ?? 0;
          return bDate - aDate;
        });
        setRawChats(chats);
        setLoading(false);

        const missing = new Set<string>();
        chats.forEach((chat) => {
          chat.participants.forEach((participantId) => {
            if (participantId === user.uid) return;
            if (!userDirectoryRef.current[participantId]) {
              missing.add(participantId);
            }
          });
        });

        if (missing.size === 0) {
          return;
        }

        const snapshots = await Promise.all(Array.from(missing).map((participantId) => getDoc(doc(db, "users", participantId))));
        setUserDirectory((prev) => {
          const next = { ...prev };
          snapshots.forEach((userSnapshot) => {
            if (!userSnapshot.exists()) return;
            const payload = userSnapshot.data() as User;
            next[payload.uid ?? userSnapshot.id] = {
              ...payload,
              uid: payload.uid ?? userSnapshot.id
            };
          });
          return next;
        });
      },
      (error) => {
        console.error("[useChats] failed to subscribe to chats", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const chats = useMemo(() => {
    if (!user) return [];

    if (rawChats.length === 0) {
      return [
        {
          chatId: "global-lobby",
          type: "group" as const,
          participants: [user.uid],
          title: "HotCode Lobby",
          subtitle: "Say hello to everyone here.",
          avatarUrl: null,
          lastMessage: "Welcome to the lobby!",
          lastMessageAt: null,
          unreadCount: 0
        } satisfies ChatSummary
      ];
    }

    return rawChats.map((chat) => {
      const lastMessageAt = toDate(chat.lastMessageAt);
      let title = chat.type === "group" ? chat.name ?? "Group chat" : "Direct message";
      let subtitle = chat.lastMessage ?? "Start the conversation";
      let avatarUrl: string | null = chat.avatarUrl ?? null;

      if (chat.type === "dm") {
        const counterpartId = chat.participants.find((participantId) => participantId !== user.uid) ?? null;
        const counterpart = counterpartId ? userDirectory[counterpartId] : undefined;
        if (counterpart) {
          title = counterpart.displayName ?? counterpart.email ?? "Direct message";
          subtitle = chat.lastMessage ?? counterpart.email ?? "Say hello";
          avatarUrl = counterpart.photoURL ?? null;
        }
      } else {
        if (!chat.name) {
          const others = chat.participants
            .filter((participantId) => participantId !== user.uid)
            .map((participantId) => userDirectory[participantId]?.displayName ?? userDirectory[participantId]?.email ?? participantId);
          if (others.length) {
            title = others.join(", ");
          }
        }
        if (!chat.lastMessage) {
          const memberNames = chat.participants
            .filter((participantId) => participantId !== user.uid)
            .map((participantId) => userDirectory[participantId]?.displayName ?? userDirectory[participantId]?.email ?? participantId);
          if (memberNames.length) {
            subtitle = `Members: ${memberNames.join(", ")}`;
          }
        }
      }

      return {
        chatId: chat.chatId,
        type: chat.type as Chat["type"],
        participants: chat.participants,
        title,
        subtitle,
        avatarUrl,
        lastMessage: chat.lastMessage ?? null,
        lastMessageAt,
        unreadCount: 0
      } satisfies ChatSummary;
    });
  }, [rawChats, user, userDirectory]);

  return { chats, loading };
};

