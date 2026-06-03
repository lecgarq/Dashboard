// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./ChatPanel";
import { ChatPanelProvider } from "./chat-panel-context";

const trpcMocks = vi.hoisted(() => ({
  getSpacesUseQuery: vi.fn(),
  getPresenceUseQuery: vi.fn(),
  getMessagesUseQuery: vi.fn(),
  sendMessageUseMutation: vi.fn(),
  useUtils: vi.fn(),
}));

vi.mock("@/components/providers/dashboard-auth-provider", () => ({
  useDashboardAuth: () => ({
    hasGoogleChat: true,
    user: { id: "u1", name: "Test User", email: "user@example.com", image: null },
  }),
}));

vi.mock("@/lib/google/oauth-connect", () => ({
  startOAuthConnect: vi.fn(),
}));

vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    useUtils: trpcMocks.useUtils,
    chat: {
      getSpaces: { useQuery: trpcMocks.getSpacesUseQuery },
      getPresence: { useQuery: trpcMocks.getPresenceUseQuery },
      getMessages: { useQuery: trpcMocks.getMessagesUseQuery },
      sendMessage: { useMutation: trpcMocks.sendMessageUseMutation },
    },
  },
}));

function renderChatPanel() {
  return render(
    <ChatPanelProvider>
      <ChatPanel />
    </ChatPanelProvider>,
  );
}

describe("ChatPanel", () => {
  beforeEach(() => {
    trpcMocks.getSpacesUseQuery.mockReturnValue({
      data: { status: "ok", spaces: [] },
      error: null,
      isLoading: false,
    });
    trpcMocks.getPresenceUseQuery.mockReturnValue({ data: {}, error: null, isLoading: false });
    trpcMocks.getMessagesUseQuery.mockReturnValue({
      data: { status: "ok", messages: [] },
      error: null,
      isLoading: false,
    });
    trpcMocks.sendMessageUseMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    trpcMocks.useUtils.mockReturnValue({
      chat: {
        getMessages: { invalidate: vi.fn() },
        getSpaces: { invalidate: vi.fn() },
      },
    });
  });

  it("keeps the Google Chat space query disabled while the drawer is closed", () => {
    renderChatPanel();

    expect(trpcMocks.getSpacesUseQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: false }),
    );
    expect(trpcMocks.getPresenceUseQuery).toHaveBeenCalledWith(
      { emails: [] },
      expect.objectContaining({ enabled: false }),
    );
  });

  it("enables the Google Chat space query after the drawer opens", () => {
    renderChatPanel();

    fireEvent.click(screen.getByTitle("Open Google Chat"));

    expect(trpcMocks.getSpacesUseQuery).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: true }),
    );
  });
});
