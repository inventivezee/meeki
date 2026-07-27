import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const createPermission = () => ({
    status: "denied" as "authorized" | "denied" | "neverRequested",
    isPending: false,
    open: vi.fn(),
    request: vi.fn(),
    reset: vi.fn(),
  });
  const permissions = {
    microphone: createPermission(),
    systemAudio: createPermission(),
    accessibility: createPermission(),
  };

  return {
    currentPlatform: "macos",
    permissions,
    usePermission: vi.fn((type: keyof typeof permissions) => permissions[type]),
  };
});

const lingui = vi.hoisted(() => ({
  t: (input: TemplateStringsArray, ...values: unknown[]) =>
    input.reduce(
      (message, part, index) =>
        `${message}${part}${index < values.length ? String(values[index]) : ""}`,
      "",
    ),
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: lingui.t }),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: () => mocks.currentPlatform,
}));

vi.mock("~/shared/hooks/usePermissions", () => ({
  usePermission: mocks.usePermission,
}));

import { PermissionsSection } from "./permissions";

afterEach(cleanup);

describe("PermissionsSection", () => {
  beforeEach(() => {
    mocks.currentPlatform = "macos";
    vi.clearAllMocks();

    Object.values(mocks.permissions).forEach((permission) => {
      permission.status = "denied";
      permission.isPending = false;
    });
  });

  it("shows optional Accessibility permission on macOS", () => {
    const { container } = render(<PermissionsSection />);

    expect(screen.getByText("Help Meeki listen to you")).toBeTruthy();
    expect(screen.getByText("Help Meeki listen to others")).toBeTruthy();
    expect(screen.getByText("Optional: read meeting activity")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Enable accessibility" })
        .getAttribute("title"),
    ).toBe(
      "Optional. Used for meeting controls, visible chat, mute sync, and participant status — not required to record",
    );
    expect(container.querySelectorAll(".lucide-arrow-right")).toHaveLength(3);
  });

  it("stays on macOS permissions until Accessibility is granted or skipped", () => {
    const onContinue = vi.fn();
    mocks.permissions.microphone.status = "authorized";
    mocks.permissions.systemAudio.status = "authorized";
    mocks.permissions.accessibility.status = "denied";

    render(<PermissionsSection onContinue={onContinue} />);

    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText("Optional: read meeting activity")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Skip Accessibility" }),
    ).toBeTruthy();
  });

  it("continues on macOS once Accessibility is granted", () => {
    const onContinue = vi.fn();
    mocks.permissions.microphone.status = "authorized";
    mocks.permissions.systemAudio.status = "authorized";
    mocks.permissions.accessibility.status = "authorized";

    const view = render(<PermissionsSection onContinue={onContinue} />);

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Skip Accessibility" }),
    ).toBeNull();

    view.rerender(<PermissionsSection onContinue={onContinue} />);

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("continues on macOS when Accessibility is skipped", () => {
    const onContinue = vi.fn();
    mocks.permissions.microphone.status = "authorized";
    mocks.permissions.systemAudio.status = "authorized";
    mocks.permissions.accessibility.status = "denied";

    render(<PermissionsSection onContinue={onContinue} />);

    fireEvent.click(screen.getByRole("button", { name: "Skip Accessibility" }));

    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("preserves the audio-only flow outside macOS", () => {
    const onContinue = vi.fn();
    mocks.currentPlatform = "windows";
    mocks.permissions.microphone.status = "authorized";
    mocks.permissions.systemAudio.status = "authorized";

    render(<PermissionsSection onContinue={onContinue} />);

    expect(screen.queryByText("Optional: read meeting activity")).toBeNull();
    expect(mocks.usePermission).not.toHaveBeenCalledWith("accessibility");
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("requests denied Accessibility permission instead of opening Settings", () => {
    render(<PermissionsSection />);

    fireEvent.click(
      screen.getByRole("button", { name: "Enable accessibility" }),
    );

    expect(mocks.permissions.accessibility.request).toHaveBeenCalledTimes(1);
    expect(mocks.permissions.accessibility.open).not.toHaveBeenCalled();
  });
});
