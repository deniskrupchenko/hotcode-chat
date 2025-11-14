'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitHandler, useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, UserPlus } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthContext } from "@/components/providers/auth-context";
import {
  emailPasswordSignIn,
  emailPasswordSignUp,
  requestPasswordReset,
  signInWithGoogle
} from "@/lib/firebase/auth";
import { featureFlags } from "@/lib/env";
import { toast } from "sonner";

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  displayName: z
    .string()
    .min(2, "Display name must be at least 2 characters")
    .optional()
    .or(z.literal(""))
});

type FormValues = z.infer<typeof formSchema>;

export const LoginForm = () => {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { refresh } = useAuthContext();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      displayName: ""
    }
  });

  const refreshWithFallback = async () => {
    let finished = false;
    let encounteredError = false;

    const refreshPromise = refresh()
      .then(() => {
        finished = true;
      })
      .catch((error) => {
        finished = true;
        encounteredError = true;
        console.warn("[auth] refresh failed", error);
      });

    if (typeof window === "undefined") {
      await refreshPromise;
      return;
    }

    await Promise.race([
      refreshPromise,
      new Promise<void>((resolve) => {
        window.setTimeout(() => {
          if (!finished && !encounteredError) {
            toast.info("We are finishing syncing your profile.");
          }
          resolve();
        }, 5000);
      })
    ]);
  };

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    setLoading(true);
    try {
      if (mode === "signin") {
        await emailPasswordSignIn(values.email, values.password);
      } else {
        const newUser = await emailPasswordSignUp(values.email, values.password, values.displayName);
        toast.success(`👋 Welcome aboard, ${newUser.displayName ?? "friend"}!`);
      }
      await refreshWithFallback();
      window.location.replace("/c");
    } catch (error) {
      console.error(error);
      toast.error("Authentication failed. Please check your credentials.");
      setLoading(false);
    }
  };

  const onGoogleSignIn = async () => {
    if (!featureFlags.googleAuth) {
      toast.info("Google sign-in is currently disabled.");
      return;
    }

    setLoading(true);
    try {
      await signInWithGoogle();
      await refreshWithFallback();
      toast.success("Signed in with Google");
      window.location.replace("/c");
    } catch (error) {
      console.error(error);
      toast.error("Google sign-in failed.");
      setLoading(false);
    }
  };

  const onResetPassword = async () => {
    const email = prompt("Enter your email to reset password:");
    if (!email) return;

    try {
      await requestPasswordReset(email);
      toast.success("Password reset email sent.");
    } catch (error) {
      console.error(error);
      toast.error("Unable to send reset email.");
    }
  };

  return (
    <>
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">We are finishing syncing your profile…</p>
          </div>
        </div>
      )}

    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {mode === "signup" && (
        <div className="space-y-2">
          <Label htmlFor="displayName">Display name</Label>
          <Input id="displayName" placeholder="How should we call you?" {...register("displayName")} />
          {errors.displayName && (
            <p className="text-sm text-destructive">{errors.displayName.message}</p>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : mode === "signin" ? (
          <Mail className="mr-2 h-4 w-4" />
        ) : (
          <UserPlus className="mr-2 h-4 w-4" />
        )}
        {mode === "signin" ? "Continue" : "Create account"}
      </Button>

      <div className="flex items-center justify-between text-sm">
        <Button variant="link" type="button" onClick={onResetPassword} disabled={loading}>
          Forgot password?
        </Button>
        <Button
          variant="link"
          type="button"
          disabled={loading}
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Need an account?" : "Already have an account?"}
        </Button>
      </div>

      {featureFlags.googleAuth && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGoogleSignIn}
          disabled={loading}
        >
          Continue with Google
        </Button>
      )}
    </form>
    </>
  );
};

