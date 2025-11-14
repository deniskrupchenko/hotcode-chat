'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { getAuth } from "firebase/auth";

import {
  DocumentReference,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  arrayUnion
} from "firebase/firestore";

import { authStateChanged, signOutUser } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/client";
import { registerMessaging } from "@/lib/firebase/messaging";
import { sendPresencePing, type PresenceStatus } from "@/lib/firebase/presence";
import { upsertUserProfile } from "@/lib/firestore/users";

const LOBBY_CHAT_ID = "global-lobby";
const LOBBY_NAME = "HotCode Lobby";
const LOBBY_DESCRIPTION = "Say hello to the community.";

const ensureLobbyConversation = async (uid: string, displayName: string | null) => {
  const chatRef = doc(db, "chats", LOBBY_CHAT_ID);
  const timestamp = serverTimestamp();
  let created = false;

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(chatRef);

      if (!snapshot.exists()) {
        created = true;
        const greeting = `👋 Hi ${displayName ?? "there"}! Welcome to ${LOBBY_NAME}.`;
        transaction.set(
          chatRef,
          {
            chatId: LOBBY_CHAT_ID,
            type: "group",
            name: LOBBY_NAME,
            description: LOBBY_DESCRIPTION,
            participants: [uid],
            createdAt: timestamp,
            updatedAt: timestamp,
            lastMessage: greeting,
            lastMessageAt: timestamp
          },
          { merge: true }
        );
      } else {
        const data = snapshot.data() as { participants?: string[]; lastMessage?: string };
        const participants = Array.from(new Set([...(data.participants ?? []), uid]));
        transaction.set(
          chatRef,
          {
            participants,
            updatedAt: timestamp,
            lastMessage: data.lastMessage ?? `👋 ${displayName ?? "A teammate"} joined the lobby!`,
            lastMessageAt: timestamp
          },
          { merge: true }
        );
      }
    });
  } catch (error) {
    console.warn("[auth] lobby transaction failed", error);
    await setDoc(
      chatRef,
      {
        chatId: LOBBY_CHAT_ID,
        type: "group",
        name: LOBBY_NAME,
        description: LOBBY_DESCRIPTION,
        participants: arrayUnion(uid),
        updatedAt: timestamp,
        lastMessageAt: timestamp
      },
      { merge: true }
    );
  }

  if (created) {
    await addDoc(collection(db, "chats", LOBBY_CHAT_ID, "messages"), {
      chatId: LOBBY_CHAT_ID,
      senderId: uid,
      text: `👋 Hi ${displayName ?? "there"}! Welcome to ${LOBBY_NAME}.`,
      type: "text",
      createdAt: serverTimestamp(),
      readBy: [uid],
      reactions: {}
    }).catch((error) => {
      console.warn("[auth] failed to seed lobby message", error);
    });
  }
};


type AuthContextValue = {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<AppUser | null>;
};

export type AppUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isOnline: boolean;
  profileComplete: boolean;
  policyConsent: boolean;
  docRef: DocumentReference | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateUser = useCallback(async (): Promise<AppUser | null> => {
    const currentUser = getAuth().currentUser;

    if (!currentUser) {
      setUser(null);
      return null;
    }

    const userRef = doc(db, "users", currentUser.uid);
    let snapshot;
    try {
      snapshot = await getDoc(userRef);
    } catch (error) {
      console.warn("[auth] unable to fetch user profile", error);
      const fallbackUser: AppUser = {
        uid: currentUser.uid,
        email: currentUser.email,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
        isOnline: false,
        profileComplete: Boolean(currentUser.displayName),
        policyConsent: false,
        docRef: null
      };
      setUser(fallbackUser);
      return fallbackUser;
    }

    if (!snapshot.exists()) {
      await upsertUserProfile(currentUser, { markLogin: true });
      try {
        snapshot = await getDoc(userRef);
      } catch (error) {
        console.warn("[auth] profile fetch failed after upsert", error);
        snapshot = null;
      }
      if (!snapshot || !snapshot.exists()) {
        await ensureLobbyConversation(currentUser.uid, currentUser.displayName);
        const fallbackUser: AppUser = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          photoURL: currentUser.photoURL,
          isOnline: true,
          profileComplete: Boolean(currentUser.displayName),
          policyConsent: false,
          docRef: userRef
        };
        setUser(fallbackUser);
        return fallbackUser;
      }
    }

    const data = snapshot.data() ?? {};
    const displayName = (data.displayName as string | null) ?? currentUser.displayName ?? null;
    const photoURL = (data.photoURL as string | null) ?? currentUser.photoURL ?? null;

    await ensureLobbyConversation(currentUser.uid, displayName);

    const appUser: AppUser = {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName,
      photoURL,
      isOnline: Boolean(data.isOnline ?? true),
      profileComplete: Boolean(displayName),
      policyConsent: false,
      docRef: userRef
    };

    setUser(appUser);
    return appUser;
  }, []);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = authStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      const hydratedUser = await hydrateUser();

      const token = await registerMessaging();
      if (token && hydratedUser?.docRef) {
        try {
          await updateDoc(hydratedUser.docRef, {
            fcmTokens: arrayUnion(token),
            isOnline: true,
            lastSeen: serverTimestamp()
          });
        } catch (error) {
          console.warn("[auth] failed to sync messaging token", error);
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [hydrateUser]);

  useEffect(() => {
    const ref = user?.docRef;
    if (!ref) {
      return;
    }

    const goOnline = async () => {
      try {
        await updateDoc(ref, {
          isOnline: true,
          lastSeen: serverTimestamp()
        });
      } catch (error) {
        console.warn("[presence] failed to set online state", error);
      }
      void sendPresencePing("online");
    };

    const goOffline = async (status: PresenceStatus) => {
      try {
        await updateDoc(ref, {
          isOnline: status === "online" ? true : false,
          lastSeen: serverTimestamp()
        });
      } catch (error) {
        console.warn("[presence] failed to set offline state", error);
      }
      void sendPresencePing(status);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        void goOffline("offline");
      } else {
        void goOnline();
      }
    };

    const handleFocus = () => {
      void goOnline();
    };

    const handleBlur = () => {
      void goOffline("away");
    };

    const handleBeforeUnload = () => {
      void goOffline("offline");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);

    void goOnline();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      loading,
      signOut: async () => {
        if (user?.docRef) {
          await updateDoc(user.docRef, {
            isOnline: false,
            lastSeen: serverTimestamp()
          });
        }

        await signOutUser();
      },
      refresh: hydrateUser
    }),
    [hydrateUser, loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
};

