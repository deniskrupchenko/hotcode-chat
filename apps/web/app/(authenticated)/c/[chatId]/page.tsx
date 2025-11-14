import { Suspense } from "react";

import { ChatRoom } from "@/components/chats/chat-room";

export default function ChatRoomPage({ params }: { params: { chatId: string } }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center">Loading chat…</div>}>
      <ChatRoom chatId={params.chatId} />
    </Suspense>
  );
}

