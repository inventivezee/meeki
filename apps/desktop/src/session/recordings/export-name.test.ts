import { describe, expect, it } from "vitest";

import { buildExportName } from "./export-name";

const base = {
  sessionId: "5247bb63-feb0-4acd-b000-f95fe7946b7e",
  title: "Daydream Strategic Pivot",
  startedAt: "2026-06-20T08:17:00.000Z",
  timezone: "Europe/London",
};

describe("buildExportName", () => {
  it("leads with a sortable date so a folder listing reads chronologically", () => {
    expect(buildExportName(base)).toBe(
      "2026-06-20 0917am — Daydream Strategic Pivot",
    );
  });

  it("sorts correctly across months, which a day-first name would not", () => {
    const may = buildExportName({ ...base, startedAt: "2026-05-05T08:17:00Z" });
    const june = buildExportName(base);
    expect([june, may].sort()).toEqual([may, june]);
  });

  it("uses the zone the recording was made in, not the current one", () => {
    const tokyo = buildExportName({ ...base, timezone: "Asia/Tokyo" });
    expect(tokyo).toContain("2026-06-20 0517pm");
  });

  it("survives an unknown time zone rather than losing the export", () => {
    const name = buildExportName({ ...base, timezone: "Mars/Olympus_Mons" });
    expect(name).toContain("2026-06-20");
    expect(name).toContain("Daydream Strategic Pivot");
  });

  it("includes a duration when there is a meaningful one", () => {
    expect(buildExportName({ ...base, durationMs: 42 * 60_000 })).toBe(
      "2026-06-20 0917am 42min — Daydream Strategic Pivot",
    );
  });

  it("renders long recordings in hours", () => {
    expect(buildExportName({ ...base, durationMs: 95 * 60_000 })).toContain(
      "1h35",
    );
    expect(buildExportName({ ...base, durationMs: 120 * 60_000 })).toContain(
      "2h",
    );
  });

  it("omits a duration too short to be worth reading", () => {
    expect(buildExportName({ ...base, durationMs: 20_000 })).toBe(
      "2026-06-20 0917am — Daydream Strategic Pivot",
    );
  });

  it("still names an untitled recording", () => {
    expect(buildExportName({ ...base, title: "   " })).toBe(
      "2026-06-20 0917am",
    );
  });

  it("falls back to the title when the timestamp is unusable", () => {
    expect(buildExportName({ ...base, startedAt: "not-a-date" })).toBe(
      "Daydream Strategic Pivot",
    );
  });

  it("never returns an empty name", () => {
    expect(
      buildExportName({ ...base, title: "", startedAt: "not-a-date" }),
    ).toBe("recording");
  });
});
