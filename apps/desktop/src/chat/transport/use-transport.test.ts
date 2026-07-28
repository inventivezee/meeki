import { describe, expect, it } from "vitest";

import { appendMeetingContextToolGuidance } from "./use-transport";

describe("chat transport prompt guidance", () => {
  it("tells chat to use typed meeting search tools", () => {
    const prompt = appendMeetingContextToolGuidance("Base prompt");

    expect(prompt).toContain("Base prompt");
    expect(prompt).toContain("Use list_meetings");
    expect(prompt).toContain("Use search_meetings");
    expect(prompt).toContain("Use search_meeting_content");
    expect(prompt).toContain("use get_meeting");
    expect(prompt).toContain("Use get_meeting_transcript");
    expect(prompt).toContain("Use get_recurring_meeting_history");
    expect(prompt).toContain("Use typed meeting tools");
    expect(prompt).toContain("Do not ask the user to open or share a meeting");
    expect(prompt).toContain("call edit_summary");
    expect(prompt).toContain("complete replacement markdown");
    expect(prompt).toContain(
      "Use apply_session_correction for narrow exact old-to-new corrections and edit_summary for broader summary rewrites",
    );
    expect(prompt).toContain(
      "Do not return the rewrite only as a fenced markdown block",
    );
    expect(prompt).not.toContain("grep_notes");
    expect(prompt).not.toContain("search_sessions");
    expect(prompt).not.toContain("read_note");
    expect(prompt).not.toContain("read_current_note");
  });
});

describe("compact tool guidance", () => {
  it("tells a small model the meeting is already in front of it", () => {
    const compact = appendMeetingContextToolGuidance("SYSTEM", "compact");

    expect(compact).toContain("Answer from it directly");
    expect(compact).toContain("Do not call a tool to fetch the meeting");
    // The phrase that pulled a 4B straight to get_meeting when asked for
    // action items must not survive in the compact variant.
    expect(compact).not.toContain(
      "use get_meeting for the canonical note, summaries, participants, and action items",
    );
  });

  it("still names every tool so nothing becomes unreachable", () => {
    const compact = appendMeetingContextToolGuidance("SYSTEM", "compact") ?? "";

    for (const tool of [
      "search_meetings",
      "list_meetings",
      "get_meeting",
      "search_contacts",
      "search_calendar_events",
      "edit_summary",
      "apply_session_correction",
    ]) {
      expect(compact).toContain(tool);
    }
  });

  it("is a fraction of the full guidance", () => {
    const full = appendMeetingContextToolGuidance("", "full") ?? "";
    const compact = appendMeetingContextToolGuidance("", "compact") ?? "";

    expect(compact.length).toBeLessThan(full.length / 2);
  });

  it("defaults to the full guidance", () => {
    expect(appendMeetingContextToolGuidance("SYSTEM")).toBe(
      appendMeetingContextToolGuidance("SYSTEM", "full"),
    );
  });
});

describe("compact guidance and the on-device tool set", () => {
  it("does not advertise web_search, which on-device cannot reach", () => {
    const compact = appendMeetingContextToolGuidance("SYSTEM", "compact") ?? "";
    expect(compact).not.toContain("web_search");
  });
});
