import { Metadata } from "next";

import { LoginScreen } from "@/components/auth/login-screen";

export const metadata: Metadata = {
  title: "Sign in · HotCodeChat"
};

export default function LoginPage() {
  return <LoginScreen />;
}

