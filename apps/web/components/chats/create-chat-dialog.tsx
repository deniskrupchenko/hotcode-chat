'use client';

import { useEffect, useMemo, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useAuthContext } from "@/components/providers/auth-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUserSearch } from "@/hooks/use-user-search";
import { startDirectMessage } from "@/lib/firestore/chats";
import { db } from "@/lib/firebase/client";
import { type User } from "@shared/index";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const groupSchema = z.object({
  name: z.string().min(2, "Group name required"),
  description: z.string().max(280).optional().or(z.literal("")),
  avatarUrl: z
    .string()
    .url("Enter a valid image URL")
    .optional()
    .or(z.literal(""))
});

type GroupFormValues = z.infer<typeof groupSchema>;

export const CreateChatDialog = ({ open, onOpenChange }: Props) => {
  const { user } = useAuthContext();
  const router = useRouter();
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [dmSearchTerm, setDmSearchTerm] = useState("");
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const [dmLoadingId, setDmLoadingId] = useState<string | null>(null);
  const [groupCreating, setGroupCreating] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);

  const {
    register,
    handleSubmit,
    reset: resetGroupForm,
    formState: { errors }
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      description: "",
      avatarUrl: ""
    }
  });

  useEffect(() => {
    if (!open) {
      setMode("dm");
      setDmSearchTerm("");
      setGroupSearchTerm("");
      setSelectedMembers([]);
      setDmLoadingId(null);
      setGroupCreating(false);
      resetGroupForm();
    }
  }, [open, resetGroupForm]);

  const currentUserId = user?.uid;

  const dmResults = useUserSearch(dmSearchTerm, {
    excludeIds: [currentUserId ?? ""],
    limit: 12
  });

  const groupResults = useUserSearch(groupSearchTerm, {
    excludeIds: [currentUserId ?? "", ...selectedMembers.map((member) => member.uid)],
    limit: 12
  });

  const selectedMemberIds = useMemo(
    () => new Set(selectedMembers.map((member) => member.uid)),
    [selectedMembers]
  );

  if (!user) return null;

  const handleStartDirectMessage = async (target: User) => {
    setDmLoadingId(target.uid);
    try {
      const chatId = await startDirectMessage(user, target);
      toast.success(`Chat ready with ${target.displayName ?? target.email}`);
      onOpenChange(false);
      router.push(`/c/${chatId}`);
    } catch (error) {
      console.error("[CreateChatDialog] Failed to start DM", error);
      toast.error("Unable to start direct message");
    } finally {
      setDmLoadingId(null);
    }
  };

  const handleAddMember = (candidate: User) => {
    if (candidate.uid === user.uid) return;
    if (selectedMemberIds.has(candidate.uid)) return;
    setSelectedMembers((prev) => [...prev, candidate]);
    setGroupSearchTerm("");
  };

  const handleRemoveMember = (uid: string) => {
    setSelectedMembers((prev) => prev.filter((member) => member.uid !== uid));
  };

  const handleCreateGroup = handleSubmit(async (values) => {
    if (!selectedMembers.length) {
      toast.error("Add at least one participant to the group.");
      return;
    }

    setGroupCreating(true);
    try {
      const chatRef = doc(collection(db, "chats"));
      const timestamp = serverTimestamp();
      const participants = Array.from(new Set([user.uid, ...selectedMembers.map((member) => member.uid)]));

      await setDoc(chatRef, {
        chatId: chatRef.id,
        type: "group",
        name: values.name,
        description: values.description ?? "",
        avatarUrl: values.avatarUrl || null,
        participants,
        createdAt: timestamp,
        updatedAt: timestamp,
        lastMessage: null,
        lastMessageAt: null
      });

      toast.success("Group created.");
      onOpenChange(false);
      router.push(`/c/${chatRef.id}`);
    } catch (error) {
      console.error("[CreateChatDialog] Failed to create group", error);
      toast.error("Unable to create group chat");
    } finally {
      setGroupCreating(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>Start a direct message or open a group chat.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <Button
            type="button"
            variant={mode === "dm" ? "default" : "outline"}
            onClick={() => setMode("dm")}
            className="flex-1"
          >
            Direct message
          </Button>
          <Button
            type="button"
            variant={mode === "group" ? "default" : "outline"}
            onClick={() => setMode("group")}
            className="flex-1"
          >
            Group chat
          </Button>
        </div>

        {mode === "dm" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dmSearch">Search teammates</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="dmSearch"
                  value={dmSearchTerm}
                  onChange={(event) => setDmSearchTerm(event.target.value)}
                  placeholder="Search by name or email"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              {dmResults.loading ? (
                <SearchResultsSkeleton />
              ) : dmResults.error ? (
                <p className="text-sm text-destructive">{dmResults.error}</p>
              ) : dmResults.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users match that search.</p>
              ) : (
                <ul className="space-y-2">
                  {dmResults.users.map((candidate) => (
                    <li
                      key={candidate.uid}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{candidate.displayName ?? candidate.email}</p>
                        <p className="text-xs text-muted-foreground">{candidate.email}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStartDirectMessage(candidate)}
                        disabled={dmLoadingId === candidate.uid}
                      >
                        {dmLoadingId === candidate.uid ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Start chat
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleCreateGroup}>
            <div className="space-y-2">
              <Label htmlFor="groupName">Group name</Label>
              <Input id="groupName" placeholder="Product Sync" {...register("name")} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="groupDescription">Description</Label>
              <Textarea
                id="groupDescription"
                placeholder="Optional description for the group…"
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="groupAvatar">Avatar URL</Label>
              <Input id="groupAvatar" placeholder="https://example.com/avatar.png" {...register("avatarUrl")} />
              {errors.avatarUrl && (
                <p className="text-sm text-destructive">{errors.avatarUrl.message}</p>
              )}
            </div>

            <div className="space-y-3">
              <Label>Participants</Label>
              <div className="rounded-lg border border-dashed border-border p-3">
                <p className="text-xs text-muted-foreground">
                  {selectedMembers.length === 0
                    ? "No participants added yet."
                    : "Click a participant to remove them from the group."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    You
                  </span>
                  {selectedMembers.map((member) => (
                    <button
                      key={member.uid}
                      type="button"
                      onClick={() => handleRemoveMember(member.uid)}
                      className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs hover:bg-destructive hover:text-destructive-foreground"
                    >
                      {member.displayName}
                      <span className="ml-2 font-bold">×</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={groupSearchTerm}
                    onChange={(event) => setGroupSearchTerm(event.target.value)}
                    placeholder="Search people to add"
                    className="pl-9"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                  {groupResults.loading ? (
                    <SearchResultsSkeleton />
                  ) : groupResults.error ? (
                    <p className="px-3 py-2 text-sm text-destructive">{groupResults.error}</p>
                  ) : groupResults.users.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No users match that search.</p>
                  ) : (
                    <ul>
                      {groupResults.users.map((candidate) => (
                        <li
                          key={candidate.uid}
                          className="flex items-center justify-between border-b border-border px-3 py-2 last:border-none"
                        >
                          <div>
                            <p className="font-medium">{candidate.displayName ?? candidate.email}</p>
                            <p className="text-xs text-muted-foreground">{candidate.email}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleAddMember(candidate)}
                            disabled={selectedMemberIds.has(candidate.uid)}
                          >
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={groupCreating}>
              {groupCreating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Users className="mr-2 h-4 w-4" />
              )}
              Create group
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

const SearchResultsSkeleton = () => (
  <ul>
    {Array.from({ length: 3 }).map((_, index) => (
      <li key={index} className="flex items-center justify-between px-3 py-2">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded bg-muted" />
      </li>
    ))}
  </ul>
);

