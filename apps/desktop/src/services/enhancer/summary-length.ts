import type { Transcript } from "@meeki/plugin-template";

export const MIN_TRANSCRIPT_CHARACTERS_FOR_SUMMARY = 160;
export const SHORT_TRANSCRIPT_CHARACTER_LIMIT = 1_200;
export const MIN_SUMMARY_CHARACTERS = 320;
export const MAX_SUMMARY_GUIDANCE_CHARACTERS = 16_000;
const SECTION_GUIDANCE_CHARACTER_STEP = 2_000;
const MAX_GUIDANCE_SECTIONS = 12;

/** How much detail the user wants, independent of how long the meeting was. */
export type SummaryLength = "brief" | "balanced" | "detailed";

export const DEFAULT_SUMMARY_LENGTH: SummaryLength = "balanced";

const DETAILED_GUIDANCE_CHARACTER_LIMIT = 32_000;

/**
 * Multipliers on the transcript-derived budget. `balanced` reproduces the
 * behaviour from before this was adjustable, so an unset preference changes
 * nothing.
 *
 * `characters` scales the post-generation truncation ceiling as well as the
 * guidance. Scaling only the guidance would let the model write the longer
 * summary the user asked for and then have it cut off mid-sentence.
 */
const LENGTH_SCALES: Record<
  SummaryLength,
  {
    characters: number;
    sections: number;
    guidanceCeiling: number;
    shortMeetingSections: number;
  }
> = {
  brief: {
    characters: 0.5,
    sections: 0.6,
    guidanceCeiling: MAX_SUMMARY_GUIDANCE_CHARACTERS,
    shortMeetingSections: 1,
  },
  balanced: {
    characters: 1,
    sections: 1,
    guidanceCeiling: MAX_SUMMARY_GUIDANCE_CHARACTERS,
    shortMeetingSections: 2,
  },
  detailed: {
    characters: 2,
    sections: 1.5,
    guidanceCeiling: DETAILED_GUIDANCE_CHARACTER_LIMIT,
    shortMeetingSections: 4,
  },
};

export function isSummaryLength(value: unknown): value is SummaryLength {
  return (
    typeof value === "string" && Object.keys(LENGTH_SCALES).includes(value)
  );
}

export type SummaryLengthPolicy = {
  length: SummaryLength;
  maxCharacters: number;
  maxSections: number | null;
  transcriptCharacters: number;
  guidance?: {
    maxCharacters: number;
    minSections: number;
    maxSections: number;
  };
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function countNormalizedCharacters(text: string): number {
  return Array.from(text.replace(/\s+/gu, " ").trim()).length;
}

export function countTranscriptWordCharacters(
  transcripts: ReadonlyArray<{
    words: ReadonlyArray<{ text?: unknown }>;
  }>,
): number {
  return countNormalizedCharacters(
    transcripts
      .flatMap((transcript) => transcript.words)
      .map((word) => (typeof word.text === "string" ? word.text : ""))
      .filter(Boolean)
      .join(" "),
  );
}

export function getSummaryLengthPolicy(
  transcripts: readonly Transcript[],
  length: SummaryLength = DEFAULT_SUMMARY_LENGTH,
): SummaryLengthPolicy | null {
  const transcriptCharacters = countNormalizedCharacters(
    transcripts
      .flatMap((transcript) => transcript.segments)
      .map((segment) => segment.text)
      .filter(Boolean)
      .join(" "),
  );

  if (transcriptCharacters === 0) {
    return null;
  }

  const scale = LENGTH_SCALES[length] ?? LENGTH_SCALES[DEFAULT_SUMMARY_LENGTH];
  const budget = Math.round(transcriptCharacters * scale.characters);

  return {
    length,
    transcriptCharacters,
    maxCharacters: Math.max(budget, MIN_SUMMARY_CHARACTERS),
    maxSections:
      transcriptCharacters < SHORT_TRANSCRIPT_CHARACTER_LIMIT
        ? scale.shortMeetingSections
        : null,
    guidance: {
      maxCharacters: clamp(
        budget,
        MIN_SUMMARY_CHARACTERS,
        scale.guidanceCeiling,
      ),
      minSections: clamp(
        Math.ceil(
          (transcriptCharacters * scale.sections) /
            (SECTION_GUIDANCE_CHARACTER_STEP * 2),
        ),
        1,
        5,
      ),
      maxSections: clamp(
        1 +
          Math.ceil(
            (transcriptCharacters * scale.sections) /
              SECTION_GUIDANCE_CHARACTER_STEP,
          ),
        2,
        MAX_GUIDANCE_SECTIONS,
      ),
    },
  };
}

/**
 * The budget above is a ceiling, and a ceiling alone does not make a model
 * write more. These say what to do with the room.
 */
const LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  brief:
    "The reader wants the short version: keep only what they would need to act on, and prefer one tight bullet over three loose ones.",
  balanced: "Cover what was discussed without dwelling on any one point.",
  detailed:
    "The reader wants depth: keep supporting detail, concrete examples, numbers and named specifics rather than compressing them away, and give a distinct section to each topic that got real discussion.",
};

