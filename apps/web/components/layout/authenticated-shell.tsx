'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode, useEffect } from "react";

import { BellDot, LogOut } from "lucide-react";

import { ProfileCompletionDialog } from "@/components/auth/profile-completion-dialog";
import { useAuthContext } from "@/components/providers/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  children: ReactNode;
};

export const AuthenticatedShell = ({ children }: Props) => {
  const { user, loading, signOut } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "OPEN_CHAT" && event.data.chatId) {
        router.push(`/c/${event.data.chatId}`);
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
      </div>
    );
  }

  const initials = user.displayName
    ?.split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || user.email?.[0]?.toUpperCase() || "U";

  const onSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted/10">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/c" className="flex items-center gap-2 font-semibold">
            <span className="h-3 w-3 rounded-full bg-primary" />
            HotCodeChat
          </Link>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className={cn("relative", "aria-pressed:bg-muted")}
              aria-label="Notifications"
            >
              <BellDot className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-2" onClick={onSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </Button>
            <Avatar>
              <AvatarImage src={user.photoURL ?? undefined} alt={user.displayName ?? ""} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6">{children}</main>
      <ProfileCompletionDialog />
    </div>
  );
};

