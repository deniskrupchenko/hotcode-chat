'use client';

import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useVirtualizer } from '@tanstack/react-virtual';
import { nanoid } from 'nanoid';
import { FileIcon, Loader2, Paperclip, PenLine, Reply, Send, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useAuthContext } from '@/components/providers/auth-context';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { aiDraftReply, aiModerateMessage, aiSummarizeChat } from '@/lib/ai';
import { db } from '@/lib/firebase/client';
import {
  editMessage,
  markMessagesRead,
  sendMessage,
  softDeleteMessage,
  toggleReaction
} from '@/lib/firestore/messages';
import { uploadAttachments } from '@/lib/firebase/storage';
import { cn } from '@/lib/utils';
import { useChatPresence } from '@/hooks/use-chat-presence';
import { useMessages, type MessageRecord } from '@/hooks/use-messages';
import { useTyping } from '@/hooks/use-typing';
import type { Attachment, Chat, Message } from '@shared/index';
import { Timestamp, doc, getDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';

const REACTIONS = ['👍', '🎉', '❤️', '😂', '👀'];

const resolveKind = (file: File): 'image' | 'video' | 'file' => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  return 'file';
};

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'object' && value !== null && 'seconds' in (value as Record<string, unknown>)) {
    const { seconds, nanoseconds } = value as { seconds: number; nanoseconds: number };
    return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
  }
  return null;
};

const isOptimistic = (messageId: string) => messageId.startsWith('optimistic-');

const createOptimisticMessage = (
  chatId: string,
  senderId: string,
  text: string,
  attachments: DraftAttachment[]
): MessageRecord => {
  const createdAt = new Date();
  const messageId = `optimistic-${nanoid()}`;
  const mappedAttachments = attachments.length
    ? attachments.map<Attachment>((item) => ({
        id: item.id,
        downloadURL: item.previewUrl,
        storagePath: '',
        contentType: item.file.type,
        size: item.file.size,
        name: item.file.name
      }))
    : undefined;

  const type = attachments.length
    ? attachments.every((item) => item.kind === 'image')
      ? 'image'
      : attachments.every((item) => item.kind === 'video')
      ? 'video'
      : 'file'
    : 'text';

  return {
    chatId,
    messageId,
    senderId,
    text,
    attachments: mappedAttachments,
    type,
    createdAt,
    readBy: [senderId],
    reactions: {},
    editedAt: undefined,
    deletedAt: undefined
  } as MessageRecord;
};

const messageStatus = (
  message: MessageRecord,
  currentUserId: string,
  participants: string[]
): string | null => {
  if (message.senderId !== currentUserId) return null;
  if (isOptimistic(message.messageId)) return 'Sending…';

  const others = participants.filter((participant) => participant !== currentUserId);
  if (others.length === 0) return 'Delivered';
  const readBy = new Set(message.readBy ?? []);
  const unread = others.filter((member) => !readBy.has(member)).length;
  return unread === 0 ? 'Read' : 'Delivered';
};

const messageTimestamp = (message: MessageRecord) => {
  const date = toDate(message.createdAt);
  return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
};

const editedLabel = (message: MessageRecord) => (message.editedAt ? 'Edited' : null);

const deletedLabel = (message: MessageRecord) =>
  message.deletedAt ? 'Message removed by creator' : null;

type DraftAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  kind: 'image' | 'video' | 'file';
  progress: number;
};

