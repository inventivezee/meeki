import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openNew = vi.hoisted(() => vi.fn());
const recommendedModel = vi.hoisted(() => vi.fn());
const activeDownloads = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { openNew: typeof openNew }) => unknown) =>
    selector({ openNew }),
}));

vi.mock("@meeki/plugin-local-llm", () => ({
  commands: { recommendedModel, downloadModel: vi.fn() },
}));

vi.mock("~/contexts/notifications", () => ({
  useNotifications: () => ({ activeDownloads: activeDownloads.current }),
}));

import { ConfigError } from "./config-error";

function renderCard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ConfigError />
    </QueryClientProvider>,
  );
}

describe("ConfigError", () => {
  afterEach(() => {
    cleanup();
    openNew.mockReset();
    recommendedModel.mockReset();
    activeDownloads.current = [];
  });

  it("names the model and its size so the download is not a surprise", async () => {
    recommendedModel.mockResolvedValue({
      status: "ok",
      data: {
        model: {
          key: "gemma-4-26b-a4b",
          name: "Gemma 4 26B A4B",
          size_bytes: 13_597_177_568,
        },
        total_memory_bytes: 24 * 1024 * 1024 * 1024,
      },
    });

    renderCard();

    expect(screen.getByText("Set up AI summaries")).not.toBeNull();
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Download Gemma 4 26B A4B (13.6 GB)",
        }),
      ).not.toBeNull();
    });
    expect(
      screen.getByRole("button", { name: "Use an API key" }),
    ).not.toBeNull();
  });

  it("never offers a Pro trial, which has no working purchase path", async () => {
    recommendedModel.mockResolvedValue({
      status: "ok",
      data: { model: null, total_memory_bytes: 0 },
    });

    renderCard();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Get Pro" })).toBeNull();
    });
    expect(screen.queryByText(/Pro trial/)).toBeNull();
    // The account pane is delisted from the settings nav, so nothing should
    // send a user there.
    expect(openNew).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: { tab: "account" } }),
    );
  });

  it("reflects a download already running rather than offering another", async () => {
    recommendedModel.mockResolvedValue({
      status: "ok",
      data: {
        model: {
          key: "gemma-4-12b",
          name: "Gemma 4 12B",
          size_bytes: 7_121_861_440,
        },
        total_memory_bytes: 16 * 1024 * 1024 * 1024,
      },
    });
    activeDownloads.current = [
      {
        model: "gemma-4-12b",
        displayName: "Gemma 4 12B",
        progress: 42,
        downloadedBytes: 3_000_000_000,
        totalBytes: 7_121_861_440,
        paused: false,
      },
    ];

    renderCard();

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /Downloading/ });
      expect(button.hasAttribute("disabled")).toBe(true);
    });
  });
});
