import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DateEditor } from "./date";
import { EventDisplay, MetadataButton } from "./index";

const mocks = vi.hoisted(() => ({
  createdAt: "2026-07-02T03:53:00.000Z" as unknown,
  setCreatedAt: vi.fn(),
  sessionEvent: null as unknown,
  openUrl: vi.fn(),
}));

const lingui = vi.hoisted(() => {
  const t = (input: TemplateStringsArray | string, ...values: unknown[]) => {
    if (typeof input === "string") {
      return input;
    }

    return Array.from(input).reduce(
      (text, part, index) => `${text}${part}${values[index] ?? ""}`,
      "",
    );
  };

  return { t };
});

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: lingui.t,
  }),
}));

vi.mock("@meeki/plugin-opener2", () => ({
  commands: {
    openUrl: mocks.openUrl,
  },
}));

vi.mock("~/shared/config", () => ({
  useConfigValue: () => undefined,
}));

vi.mock("~/session/hooks/useSessionEvent", () => ({
  useSessionEvent: () => mocks.sessionEvent,
}));

vi.mock("~/session/queries", () => ({
  useSession: () => ({ created_at: mocks.createdAt }),
  useUpdateSession: () => mocks.setCreatedAt,
}));

vi.mock("./participants", () => ({
  ParticipantsDisplay: () => null,
}));

describe("Metadata controls", () => {
  beforeEach(() => {
    mocks.createdAt = "2026-07-02T03:53:00.000Z";
    mocks.setCreatedAt.mockClear();
    mocks.openUrl.mockClear();
    mocks.sessionEvent = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the metadata calendar trigger as a circle", () => {
    render(<MetadataButton sessionId="session-1" />);

    const metadataButton = screen.getByRole("button", {
      name: "Open note metadata",
    });

    expect(metadataButton.className).toContain("size-7");
    expect(metadataButton.className).toContain("rounded-full");
  });

  it("renders date edit action buttons as circles", () => {
    render(<DateEditor sessionId="session-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit date" }));

    expect(
      screen.getByRole("button", { name: "Cancel date edit" }).className,
    ).toContain("rounded-full");
    expect(
      screen.getByRole("button", { name: "Save date" }).className,
    ).toContain("rounded-full");
  });

  it("hides Join for the legacy onboarding demo meeting link", () => {
    render(
      <EventDisplay
        event={{
          title: "Welcome to Meeki",
          startedAt: "2026-07-25T19:38:00.000Z",
          endedAt: undefined,
          location: undefined,
          meetingLink: "https://meeki.ai/onboarding-demo/",
          description: "A private, prerecorded introduction to Meeki.",
          calendarId: undefined,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
    expect(screen.queryByText("meeki.ai")).toBeNull();
  });

  it("keeps Join for real meeting links", () => {
    render(
      <EventDisplay
        event={{
          title: "Design Review",
          startedAt: "2026-07-25T19:38:00.000Z",
          endedAt: undefined,
          location: undefined,
          meetingLink: "https://meet.google.com/abc-defg-hij",
          description: undefined,
          calendarId: undefined,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(mocks.openUrl).toHaveBeenCalledWith(
      "https://meet.google.com/abc-defg-hij",
      null,
    );
  });
});
