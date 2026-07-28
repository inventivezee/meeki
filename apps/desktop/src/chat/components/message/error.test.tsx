import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ErrorMessage } from "./error";

afterEach(cleanup);

describe("ErrorMessage", () => {
  // Switching models surfaced a transport failure that was not an Error, and
  // reading .message off it took the whole app to the error boundary.
  it.each([
    ["a bare object", {} as unknown],
    ["null", null as unknown],
    ["undefined", undefined as unknown],
    ["an object with a non-string message", { message: 42 } as unknown],
  ])("renders without crashing given %s", (_label, error) => {
    expect(() => render(<ErrorMessage error={error} />)).not.toThrow();
  });

  it("shows the message when there is one", () => {
    render(<ErrorMessage error={new Error("model failed to load")} />);
    expect(screen.getByText("model failed to load")).toBeTruthy();
  });

  it("reads a message off a plain object", () => {
    render(<ErrorMessage error={{ message: "plain object failure" }} />);
    expect(screen.getByText("plain object failure")).toBeTruthy();
  });

  it("falls back to something readable when there is no message", () => {
    const { container } = render(<ErrorMessage error={{}} />);
    expect(container.textContent?.trim()).not.toBe("");
  });
});
