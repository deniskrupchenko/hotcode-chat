'use client';

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthContext } from "@/components/providers/auth-context";

import { LoginForm } from "./login-form";

export const LoginScreen = () => {
  const { user, loading } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/c");
    }
  }, [loading, router, user]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-muted/20 px-6 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to continue the conversation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <LoginForm />
            <div className="text-center text-sm text-muted-foreground">
              <p>
                By using HotCodeChat you agree to our{" "}
                <Button
                  variant="link"
                  className="p-0 text-muted-foreground"
                  onClick={() => router.push("/policies")}
                >
                  community policies
                </Button>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

