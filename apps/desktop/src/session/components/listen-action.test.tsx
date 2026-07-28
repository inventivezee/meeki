import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttonState: {
    shouldRender: true,
    recording: false,
    finalizing: false,
    isDisabled: false,
    warningMessage: "",
  },
  loading: false,
  stop: vi.fn(),
}));

vi.mock("./shared", () => ({
  RecordingIcon: ({ pulse }: { pulse?: boolean }) => (
    <span data-testid="recording-icon" data-pulse={pulse ? "true" : "false"} />
  ),
  useCurrentNoteHasContent: () => false,
  useListenButtonState: () => mocks.buttonState,
}));

vi.mock("./floating/shared", () => ({
  ActionableTooltipContent: () => null,
  FloatingButton: ({
    icon,
    children,
    onClick,
    disabled,
  }: {
    icon?: ReactNode;
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  ),
}));

vi.mock("./floating/options-menu", () => ({ OptionsMenu: () => null }));

vi.mock("~/store/zustand/tabs", () => ({ useTabs: () => vi.fn() }));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      stop: mocks.stop,
      live: { loading: mocks.loading, sessionId: "session-1" },
    }),
}));

vi.mock("~/stt/useStartListening", () => ({
  useStartListening: () => vi.fn(),
}));

vi.mock("~/stt/window-control", () => ({
  isMainWebviewWindow: () => true,
  requestMainListenerControl: vi.fn(),
}));

import { ListenActionButton } from "./listen-action";

describe("ListenActionButton", () => {
  beforeEach(() => {
    mocks.buttonState = {
      shouldRender: true,
      recording: false,
      finalizing: false,
      isDisabled: false,
      warningMessage: "",
    };
    mocks.loading = false;
    mocks.stop.mockClear();
  });

  afterEach(cleanup);

  it("offers a labelled stop control while recording", () => {
    // This used to render nothing at all: stop was gated on `loading`, which
    // goes false once capture actually starts, and shouldRender is !active.
    mocks.buttonState = { ...mocks.buttonState, recording: true };

    render(<ListenActionButton sessionId="session-1" />);

    expect(screen.getByText("Stop recording")).toBeTruthy();
    expect(
      screen.getByTestId("recording-icon").getAttribute("data-pulse"),
    ).toBe("true");
  });

  it("says it is starting rather than recording during startup", () => {
    mocks.loading = true;

    render(<ListenActionButton sessionId="session-1" />);

    expect(screen.getByText("Starting...")).toBeTruthy();
    expect(screen.queryByText("Stop recording")).toBeNull();
  });

  it("shows a stopping state while finalizing", () => {
    mocks.buttonState = {
      ...mocks.buttonState,
      finalizing: true,
      shouldRender: false,
    };

    render(<ListenActionButton sessionId="session-1" />);

    expect(screen.getByText("Stopping...")).toBeTruthy();
  });

  it("does not pulse when idle", () => {
    render(<ListenActionButton sessionId="session-1" />);

    expect(screen.queryByText("Stop recording")).toBeNull();
    const icon = screen.queryByTestId("recording-icon");
    expect(icon?.getAttribute("data-pulse") ?? "false").toBe("false");
  });
});
