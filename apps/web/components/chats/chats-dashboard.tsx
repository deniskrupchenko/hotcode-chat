'use client';

import { useMemo, useState } from "react";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { useAuthContext } from "@/components/providers/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { useContacts } from "@/hooks/use-contacts";
import { useChats } from "@/hooks/use-chats";
import { startDirectMessage } from "@/lib/firestore/chats";
import { syncAuthUsersToFirestore } from "@/lib/ai";
import { cn, formatRelativeTime } from "@/lib/utils";

import type { ChatSummary } from "@/hooks/use-chats";
import type { User } from "@shared/index";

import { CreateChatDialog } from "./create-chat-dialog";

export const ChatsDashboard = () => {
  const { chats, loading } = useChats();
  const { contacts, loading: contactsLoading } = useContacts();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { user } = useAuthContext();
  const pathname = usePathname();
  const router = useRouter();

  const activeChatId = useMemo(() => {
    const match = pathname?.match(/^\/c\/([^/?]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query]);

  const filteredChats = useMemo(() => {
    if (!normalizedQuery) return chats;
    return chats.filter(
      (chat) =>
        chat.title.toLowerCase().includes(normalizedQuery) ||
        chat.subtitle.toLowerCase().includes(normalizedQuery)
    );
  }, [chats, normalizedQuery]);

  const filteredContacts = useMemo(() => {
    if (!normalizedQuery) return contacts;
    return contacts.filter((contact) => {
      const name = contact.displayName ?? "";
      const email = contact.email ?? "";
      return (
        name.toLowerCase().includes(normalizedQuery) || email.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [contacts, normalizedQuery]);

  const startChatWithContact = async (contact: User) => {
    if (!user) return;
    try {
      const chatId = await startDirectMessage(user, contact);
      router.push(`/c/${chatId}`);
    } catch (error) {
      console.error("[ChatsDashboard] failed to start conversation", error);
      toast.error("Unable to start conversation");
    }
  };

  const handleSyncUsers = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const result = await syncAuthUsersToFirestore();
      toast.success(`Successfully synced ${result.synced} user(s) from Firebase Auth to Firestore.`);
      // Refresh contacts after sync
      window.location.reload();
    } catch (error) {
      console.error("[ChatsDashboard] failed to sync users", error);
      toast.error("Unable to sync users. Please try again.");
    } finally {
      setSyncing(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
      <aside className="flex h-[calc(100vh-140px)] flex-col rounded-xl border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search users..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button size="icon" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="sr-only">New chat</span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Conversations</h3>
            {loading ? (
              <ChatListSkeleton />
            ) : filteredChats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {filteredChats.map((chat) => (
                  <ChatListItem key={chat.chatId} chat={chat} active={chat.chatId === activeChatId} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">People</h3>
              {contacts.length === 0 && !contactsLoading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSyncUsers}
                  disabled={syncing}
                  className="h-6 text-xs"
                >
                  {syncing ? "Syncing..." : "Sync Users"}
                </Button>
              )}
            </div>
            {contactsLoading ? (
              <ChatListSkeleton />
            ) : filteredContacts.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {contacts.length === 0
                    ? "No users found. Click 'Sync Users' to import users from Firebase Authentication."
                    : "No teammates match your search."}
                </p>
                {contacts.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncUsers}
                    disabled={syncing}
                    className="w-full"
                  >
                    {syncing ? "Syncing..." : "Sync Users from Firebase Auth"}
                  </Button>
                )}
              </div>
            ) : (
              <ul className="space-y-1">
                {filteredContacts
                  .filter((contact) => contact.uid !== user.uid)
                  .map((contact) => {
                    // Find existing chat with this contact
                    const existingChat = chats.find(
                      (chat) =>
                        chat.type === "dm" &&
                        chat.participants.includes(contact.uid) &&
                        chat.participants.includes(user.uid)
                    );
                    
                    const lastMessage = existingChat?.subtitle ?? "No messages yet";
                    const lastMessageAt = existingChat?.lastMessageAt;
                    
                    return (
                      <li key={contact.uid}>
                        <button
                          onClick={() => startChatWithContact(contact)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50"
                        >
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={contact.photoURL ?? undefined} alt={contact.displayName ?? contact.email ?? ""} />
                              <AvatarFallback className="bg-blue-500 text-white">
                                {(contact.displayName ?? contact.email ?? contact.uid).slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {contact.isOnline && (
                              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {contact.displayName ?? contact.email ?? contact.uid}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{lastMessage}</p>
                            </div>
                            {lastMessageAt && (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {formatRelativeTime(lastMessageAt)}
                              </span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>
      </aside>
      <section className="hidden h-[calc(100vh-140px)] rounded-xl border border-dashed border-border bg-background lg:flex">
        <div className="m-auto max-w-md space-y-3 text-center">
          <h2 className="text-lg font-semibold">Select a chat to get started</h2>
          <p className="text-sm text-muted-foreground">
            Chats update in realtime and sync across your devices instantly.
          </p>
          <Button onClick={() => setOpen(true)}>New message</Button>
        </div>
      </section>

      <CreateChatDialog open={open} onOpenChange={setOpen} />
    </div>
  );
};

const ChatListItem = ({ chat, active }: { chat: ChatSummary; active: boolean }) => {
  return (
    <li>
      <Link
        href={`/c/${chat.chatId}`}
        className={cn(
          "flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-accent",
          active && "bg-accent"
        )}
      >
        <div className="flex flex-1 items-center gap-3">
          <Avatar className="h-10 w-10">
            {chat.avatarUrl ? (
              <AvatarImage src={chat.avatarUrl} alt={chat.title} />
            ) : (
              <AvatarFallback>{chat.title.slice(0, 2).toUpperCase()}</AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">{chat.title}</p>
              {chat.lastMessageAt && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(chat.lastMessageAt)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="line-clamp-1 text-sm text-muted-foreground">{chat.subtitle}</p>
              {chat.unreadCount > 0 && (
                <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">
                  {chat.unreadCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
};

const ChatListSkeleton = () => (
  <ul className="divide-y divide-border">
    {Array.from({ length: 6 }).map((_, index) => (
      <li key={index} className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </li>
    ))}
  </ul>
);

