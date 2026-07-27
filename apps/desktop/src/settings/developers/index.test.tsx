import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkEmbeddedCli: vi.fn(),
  installEmbeddedCli: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("~/types/tauri.gen", () => ({
  commands: {
    checkEmbeddedCli: mocks.checkEmbeddedCli,
    installEmbeddedCli: mocks.installEmbeddedCli,
  },
}));

vi.mock("@meeki/plugin-opener2", () => ({
  commands: { openUrl: vi.fn() },
}));

vi.mock("@meeki/ui/components/ui/toast", () => ({
  sonnerToast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import {
  SettingsDevelopers,
  buildMcpConfiguration,
  getCliInstallNotification,
} from "./index";

describe("buildMcpConfiguration", () => {
  it("uses the exact installed CLI path", () => {
    const configuration = JSON.parse(
      buildMcpConfiguration("/Users/test/.local/bin/meeki"),
    );

    expect(configuration).toEqual({
      mcpServers: {
        meeki: {
          command: "/Users/test/.local/bin/meeki",
          args: ["mcp"],
        },
      },
    });
  });
});

describe("getCliInstallNotification", () => {
  it("reports installed as success", () => {
    expect(
      getCliInstallNotification({
        supported: true,
        commandName: "meeki",
        installPath: "/Users/test/.local/bin/meeki",
        state: "installed",
        details: "Installed.",
      }),
    ).toEqual({ type: "success", message: "meeki is ready to use" });
  });

  it.each(["resource_missing", "unsupported"] as const)(
    "reports %s as an install error",
    (state) => {
      expect(
        getCliInstallNotification({
          supported: false,
          commandName: "meeki",
          installPath: "/Users/test/.local/bin/meeki",
          state,
          details: "The CLI is unavailable in this build.",
        }),
      ).toEqual({
        type: "error",
        message: "The CLI is unavailable in this build.",
      });
    },
  );
});

describe("SettingsDevelopers", () => {
  beforeEach(() => {
    mocks.checkEmbeddedCli.mockReset();
    mocks.installEmbeddedCli.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the installed CLI and uses its absolute path for MCP", async () => {
    mocks.checkEmbeddedCli.mockResolvedValue({
      status: "ok",
      data: {
        supported: true,
        commandName: "meeki",
        installPath: "/Users/test/.local/bin/meeki",
        state: "installed",
        details:
          "Installed at /Users/test/.local/bin/meeki and managed by Meeki.",
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsDevelopers />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Reinstall")).toBeTruthy();
    expect(
      screen.getAllByText(/\/Users\/test\/\.local\/bin\/meeki/).length,
    ).toBeGreaterThan(0);
  });

  it("does not expose a nonexistent MCP path when the CLI is unsupported", async () => {
    mocks.checkEmbeddedCli.mockResolvedValue({
      status: "ok",
      data: {
        supported: false,
        commandName: "meeki-dev",
        installPath: "/Users/test/.local/bin/meeki-dev",
        state: "unsupported",
        details: "Bundled CLI installation is currently available on macOS.",
      },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsDevelopers />
      </QueryClientProvider>,
    );

    const copyButton = await screen.findByRole("button", { name: "Copy" });
    expect(copyButton.hasAttribute("disabled")).toBe(true);
    expect(
      screen.queryByText(/\/Users\/test\/\.local\/bin\/meeki-dev/),
    ).toBeNull();
  });
});
