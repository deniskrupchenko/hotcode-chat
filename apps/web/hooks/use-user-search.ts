'use client';

import { useEffect, useMemo, useState } from "react";

import { collection, endAt, getDocs, limit, orderBy, query, startAt, where } from "firebase/firestore";

import type { User } from "@shared/index";

import { db } from "@/lib/firebase/client";

type UseUserSearchOptions = {
  excludeIds?: string[];
  limit?: number;
};

type UseUserSearchResult = {
  users: User[];
  loading: boolean;
  error: string | null;
};

const DEFAULT_LIMIT = 12;

const mergeSnapshots = (docs: Array<{ id: string; data: () => Record<string, unknown> }>, excludeIds: string[]) => {
  const merged = new Map<string, User>();
  docs.forEach((snapshot) => {
    const data = snapshot.data() as User;
    const uid = data.uid ?? snapshot.id;
    if (excludeIds.includes(uid)) return;
    merged.set(uid, {
      ...data,
      uid
    });
  });
  return Array.from(merged.values());
};

export const useUserSearch = (term: string, options?: UseUserSearchOptions): UseUserSearchResult => {
  const { excludeIds = [], limit: limitCount = DEFAULT_LIMIT } = options ?? {};
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedTerm = useMemo(() => term.trim(), [term]);
  const normalizedTerm = useMemo(() => trimmedTerm.toLowerCase(), [trimmedTerm]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(async () => {
      try {
        const usersRef = collection(db, "users");
        const isEmailQuery = normalizedTerm.includes("@");
        let docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];

        if (isEmailQuery && normalizedTerm.length > 0) {
          const equalitySnapshot = await getDocs(query(usersRef, where("email", "==", trimmedTerm)));
          docs = equalitySnapshot.docs;
        } else if (normalizedTerm.length > 0) {
          try {
            const displaySnapshot = await getDocs(
              query(usersRef, orderBy("displayName"), startAt(trimmedTerm), endAt(`${trimmedTerm}\uf8ff`), limit(limitCount))
            );
            docs = displaySnapshot.docs;
          } catch (primaryError) {
            console.warn("[useUserSearch] displayName range query failed; falling back", primaryError);
            const fallbackSnapshot = await getDocs(
              query(usersRef, orderBy("email"), startAt(trimmedTerm), endAt(`${trimmedTerm}\uf8ff`), limit(limitCount))
            );
            docs = fallbackSnapshot.docs;
          }
        } else {
          try {
            const snapshot = await getDocs(query(usersRef, orderBy("displayName"), limit(limitCount)));
            docs = snapshot.docs;
          } catch (fallbackError) {
            console.warn("[useUserSearch] default listing failed; falling back to email order", fallbackError);
            const fallbackSnapshot = await getDocs(query(usersRef, orderBy("email"), limit(limitCount)));
            docs = fallbackSnapshot.docs;
          }
        }

        if (!active) return;
        setUsers(mergeSnapshots(docs, excludeIds));
      } catch (err) {
        console.error("[useUserSearch] failed to query users", err);
        if (active) {
          setUsers([]);
          setError("We couldn't load teammates. Try again in a moment.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [excludeIds, limitCount, normalizedTerm, trimmedTerm]);

  return { users, loading, error };
};


