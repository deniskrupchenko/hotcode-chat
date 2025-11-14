'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DocumentSnapshot,
  QueryConstraint,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Timestamp,
  collection,
  endAt,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter
} from "firebase/firestore";

import type { Message } from "@shared/index";

import { db } from "@/lib/firebase/client";

export type MessageRecord = Message & {
  messageId: string;
};

type Options = {
  chatId: string;
  pageSize?: number;
};

type UseMessagesResult = {
  messages: MessageRecord[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  prependOptimistic: (message: MessageRecord) => void;
  settleOptimistic: (
    optimisticId: string,
    next: MessageRecord | null,
    options?: { mergeReadBy?: boolean }
  ) => void;
  updateOptimistic: (optimisticId: string, patch: Partial<MessageRecord>) => void;
};

const toMessageRecord = (snapshot: QueryDocumentSnapshot): MessageRecord => {
  const data = snapshot.data() as Message;
  return {
    ...data,
    messageId: snapshot.id
  };
};

const normalizeMessages = (messages: MessageRecord[]) =>
  [...messages].sort((a, b) => {
    const aDate =
      a.createdAt instanceof Timestamp ? a.createdAt.toMillis() : new Date(a.createdAt as Date).getTime();
    const bDate =
      b.createdAt instanceof Timestamp ? b.createdAt.toMillis() : new Date(b.createdAt as Date).getTime();
    return aDate - bDate;
  });

export const useMessages = ({ chatId, pageSize = 30 }: Options): UseMessagesResult => {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const oldestSnapshotRef = useRef<QueryDocumentSnapshot | null>(null);
  const latestSnapshotRef = useRef<QueryDocumentSnapshot | null>(null);
  const optimisticRef = useRef<Record<string, MessageRecord>>({});

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasMore(true);
    optimisticRef.current = {};

    const messagesRef = collection(db, "chats", chatId, "messages");
    const constraints: QueryConstraint[] = [orderBy("createdAt", "desc"), limit(pageSize)];
    const q = query(messagesRef, ...constraints);

    const unsubscribe = onSnapshot(
      q,
      (snapshot: QuerySnapshot) => {
        if (!snapshot.docs.length) {
          oldestSnapshotRef.current = null;
          latestSnapshotRef.current = null;
          setMessages(Object.values(optimisticRef.current));
          setLoading(false);
          setHasMore(false);
          return;
        }

        oldestSnapshotRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
        latestSnapshotRef.current = snapshot.docs[0] ?? null;

        setMessages((prev) => {
          const nonOptimistic = prev.filter((message) => !message.messageId.startsWith("optimistic-"));
          const liveMessages = snapshot.docs.map(toMessageRecord);
          const merged = normalizeMessages([
            ...liveMessages,
            ...Object.values(optimisticRef.current)
          ]);
          const deduped = new Map<string, MessageRecord>();
          [...nonOptimistic, ...merged].forEach((message) => {
            deduped.set(message.messageId, message);
          });
          return normalizeMessages(Array.from(deduped.values()));
        });

        setLoading(false);
        setHasMore(snapshot.docs.length === pageSize);
      },
      (error) => {
        console.error("[useMessages] failed to subscribe to messages", error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [chatId, pageSize]);

  const loadMore = useCallback(async () => {
    if (!chatId || loadingMore || !hasMore || !oldestSnapshotRef.current) return;
    setLoadingMore(true);
    try {
      const messagesRef = collection(db, "chats", chatId, "messages");
      const constraints: QueryConstraint[] = [
        orderBy("createdAt", "desc"),
        startAfter(oldestSnapshotRef.current),
        limit(pageSize)
      ];
      const snapshot = await getDocs(query(messagesRef, ...constraints));
      if (snapshot.docs.length === 0) {
        setHasMore(false);
        return;
      }

      oldestSnapshotRef.current = snapshot.docs[snapshot.docs.length - 1] ?? null;
      setMessages((prev) => {
        const older = snapshot.docs.map(toMessageRecord);
        const merged = normalizeMessages([...prev, ...older]);
        const deduped = new Map<string, MessageRecord>();
        merged.forEach((message) => {
          deduped.set(message.messageId, message);
        });
        return Array.from(deduped.values());
      });
      if (snapshot.docs.length < pageSize) {
        setHasMore(false);
      }
    } catch (error) {
      console.error("[useMessages] failed to load more messages", error);
    } finally {
      setLoadingMore(false);
    }
  }, [chatId, hasMore, loadingMore, pageSize]);

  const prependOptimistic = useCallback((message: MessageRecord) => {
    optimisticRef.current[message.messageId] = message;
    setMessages((prev) => normalizeMessages([...prev, message]));
  }, []);

  const settleOptimistic = useCallback(
    (optimisticId: string, next: MessageRecord | null, options?: { mergeReadBy?: boolean }) => {
      const nextOptimistic = { ...optimisticRef.current };
      delete nextOptimistic[optimisticId];
      optimisticRef.current = nextOptimistic;

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((message) => message.messageId !== optimisticId);
        if (!next) {
          return withoutOptimistic;
        }
        const merged = withoutOptimistic.filter(
          (message) => !(message.messageId === next.messageId && message.messageId.startsWith("optimistic-"))
        );
        const existingIndex = merged.findIndex((message) => message.messageId === next.messageId);
        if (existingIndex >= 0 && options?.mergeReadBy) {
          const existing = merged[existingIndex];
          merged[existingIndex] = {
            ...existing,
            ...next,
            readBy: Array.from(
              new Set([...(existing.readBy ?? []), ...(next.readBy ?? [])])
            )
          };
          return normalizeMessages(merged);
        }

        return normalizeMessages([...merged, next]);
      });
    },
    []
  );

  const updateOptimistic = useCallback((optimisticId: string, patch: Partial<MessageRecord>) => {
    const existing = optimisticRef.current[optimisticId];
    if (!existing) return;
    const nextOptimistic = {
      ...optimisticRef.current,
      [optimisticId]: {
        ...existing,
        ...patch
      }
    };
    optimisticRef.current = nextOptimistic;
    setMessages((prev) =>
      prev.map((message) => (message.messageId === optimisticId ? nextOptimistic[optimisticId] : message))
    );
  }, []);

  return useMemo(
    () => ({
      messages,
      loading,
      loadingMore,
      hasMore,
      loadMore,
      prependOptimistic,
      settleOptimistic,
      updateOptimistic
    }),
    [
      messages,
      loading,
      loadingMore,
      hasMore,
      loadMore,
      prependOptimistic,
      settleOptimistic,
      updateOptimistic
    ]
  );
};

