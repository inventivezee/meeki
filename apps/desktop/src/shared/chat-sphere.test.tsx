import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatMode: "FloatingClosed" as
    | "FloatingClosed"
    | "FloatingOpen"
    | "RightPanelOpen",
  sendEvent: vi.fn(),
}));

vi.mock("~/contexts/shell", () => ({
  useShell: () => ({
    chat: {
      mode: mocks.chatMode,
      sendEvent: mocks.sendEvent,
    },
  }),
}));

import { ChatSphere, FloatingChatSphere } from "./chat-sphere";

const SPHERE = "Ask Meeki about your notes";

describe("ChatSphere", () => {
  beforeEach(() => {
    cleanup();
    mocks.chatMode = "FloatingClosed";
    mocks.sendEvent.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the floating chat on click", () => {
    render(<ChatSphere />);

    fireEvent.click(screen.getByRole("button", { name: SPHERE }));

    expect(mocks.sendEvent).toHaveBeenCalledWith({ type: "OPEN" });
  });

  it("opens on hover once the pointer settles", () => {
    render(<ChatSphere />);

    fireEvent.pointerEnter(screen.getByRole("button", { name: SPHERE }), {
      pointerType: "mouse",
    });
    expect(mocks.sendEvent).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mocks.sendEvent).toHaveBeenCalledWith({ type: "OPEN" });
  });

  it("does not open when the pointer only passes over", () => {
    render(<ChatSphere />);
    const sphere = screen.getByRole("button", { name: SPHERE });

    fireEvent.pointerEnter(sphere, { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.pointerLeave(sphere);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.sendEvent).not.toHaveBeenCalled();
  });

  it("leaves touch to the click handler so it does not fire twice", () => {
    render(<ChatSphere />);

    fireEvent.pointerEnter(screen.getByRole("button", { name: SPHERE }), {
      pointerType: "touch",
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(mocks.sendEvent).not.toHaveBeenCalled();
  });

  it("keeps the hover target to the sphere itself", () => {
    render(<FloatingChatSphere />);

    const sphere = screen.getByRole("button", { name: SPHERE });
    // The old CTA put a 2px sliver inside a 180px-wide button, which is what
    // made it open from well off to the side.
    expect(sphere.className).toContain("size-12");
    expect(sphere.className).toContain("rounded-full");

    const positioner = sphere.parentElement?.parentElement;
    expect(positioner?.className).toContain("pointer-events-none");
    expect(sphere.parentElement?.className).toContain("pointer-events-auto");
    expect(positioner?.className).not.toContain("w-[180px]");
  });

  it("hides while the floating chat is open", () => {
    mocks.chatMode = "FloatingOpen";

    render(<ChatSphere />);

    expect(screen.queryByRole("button", { name: SPHERE })).toBeNull();
  });

  it("hides while the right panel chat is open", () => {
    mocks.chatMode = "RightPanelOpen";

    render(<ChatSphere />);

    expect(screen.queryByRole("button", { name: SPHERE })).toBeNull();
  });
});
