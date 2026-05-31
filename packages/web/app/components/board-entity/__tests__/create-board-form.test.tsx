import { describe, it, expect, vi, beforeEach } from "vite-plus/test";
import { render, act } from "@testing-library/react";
import React from "react";
import { tFromCatalog } from "@/app/__test-helpers__/i18n-mock";
import { useWsAuthToken } from "@/app/hooks/use-ws-auth-token";
import CreateBoardForm from "../create-board-form";

vi.mock("react-i18next", () => ({
  useTranslation: (ns?: string) => ({
    t: (key: string, options?: Record<string, unknown>) => tFromCatalog(ns, key, options),
    i18n: { language: "en-US" },
  }),
  Trans: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

const mockShowMessage = vi.fn();
vi.mock("@/app/components/providers/snackbar-provider", () => ({
  useSnackbar: () => ({ showMessage: mockShowMessage }),
}));

vi.mock("@/app/hooks/use-ws-auth-token", () => ({
  useWsAuthToken: vi.fn(),
}));
const mockUseWsAuthToken = vi.mocked(useWsAuthToken);

const mockRequest = vi.fn();
vi.mock("@/app/lib/graphql/client", () => ({
  createGraphQLHttpClient: () => ({ request: mockRequest }),
}));

vi.mock("@/app/lib/i18n/use-locale-router", () => ({
  useLocaleRouter: () => ({ push: vi.fn() }),
}));

let capturedOnError: ((error: unknown, serverMessage: string | null) => Promise<void>) | null = null;
vi.mock("@/app/hooks/use-entity-mutation", () => ({
  useEntityMutation: (_mutation: unknown, opts: { onError?: (e: unknown, s: string | null) => Promise<void> }) => {
    capturedOnError = opts.onError ?? null;
    return { execute: vi.fn(), token: "test-token" };
  },
}));

vi.mock("../board-form", () => ({
  default: () => React.createElement("div", { "data-testid": "board-form" }),
}));

vi.mock("@boardsesh/graphql/operations", () => ({
  CREATE_BOARD: "CREATE_BOARD",
  GET_MY_BOARDS: "GET_MY_BOARDS",
}));

const defaultProps = {
  boardType: "kilter",
  layoutId: 1,
  sizeId: 2,
  setIds: "set-1",
  defaultAngle: 40,
};

const matchingBoard = {
  name: "Home Wall",
  boardType: "kilter",
  layoutId: 1,
  sizeId: 2,
  setIds: "set-1",
  slug: "home-wall",
  angle: 40,
};

function renderAndGetOnError(props = defaultProps) {
  render(React.createElement(CreateBoardForm, props));
  return capturedOnError!;
}

describe("CreateBoardForm — handleCreateError", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRequest.mockReset();
    capturedOnError = null;
    mockUseWsAuthToken.mockReturnValue({
      token: "test-token",
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it("shows duplicate snackbar with Go to your board action when match found", async () => {
    const onError = renderAndGetOnError();
    mockRequest.mockResolvedValueOnce({
      myBoards: { boards: [matchingBoard], hasMore: false, totalCount: 1 },
    });

    await act(async () => {
      await onError(new Error("duplicate"), "You already have a board with this configuration");
    });

    expect(mockShowMessage).toHaveBeenCalledTimes(1);
    const [message, severity, action, duration] = mockShowMessage.mock.calls[0];
    expect(severity).toBe("error");
    expect(duration).toBe(8000);
    expect(message).toContain("Home Wall");
    expect(action).toMatchObject({ label: expect.any(String) });
  });

  it("falls back to serverMessage when no matching board found", async () => {
    const onError = renderAndGetOnError();
    mockRequest.mockResolvedValueOnce({
      myBoards: { boards: [], hasMore: false, totalCount: 0 },
    });

    await act(async () => {
      await onError(new Error("error"), "server error message");
    });

    expect(mockShowMessage).toHaveBeenCalledWith("server error message", "error");
  });

  it("falls back to i18n error key when no match and no serverMessage", async () => {
    const onError = renderAndGetOnError();
    mockRequest.mockResolvedValueOnce({
      myBoards: { boards: [], hasMore: false, totalCount: 0 },
    });

    await act(async () => {
      await onError(new Error("error"), null);
    });

    expect(mockShowMessage).toHaveBeenCalledWith(
      "Failed to create board. It may already exist for this configuration.",
      "error",
    );
  });

  it("falls back to serverMessage when findBoardForConfig throws", async () => {
    const onError = renderAndGetOnError();
    mockRequest.mockRejectedValueOnce(new Error("network failure"));

    await act(async () => {
      await onError(new Error("error"), "server error message");
    });

    expect(mockShowMessage).toHaveBeenCalledWith("server error message", "error");
  });

  it("skips board lookup and falls back to serverMessage when token is null", async () => {
    mockUseWsAuthToken.mockReturnValue({
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
    const onError = renderAndGetOnError();

    await act(async () => {
      await onError(new Error("error"), "server error message");
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(mockShowMessage).toHaveBeenCalledWith("server error message", "error");
  });

  it("paginates until a match is found across multiple pages", async () => {
    const onError = renderAndGetOnError();
    // First page: no match, hasMore true
    mockRequest.mockResolvedValueOnce({
      myBoards: {
        boards: [{ ...matchingBoard, boardType: "tension", setIds: "other" }],
        hasMore: true,
        totalCount: 51,
      },
    });
    // Second page: contains the match
    mockRequest.mockResolvedValueOnce({
      myBoards: { boards: [matchingBoard], hasMore: false, totalCount: 51 },
    });

    await act(async () => {
      await onError(new Error("duplicate"), "You already have a board with this configuration");
    });

    expect(mockRequest).toHaveBeenCalledTimes(2);
    const [message, severity, , duration] = mockShowMessage.mock.calls[0];
    expect(severity).toBe("error");
    expect(duration).toBe(8000);
    expect(message).toContain("Home Wall");
  });
});
