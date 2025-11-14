'use client';

import { useEffect, useState } from "react";

import { collection, onSnapshot, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase/client";

type Presence = {
  uid: string;
  displayName?: string | null;
  photoURL?: string | null;
  isOnline?: boolean;
  lastSeen?: Date;
};

export const useChatPresence = (participantIds: string[]) => {
  const [presence, setPresence] = useState<Presence[]>([]);

  useEffect(() => {
    if (!participantIds.length) {
      setPresence([]);
      return;
    }

    const cappedIds = participantIds.slice(0, 10);
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("uid", "in", cappedIds));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnapshot) => {
        const payload = docSnapshot.data();
        return {
          uid: payload.uid as string,
          displayName: payload.displayName as string | null,
          photoURL: payload.photoURL as string | null,
          isOnline: payload.isOnline as boolean | undefined,
          lastSeen: payload.lastSeen?.toDate?.()
        };
      });
      setPresence(data);
    });

    return () => unsubscribe();
  }, [participantIds.join("_")]);

  return presence;
};

