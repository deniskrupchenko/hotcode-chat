import { describe, expect, beforeEach, beforeAll, vi, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ChatRoom } from "@/components/chats/chat-room";

const mockPrependOptimistic = vi.fn();
const mockSettleOptimistic = vi.fn();
const mockLoadMore = vi.fn();

const mockMessages = [
  {
    chatId: "chat-1",
    messageId: "msg-1",
    senderId: "user-2",
    text: "Hello there",
    createdAt: new Date(),
    readBy: ["user-1"],
    reactions: {}
  }
];

vi.mock("@/hooks/use-messages", () => ({
  useMessages: vi.fn(() => ({
    messages: mockMessages,
    loading: false,
    loadingMore: false,
    hasMore: false,
    loadMore: mockLoadMore,
    prependOptimistic: mockPrependOptimistic,
    settleOptimistic: mockSettleOptimistic
  }))
}));

vi.mock("@/components/providers/auth-context", () => ({
  useAuthContext: () => ({
    user: {
      uid: "user-1",
      displayName: "Tester",
      email: "tester@example.com"
    }
  })
}));

vi.mock("@/hooks/use-chat-presence", () => ({
  useChatPresence: () => [
    {
      uid: "user-1",
      displayName: "Tester"
    }
  ]
}));

const mockSetTypingState = vi.fn();

vi.mock("@/hooks/use-typing", () => ({
  useTyping: () => ({
    activeTypers: [],
    setTypingState: mockSetTypingState
  })
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: vi.fn((config: { count: number }) => {
    const count = config.count;
    return {
      getVirtualItems: () =>
        Array.from({ length: count }).map((_, index) => ({
          index,
          key: index,
          size: 100,
          start: index * 100,
          end: (index + 1) * 100
        })),
      getTotalSize: () => count * 100,
      measureElement: vi.fn(),
      scrollToIndex: vi.fn()
    };
  })
}));

const mockServerTimestamp = vi.fn(() => new Date());
const mockWriteBatch = vi.fn(() => ({
  set: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined)
}));

const mockOnSnapshot = vi.fn((ref, callback) => {
  callback({
    exists: () => true,
    data: () => ({
    participants: ["user-1", "user-2"],
      type: "dm",
      name: "Direct"
    })
  });
  return () => {};
});

const mockGetDoc = vi.fn(() =>
  Promise.resolve({
    exists: () => true,
    data: () => ({
      chatId: "chat-1",
      messageId: "msg-server",
      senderId: "user-1",
      text: "Hello from server",
      createdAt: new Date(),
      readBy: ["user-1"],
      reactions: {}
    })
  })
);

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: mockGetDoc,
  onSnapshot: mockOnSnapshot,
  serverTimestamp: mockServerTimestamp,
  writeBatch: mockWriteBatch
}));

const mockUploadAttachments = vi.fn(() => Promise.resolve([]));

vi.mock("@/lib/firebase/storage", () => ({
  uploadAttachments: (...args: unknown[]) => mockUploadAttachments(...args)
}));

const mockSendMessage = vi.fn(() =>
  Promise.resolve({
    id: "server-id"
  })
);

const mockToggleReaction = vi.fn();
const mockEditMessage = vi.fn();
const mockSoftDeleteMessage = vi.fn();
const mockMarkMessagesRead = vi.fn();

vi.mock("@/lib/firestore/messages", () => ({
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  toggleReaction: (...args: unknown[]) => mockToggleReaction(...args),
  editMessage: (...args: unknown[]) => mockEditMessage(...args),
  softDeleteMessage: (...args: unknown[]) => mockSoftDeleteMessage(...args),
  markMessagesRead: (...args: unknown[]) => mockMarkMessagesRead(...args)
}));

const mockModerate = vi.fn(() => Promise.resolve({ approved: true }));
const mockSummarize = vi.fn(() => Promise.resolve({ summary: "Summary" }));
const mockDraft = vi.fn(() => Promise.resolve({ suggestions: ["Draft reply"] }));

vi.mock("@/lib/ai", () => ({
  aiModerateMessage: (...args: unknown[]) => mockModerate(...args),
  aiSummarizeChat: (...args: unknown[]) => mockSummarize(...args),
  aiDraftReply: (...args: unknown[]) => mockDraft(...args)
}));

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

beforeEach(() => {
  mockPrependOptimistic.mockClear();
  mockSettleOptimistic.mockClear();
  mockSendMessage.mockClear();
  mockModerate.mockClear();
  mockMarkMessagesRead.mockClear();
});

describe("ChatRoom", () => {
  it("renders existing messages", () => {
    render(<ChatRoom chatId="chat-1" />);
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("sends a new text message", async () => {
    render(<ChatRoom chatId="chat-1" />);

    const textarea = screen.getByLabelText("Message input");
    fireEvent.change(textarea, { target: { value: "New message" } });

    const sendButton = screen.getByRole("button", { name: /send message/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(mockPrependOptimistic).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();
      expect(mockSettleOptimistic).toHaveBeenCalled();
    });
  });
});


