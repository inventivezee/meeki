import { describe, expect, it } from "vitest";

import {
  constrainSummaryLength,
  countNormalizedCharacters,
  countTranscriptWordCharacters,
  formatSummaryLengthGuidance,
  getSummaryLengthPolicy,
} from "./summary-length";

describe("summary length policy", () => {
  it("counts transcript characters across languages without relying on spaces", () => {
    expect(
      countTranscriptWordCharacters([
        { words: [{ text: "이번" }, { text: "회의는" }, { text: "짧음" }] },
      ]),
    ).toBe(9);
  });

  it("caps short transcripts at two sections and sizes the output budget", () => {
    const policy = getSummaryLengthPolicy([
      {
        startedAt: null,
        endedAt: null,
        segments: [{ speaker: "John", text: "a".repeat(200) }],
      },
    ]);

    expect(policy).toEqual({
      length: "balanced",
      transcriptCharacters: 200,
      maxCharacters: 320,
      maxSections: 2,
      guidance: {
        maxCharacters: 320,
        minSections: 1,
        maxSections: 2,
      },
    });
  });

  it("defaults to the pre-existing balanced budget when no preference is given", () => {
    const transcripts = [
      {
        startedAt: null,
        endedAt: null,
        segments: [{ speaker: "John", text: "a".repeat(8_000) }],
      },
    ];

    expect(getSummaryLengthPolicy(transcripts)).toEqual(
      getSummaryLengthPolicy(transcripts, "balanced"),
    );
  });

  it("moves the budget in both directions without collapsing the meeting-size scaling", () => {
    const policyFor = (length: "brief" | "balanced" | "detailed") =>
      getSummaryLengthPolicy(
        [
          {
            startedAt: null,
            endedAt: null,
            segments: [{ speaker: "John", text: "a".repeat(8_000) }],
          },
        ],
        length,
      );

    const brief = policyFor("brief");
    const balanced = policyFor("balanced");
    const detailed = policyFor("detailed");

    expect(brief!.maxCharacters).toBeLessThan(balanced!.maxCharacters);
    expect(detailed!.maxCharacters).toBeGreaterThan(balanced!.maxCharacters);
    // A longer meeting must still beat a shorter one at the same setting,
    // otherwise the preference has replaced the scaling rather than shifted it.
    const shorterDetailed = getSummaryLengthPolicy(
      [
        {
          startedAt: null,
          endedAt: null,
          segments: [{ speaker: "John", text: "a".repeat(4_000) }],
        },
      ],
      "detailed",
    );
    expect(detailed!.maxCharacters).toBeGreaterThan(
      shorterDetailed!.maxCharacters,
    );
  });

  it("raises the truncation ceiling with the guidance, so a detailed summary is not cut back down", () => {
    const transcripts = [
      {
        startedAt: null,
        endedAt: null,
        segments: [{ speaker: "John", text: "a".repeat(6_000) }],
      },
    ];
    const detailed = getSummaryLengthPolicy(transcripts, "detailed")!;
    const balanced = getSummaryLengthPolicy(transcripts, "balanced")!;

    // A summary sized to what "detailed" asked for must survive the
    // post-generation constraint that "balanced" would have chopped.
    const summary = `# Topic\n\n- ${"word ".repeat(1_800).trim()}`;

    expect(countNormalizedCharacters(summary)).toBeGreaterThan(
      balanced.maxCharacters,
    );
    expect(constrainSummaryLength(summary, detailed)).toBe(summary);
  });

  it("tells the model what to do with the extra room, not just that it exists", () => {
    const transcripts = [
      {
        startedAt: null,
        endedAt: null,
        segments: [{ speaker: "John", text: "a".repeat(5_000) }],
      },
    ];

    expect(
      formatSummaryLengthGuidance(
        getSummaryLengthPolicy(transcripts, "detailed"),
      ),
    ).toContain("depth");
    expect(
      formatSummaryLengthGuidance(getSummaryLengthPolicy(transcripts, "brief")),
    ).toContain("short version");
  });

  it("scales the guided section range with the transcript size", () => {
    const policyFor = (characters: number) =>
      getSummaryLengthPolicy([
        {
          startedAt: null,
          endedAt: null,
          segments: [{ speaker: "John", text: "a".repeat(characters) }],
        },
      ])?.guidance;

    expect(policyFor(636)).toEqual({
      maxCharacters: 636,
      minSections: 1,
      maxSections: 2,
    });
    expect(policyFor(6_000)).toEqual({
      maxCharacters: 6_000,
      minSections: 2,
      maxSections: 4,
    });
    expect(policyFor(30_000)).toEqual({
      maxCharacters: 16_000,
      minSections: 5,
      maxSections: 12,
    });
  });

  it("renders proportional length guidance for the prompt", () => {
    const policy = getSummaryLengthPolicy([
      {
        startedAt: null,
        endedAt: null,
        segments: [{ speaker: "John", text: "a".repeat(636) }],
      },
    ]);

    const guidance = formatSummaryLengthGuidance(policy);

    expect(guidance).toContain("about 636 characters");
    expect(guidance).toContain("1 to 2 sections");
    expect(guidance).toContain("under 636 characters");
    expect(formatSummaryLengthGuidance(null)).toBeNull();
  });

  it("keeps long transcripts on the normal section limit", () => {
    const policy = getSummaryLengthPolicy([
      {
        startedAt: null,
        endedAt: null,
        segments: [{ speaker: "John", text: "a".repeat(10_000) }],
      },
    ]);

    expect(policy).toMatchObject({
      transcriptCharacters: 10_000,
      maxCharacters: 10_000,
      maxSections: null,
    });
  });

  it("keeps no more than two sections or the transcript character count", () => {
    const markdown = `# First

- ${"a".repeat(100)}

# Second

- ${"b".repeat(100)}

# Third

- ${"c".repeat(100)}`;
    const result = constrainSummaryLength(markdown, {
      length: "balanced",
      transcriptCharacters: 160,
      maxCharacters: 160,
      maxSections: 2,
    });

    expect(result).toContain("# First");
    expect(result).toContain("# Second");
    expect(result).not.toContain("# Third");
    expect(countNormalizedCharacters(result)).toBeLessThanOrEqual(160);
  });
});
