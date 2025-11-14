import { Suspense } from "react";

import { ChatsDashboard } from "@/components/chats/chats-dashboard";

export default function ChatsPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center">Loading…</div>}>
      <ChatsDashboard />
    </Suspense>
  );
}

