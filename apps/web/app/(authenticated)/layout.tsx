import { Metadata } from "next";
import { ReactNode } from "react";

import { AuthenticatedShell } from "@/components/layout/authenticated-shell";

export const metadata: Metadata = {
  title: "HotCodeChat",
  description: "Realtime AI-powered chat"
};

type LayoutProps = {
  children: ReactNode;
};

export default function AuthenticatedLayout({ children }: LayoutProps) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}

