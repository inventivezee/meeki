/**
 * The on-disk name stays `audio.mp3` — it is load-bearing in the two resolver
 * lists, CloudSync's attachment path allowlist, and the session_attachments
 * rows that allowlist validates. Readable names are produced on export instead,
 * where getting one wrong costs a re-export rather than unreachable audio.
 */
export type RecordingForExport = {
  sessionId: string;
  title: string;
  /** ISO 8601. Prefer the recording start; fall back to session creation. */
  startedAt: string;
  /** IANA zone the recording was made in, when the session recorded one. */
  timezone?: string | null;
  durationMs?: number | null;
};

function parts(startedAt: string, timezone?: string | null) {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  // Formatted in the zone the meeting happened in, not the zone the export
  // happens in — a recording does not change time because you travelled.
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  };
  if (timezone) {
    options.timeZone = timezone;
  }

  let formatted: Intl.DateTimeFormatPart[];
  try {
    formatted = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
  } catch {
    // An unknown or renamed IANA zone should not lose the export.
    formatted = new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: undefined,
    }).formatToParts(date);
  }

  const find = (type: Intl.DateTimeFormatPartTypes) =>
    formatted.find((part) => part.type === type)?.value ?? "";

  return {
    day: find("day"),
    month: find("month"),
    year: find("year"),
    hour: find("hour").padStart(2, "0"),
    minute: find("minute"),
    period: find("dayPeriod").toLowerCase().replace(/\s|\./g, ""),
  };
}

function durationLabel(durationMs?: number | null) {
  if (!durationMs || durationMs < 60_000) {
    return null;
  }
  const minutes = Math.round(durationMs / 60_000);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0
    ? `${hours}h`
    : `${hours}h${rest.toString().padStart(2, "0")}`;
}

/**
 * Date first so a folder listing sorts chronologically, which is the whole
 * point of exporting. Sanitising is left to the Rust side, which also resolves
 * collisions — two meetings can start in the same minute.
 */
export function buildExportName(recording: RecordingForExport): string {
  const stamp = parts(recording.startedAt, recording.timezone);
  const title = recording.title.trim();

  if (!stamp) {
    return title || "recording";
  }

  const segments = [
    `${stamp.year}-${stamp.month}-${stamp.day}`,
    `${stamp.hour}${stamp.minute}${stamp.period}`,
  ];

  const duration = durationLabel(recording.durationMs);
  if (duration) {
    segments.push(duration);
  }

  const prefix = segments.join(" ");
  return title ? `${prefix} — ${title}` : prefix;
}
