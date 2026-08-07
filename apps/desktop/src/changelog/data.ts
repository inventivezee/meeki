import { useEffect, useState } from "react";
// @ts-ignore virtual module provided by ../../plugins/changelog.ts
import { changelogs, versions } from "virtual:changelog";

import { processContent } from "@meeki/changelog";

const entries = changelogs as Record<string, string>;
const knownVersions = versions as string[];

export function getLatestVersion(): string | null {
  return knownVersions[0] ?? null;
}

export function useChangelogContent(version: string) {
  const [content, setContent] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Keyed by the version being asked about. This used to render only when the
    // requested version happened to be the highest-numbered file on disk, which
    // no Meeki release has ever been.
    const raw = entries[version];
    if (!raw) {
      setContent(null);
      setDate(null);
      setLoading(false);
      return;
    }

    const { content: parsed, date: parsedDate } = processContent(raw);
    setContent(parsed);
    setDate(parsedDate);
    setLoading(false);
  }, [version]);

  return { content, date, loading };
}
