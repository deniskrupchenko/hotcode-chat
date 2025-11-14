import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { Providers } from "@/app/providers";

export const metadata: Metadata = {
  title: "HotCodeChat",
  description: "Realtime AI-powered chat built with Next.js and Firebase."
};

type RootLayoutProps = { children: ReactNode };

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