export function formatSummaryLengthGuidance(
  policy: SummaryLengthPolicy | null,
): string | null {
  const guidance = policy?.guidance;
  if (!policy || !guidance) {
    return null;
  }

  const sections =
    guidance.minSections === guidance.maxSections
      ? `exactly ${guidance.maxSections} section${guidance.maxSections === 1 ? "" : "s"}`
      : `${guidance.minSections} to ${guidance.maxSections} sections`;

  return [
    `Summary length: the transcript contains about ${policy.transcriptCharacters} characters.`,
    `Keep the summary proportional to it: use ${sections} and stay under ${guidance.maxCharacters} characters overall.`,
    "A short meeting must produce a short summary; never pad with filler.",
    LENGTH_INSTRUCTIONS[policy.length],
  ].join(" ");
}

export function constrainSummaryLength(
  markdown: string,
  policy: SummaryLengthPolicy | null,
): string {
  if (!policy) {
    return markdown.trim();
  }

  const sectionLimited = limitSections(markdown, policy.maxSections);
  if (countNormalizedCharacters(sectionLimited) <= policy.maxCharacters) {
    return sectionLimited;
  }

  const keptLines: string[] = [];
  for (const line of sectionLimited.split("\n")) {
    const candidate = [...keptLines, line].join("\n").trim();
    if (countNormalizedCharacters(candidate) <= policy.maxCharacters) {
      keptLines.push(line);
      continue;
    }

    const truncatedLine = truncateLineToFit(
      keptLines,
      line,
      policy.maxCharacters,
    );
    if (truncatedLine) {
      keptLines.push(truncatedLine);
    }
    break;
  }

  return keptLines.join("\n").trim();
}

function limitSections(markdown: string, maxSections: number | null): string {
  if (!maxSections) {
    return markdown.trim();
  }

  let sectionCount = 0;
  const keptLines: string[] = [];
  for (const line of markdown.trim().split("\n")) {
    if (/^#\s+\S/.test(line)) {
      sectionCount += 1;
      if (sectionCount > maxSections) {
        break;
      }
    }
    keptLines.push(line);
  }

  return keptLines.join("\n").trim();
}

function truncateLineToFit(
  keptLines: string[],
  line: string,
  maxCharacters: number,
): string {
  const characters = Array.from(line);
  let low = 0;
  let high = characters.length;

  while (low < high) {
    const midpoint = Math.ceil((low + high) / 2);
    const candidate = [...keptLines, characters.slice(0, midpoint).join("")]
      .join("\n")
      .trim();
    if (countNormalizedCharacters(candidate) <= maxCharacters) {
      low = midpoint;
    } else {
      high = midpoint - 1;
    }
  }

  let truncated = characters.slice(0, low).join("").trimEnd();
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace >= Math.floor(truncated.length * 0.6)) {
    truncated = truncated.slice(0, lastSpace);
  }

  return truncated.replace(/[,:;\-–—]+$/u, "").trimEnd();
}
