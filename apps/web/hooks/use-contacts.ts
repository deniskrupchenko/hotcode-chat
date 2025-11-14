'use client';

import { useEffect, useMemo, useState } from "react";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { useAuthContext } from "@/components/providers/auth-context";
import { db } from "@/lib/firebase/client";
import type { User } from "@shared/index";

type UseContactsResult = {
  contacts: User[];
  loading: boolean;
};

export const useContacts = (): UseContactsResult => {
  const { user } = useAuthContext();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const usersRef = collection(db, "users");
    const q = query(usersRef, orderBy("displayName"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnapshot) => {
          const userData = docSnapshot.data() as User;
          return { ...userData, uid: docSnapshot.id };
        });
        setUsers(data);
        setLoading(false);
      },
      (error) => {
        console.warn("[useContacts] failed to subscribe to users", error);
        setUsers((prev) => {
          if (prev.length > 0) {
            return prev;
          }
          if (!user) {
            return [];
          }
          return [
            {
              uid: user.uid,
              email: user.email ?? "",
              displayName: user.displayName ?? user.email ?? user.uid,
              photoURL: user.photoURL ?? null,
              createdAt: null,
              updatedAt: null
            } as unknown as User
          ];
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, user?.displayName, user?.email, user?.photoURL]);

  const contacts = useMemo(() => users, [users]);

  return { contacts, loading };
};