export const ChatRoom = ({ chatId }: { chatId: string }) => {
  const { user } = useAuthContext();
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    prependOptimistic,
    settleOptimistic
  } = useMessages({ chatId, pageSize: 40 });
  const { activeTypers, setTypingState } = useTyping(chatId);
  const [chat, setChat] = useState<Chat | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [draftReplies, setDraftReplies] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const initialScrollRef = useRef(false);
  const previousCountRef = useRef(0);

  useEffect(() => {
    if (!chatId) return;
    const chatRef = doc(db, 'chats', chatId);
    const unsubscribe = onSnapshot(chatRef, (snapshot) => {
      if (!snapshot.exists()) {
        setChat(null);
        return;
      }
      const chatData = snapshot.data() as Chat;
      setChat({ ...chatData, chatId });
    });
    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    if (!user) return;
    const unread = messages
      .filter(
        (message) =>
          message.senderId !== user.uid &&
          !isOptimistic(message.messageId) &&
          !(message.readBy ?? []).includes(user.uid)
      )
      .map((message) => message.messageId);

    if (unread.length) {
      void markMessagesRead(chatId, unread.slice(-30), user.uid).catch((error) =>
        console.error('[ChatRoom] failed to mark read', error)
      );
    }
  }, [messages, chatId, user]);

  const presence = useChatPresence(chat?.participants ?? []);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 120,
    overscan: 12
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!loading && messages.length && !initialScrollRef.current) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      initialScrollRef.current = true;
      previousCountRef.current = messages.length;
    }
  }, [loading, messages.length, virtualizer]);

  useEffect(() => {
    if (messages.length > previousCountRef.current) {
      const newest = messages[messages.length - 1];
      if (newest && user && newest.senderId === user.uid) {
        virtualizer.scrollToIndex(messages.length - 1, { align: 'end' });
      }
      previousCountRef.current = messages.length;
    }
  }, [messages, user, virtualizer]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const firstVisible = virtualItems[0];
    if (firstVisible && firstVisible.index <= 2) {
      void loadMore();
    }
  }, [virtualItems, hasMore, loadingMore, loadMore]);

  const handleSend = useCallback(
    async ({
      text,
      attachments,
      reportProgress
    }: {
      text: string;
      attachments: DraftAttachment[];
      reportProgress: (id: string, progress: number) => void;
    }) => {
      if (!user) return;
      const trimmed = text.trim();
      if (!trimmed && attachments.length === 0) {
        toast.info('Add a message or attachment before sending.');
        return;
      }

      setSending(true);
      const optimistic = createOptimisticMessage(chatId, user.uid, trimmed, attachments);
      prependOptimistic(optimistic);

      try {
        const moderation = await aiModerateMessage(trimmed);
        if (!moderation.approved) {
          settleOptimistic(optimistic.messageId, null);
          toast.error(`Message blocked: ${moderation.reason ?? 'violates policy'}`);
          setSending(false);
          return;
        }

        const uploaded = attachments.length
          ? await uploadAttachments(
              chatId,
              attachments.map((attachment) => ({
                file: attachment.file,
                onProgress: (progress) => reportProgress(attachment.id, progress.progress)
              }))
            )
          : [];

        const docRef = await sendMessage({
          chatId,
          senderId: user.uid,
          text: trimmed || undefined,
          attachments: uploaded.length ? uploaded.map(({ task, ...rest }) => rest) : undefined,
          type:
            uploaded.length === 0
              ? 'text'
              : uploaded.every((item) => item.contentType.startsWith('image/'))
              ? 'image'
              : uploaded.every((item) => item.contentType.startsWith('video/'))
              ? 'video'
              : 'file',
          participants: chat?.participants
        });

        const persistedSnapshot = await getDoc(docRef);
        if (!persistedSnapshot.exists()) {
          settleOptimistic(optimistic.messageId, null);
          setSending(false);
          return;
        }

        const persisted = {
          ...(persistedSnapshot.data() as Message),
          messageId: docRef.id
        } as MessageRecord;
        settleOptimistic(optimistic.messageId, persisted, { mergeReadBy: true });
      } catch (error) {
        console.error('[ChatRoom] send failed', error);
        settleOptimistic(optimistic.messageId, null);
        toast.error('Failed to send message. Try again.');
      } finally {
        attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
        setSending(false);
      }
    },
    [chat?.participants, chatId, prependOptimistic, settleOptimistic, user]
  );

  const handleReaction = useCallback(
    async (message: MessageRecord, emoji: string) => {
      if (!user || isOptimistic(message.messageId)) return;
      try {
        await toggleReaction(chatId, message.messageId, emoji, user.uid);
      } catch (error) {
        console.error('[ChatRoom] toggle reaction failed', error);
        toast.error('Unable to update reaction.');
      }
    },
    [chatId, user]
  );

  const handleEdit = useCallback(
    async (messageId: string, value: string) => {
      if (!value.trim()) {
        toast.error('Message cannot be empty.');
        return;
      }
      try {
        await editMessage(chatId, messageId, value.trim());
      } catch (error) {
        console.error('[ChatRoom] edit failed', error);
        toast.error('Unable to edit message.');
      }
    },
    [chatId]
  );

  const handleDelete = useCallback(
    async (messageId: string) => {
      try {
        await softDeleteMessage(chatId, messageId);
      } catch (error) {
        console.error('[ChatRoom] delete failed', error);
        toast.error('Unable to delete message.');
      }
    },
    [chatId]
  );

  const participantsLabel = useMemo(() => {
    if (!presence.length) return 'Only you';
    return presence.map((item) => item.displayName ?? item.uid).join(', ');
  }, [presence]);

  const totalSize = virtualizer.getTotalSize();

  return (
    <div className="flex h-[calc(100vh-140px)] w-full flex-col rounded-xl border border-border bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div>
          <h2 className="text-lg font-semibold">
            {chat?.type === 'group' ? chat?.name ?? 'Group chat' : 'Direct message'}
          </h2>
          <p className="text-sm text-muted-foreground">{participantsLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              setAiLoading(true);
              try {
                const response = await aiSummarizeChat(chatId);
                setAiSummary(response.summary);
                toast.success('AI summary ready');
              } catch (error) {
                console.error(error);
                toast.error('AI summary failed (stub).');
              } finally {
                setAiLoading(false);
              }
            }}
            disabled={aiLoading}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Summarize
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!messages.length) return;
              setAiLoading(true);
              try {
                const lastMessage = messages[messages.length - 1];
                const response = await aiDraftReply(chatId, lastMessage.text ?? '');
                setDraftReplies(response.suggestions);
                toast.success('Draft replies generated.');
              } catch (error) {
                console.error(error);
                toast.error('Draft replies failed (stub).');
              } finally {
                setAiLoading(false);
              }
            }}
            disabled={aiLoading}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Draft replies
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-4" aria-live="polite">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading messages…
            </div>
          ) : (
            <div style={{ height: `${totalSize}px`, position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const message = messages[virtualRow.index];
                if (!message) return null;
                return (
                  <div
                    key={message.messageId}
                    ref={virtualizer.measureElement}
                    data-index={virtualRow.index}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                  >
                    <ChatMessageItem
                      message={message}
                      participants={chat?.participants ?? []}
                      currentUserId={user?.uid ?? ''}
                      reactions={REACTIONS}
                      onReact={handleReaction}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                );
              })}
              {loadingMore && (
                <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-xs text-muted-foreground shadow">
                  Loading more…
                </div>
              )}
              {aiSummary && (
                <div className="absolute left-1/2 top-10 -translate-x-1/2 max-w-md rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground shadow">
                  <p className="font-medium">AI summary</p>
                  <p>{aiSummary}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-border bg-background px-6 py-3">
          {activeTypers.length > 0 && (
            <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
              {activeTypers.map((item) => item.uid).join(', ')} typing…
            </p>
          )}
          {draftReplies.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2" aria-label="AI suggested replies">
              <span className="text-xs uppercase text-muted-foreground">Suggested replies</span>
              {draftReplies.map((draft) => (
                <Button
                  key={draft}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const textarea = document.querySelector<HTMLTextAreaElement>('#message-composer-input');
                    if (textarea) {
                      textarea.value = draft;
                      textarea.focus();
                    }
                  }}
                >
                  <Reply className="mr-2 h-3 w-3" />
                  {draft}
                </Button>
              ))}
            </div>
          )}
          <MessageComposer
            onSend={handleSend}
            disabled={sending}
            onTyping={(typing) => {
              void setTypingState(typing);
            }}
          />
        </footer>
      </div>
    </div>
  );
};

