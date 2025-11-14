'use client';

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Loader2 } from "lucide-react";

import { useAuthContext } from "@/components/providers/auth-context";

export const LandingRouter = () => {
  const { user, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (user) {
      router.replace("/c");
    } else {
      router.replace("/login");
    }
  }, [loading, router, user]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading…</span>
    </div>
  );
};

