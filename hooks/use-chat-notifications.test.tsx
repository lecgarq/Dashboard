// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanelProvider } from "@/components/dashboard/chat-panel-context";
import { useChatNotifications } from "./use-chat-notifications";

const eventSourceMock = vi.hoisted(() => vi.fn());
const trpcMocks = vi.hoisted(() => ({
  useUtils: vi.fn(),
}));

vi.mock("@/hooks/use-event-source", () => ({
  useEventSource: eventSourceMock,
}));

vi.mock("@/lib/client/sound-engine", () => ({
  primeSoundEngine: vi.fn(),
  queueNotificationSound: vi.fn(),
  requestBrowserNotificationPermission: vi.fn(),
  warmSoundEngine: vi.fn(),
}));

vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: trpcMocks.useUtils,
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <ChatPanelProvider>{children}</ChatPanelProvider>;
}

describe("useChatNotifications", () => {
  beforeEach(() => {
    eventSourceMock.mockClear();
    trpcMocks.useUtils.mockReturnValue({
      chat: {
        getMessages: { invalidate: vi.fn() },
        getSpaces: { invalidate: vi.fn() },
      },
    });
  });

  it("does not open the Google Chat SSE stream while the chat drawer is closed", () => {
    renderHook(() => useChatNotifications(true), { wrapper });

    expect(eventSourceMock).toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.any(Function),
      false,
    );
  });
});