const MessageComposer = ({
  onSend,
  disabled,
  onTyping
}: {
  onSend: (payload: {
    text: string;
    attachments: DraftAttachment[];
    reportProgress: (id: string, progress: number) => void;
  }) => Promise<void>;
  disabled?: boolean;
  onTyping?: (typing: boolean) => void;
}) => {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      attachments.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
    };
  }, [attachments]);

  const notifyTyping = (typing: boolean) => {
    if (!onTyping) return;
    onTyping(typing);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => onTyping(false), 2000);
  };

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(event.target.value);
    notifyTyping(true);
  };

  const addAttachments = (files: FileList | null) => {
    if (!files) return;
    const next: DraftAttachment[] = [];
    Array.from(files).forEach((file) => {
      next.push({
        id: nanoid(),
        file,
        previewUrl: URL.createObjectURL(file),
        kind: resolveKind(file),
        progress: 0
      });
    });
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const attachment = prev.find((item) => item.id === id);
      if (attachment) URL.revokeObjectURL(attachment.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const reportProgress = (id: string, progress: number) => {
    setAttachments((prev) =>
      prev.map((attachment) =>
        attachment.id === id
          ? {
              ...attachment,
              progress
            }
          : attachment
      )
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || disabled) return;
    setSubmitting(true);

    try {
      await onSend({ text: value, attachments, reportProgress });
      setValue('');
      setAttachments([]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={handleSubmit} aria-label="Message composer">
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(event) => addAttachments(event.target.files)}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || submitting}
        >
          <Paperclip className="h-4 w-4" />
          <span className="sr-only">Attach files</span>
        </Button>
        <Textarea
          id="message-composer-input"
          value={value}
          onChange={onChange}
          placeholder="Write a message…"
          className="min-h-[52px] flex-1 resize-none"
          disabled={disabled || submitting}
          aria-label="Message input"
        />
        <Button type="submit" disabled={disabled || submitting || (!value.trim() && attachments.length === 0)}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="sr-only">Send message</span>
        </Button>
      </div>

      {attachments.length > 0 && (
        <AttachmentPreviewList attachments={attachments} onRemove={removeAttachment} />
      )}
    </form>
  );
};

const AttachmentPreviewList = ({
  attachments,
  onRemove
}: {
  attachments: DraftAttachment[];
  onRemove: (id: string) => void;
}) => (
  <div className="flex flex-wrap gap-3" aria-label="Attachments">
    {attachments.map((attachment) => (
      <div
        key={attachment.id}
        className="relative flex h-20 w-32 flex-col overflow-hidden rounded-md border border-border"
      >
        {attachment.kind === 'image' ? (
          <img
            src={attachment.previewUrl}
            alt={attachment.file.name}
            className="h-full w-full object-cover"
          />
        ) : attachment.kind === 'video' ? (
          <video src={attachment.previewUrl} className="h-full w-full object-cover" muted />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <FileIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          className="absolute right-1 top-1 rounded-full bg-background/80 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(attachment.id)}
          aria-label={`Remove ${attachment.file.name}`}
        >
          ×
        </button>
        {attachment.progress > 0 && attachment.progress < 100 && (
          <div className="absolute bottom-0 left-0 h-1 w-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${attachment.progress}%` }} />
          </div>
        )}
      </div>
    ))}
  </div>
);

const ChatMessageItem = ({
  message,
  participants,
  currentUserId,
  reactions,
  onReact,
  onEdit,
  onDelete
}: {
  message: MessageRecord;
  participants: string[];
  currentUserId: string;
  reactions: string[];
  onReact: (message: MessageRecord, emoji: string) => void;
  onEdit: (messageId: string, value: string) => void;
  onDelete: (messageId: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text ?? '');
  const isOwn = message.senderId === currentUserId;
  const deleted = Boolean(message.deletedAt);
  const status = messageStatus(message, currentUserId, participants);
  const timestamp = messageTimestamp(message);
  const edited = editedLabel(message);
  const deletedMessage = deletedLabel(message);
  const reactionEntries = Object.entries(message.reactions ?? {});

  const toggleEdit = () => {
    setEditing((prev) => !prev);
    setEditValue(message.text ?? '');
  };

  const submitEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onEdit(message.messageId, editValue);
    setEditing(false);
  };

  return (
    <article
      className={cn('group flex flex-col gap-1', isOwn ? 'items-end text-right' : 'items-start text-left')}
      aria-label={`Message from ${message.senderId}`}
    >
      <div
        className={cn(
          'max-w-[75%] rounded-lg px-3 py-2 text-sm shadow transition',
          isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        )}
      >
        {deletedMessage ? (
          <span className="italic text-muted-foreground">{deletedMessage}</span>
        ) : editing ? (
          <form className="space-y-2" onSubmit={submitEdit}>
            <Textarea value={editValue} onChange={(event) => setEditValue(event.target.value)} aria-label="Edit message" />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={toggleEdit}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </form>
        ) : (
          <Fragment>
            {message.text && <p>{message.text}</p>}
            {message.attachments && message.attachments.length > 0 && (
              <ul className="mt-2 space-y-2">
                {message.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    {attachment.contentType.startsWith('image/') ? (
                      <img
                        src={attachment.downloadURL}
                        alt={attachment.name}
                        className="max-h-48 rounded-md object-cover"
                      />
                    ) : attachment.contentType.startsWith('video/') ? (
                      <video src={attachment.downloadURL} controls className="max-h-48 rounded-md" />
                    ) : (
                      <a
                        href={attachment.downloadURL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-muted bg-background/60 px-3 py-2 text-sm hover:bg-background"
                      >
                        <FileIcon className="h-4 w-4" />
                        {attachment.name}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {edited && <span className="ml-2 text-[10px] uppercase">{edited}</span>}
          </Fragment>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden>{timestamp}</span>
        {status && <span aria-label={`Message status: ${status}`}>{status}</span>}
      </div>

      {reactionEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {reactionEntries.map(([emoji, users]) => {
            const reacted = users.includes(currentUserId);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message, emoji)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-1 transition',
                  reacted ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted'
                )}
                aria-pressed={reacted}
                aria-label={`${emoji} reaction, ${users.length} ${users.length === 1 ? 'person' : 'people'}`}
              >
                <span>{emoji}</span>
                <span>{users.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {!deleted && (
        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          {reactions.map((emoji) => {
            const reacted = Boolean(message.reactions?.[emoji]?.includes(currentUserId));
            return (
              <Button
                key={emoji}
                type="button"
                size="icon"
                variant={reacted ? 'secondary' : 'ghost'}
                onClick={() => onReact(message, emoji)}
                aria-pressed={reacted}
                aria-label={`Add reaction ${emoji}`}
                className="h-8 w-8 text-lg"
              >
                {emoji}
              </Button>
            );
          })}
          {isOwn && !isOptimistic(message.messageId) && (
            <Fragment>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={toggleEdit}
                aria-label="Edit message"
              >
                <PenLine className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => onDelete(message.messageId)}
                aria-label="Delete message"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Fragment>
          )}
        </div>
      )}
    </article>
  );
};

