'use client';

import { useEffect, useMemo, useState } from "react";

import {
  DocumentData,
  Unsubscribe,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from "firebase/firestore";

import { useAuthContext } from "@/components/providers/auth-context";
import { db } from "@/lib/firebase/client";

type TypingState = {
  uid: string;
  typing: boolean;
  updatedAt?: Date;
};

export const useTyping = (chatId: string) => {
  const { user } = useAuthContext();
  const [typing, setTyping] = useState<Record<string, TypingState>>({});

  useEffect(() => {
    if (!chatId) return;
    const typingRef = collection(db, "chats", chatId, "typing");
    let unsubscribe: Unsubscribe | undefined;

    unsubscribe = onSnapshot(typingRef, (snapshot) => {
      const result: Record<string, TypingState> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as DocumentData;
        result[docSnap.id] = {
          uid: docSnap.id,
          typing: Boolean(data.typing),
          updatedAt: data.updatedAt?.toDate?.()
        };
      });
      setTyping(result);
    });

    return () => unsubscribe?.();
  }, [chatId]);

  const setTypingState = async (isTyping: boolean) => {
    if (!user) return;

    const typingDoc = doc(db, "chats", chatId, "typing", user.uid);
    await setDoc(
      typingDoc,
      {
        uid: user.uid,
        typing: isTyping,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  };

  const activeTypers = useMemo(
    () => Object.values(typing).filter((value) => value.typing && value.uid !== user?.uid),
    [typing, user?.uid]
  );

  return { typing, setTypingState, activeTypers };
};

