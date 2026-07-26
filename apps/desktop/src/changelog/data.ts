import { useEffect, useState } from "react";
// @ts-ignore virtual module provided by ./vite.ts
import { latestContent, latestVersion } from "virtual:changelog";

import { processContent } from "@hypr/changelog";

export function getLatestVersion(): string | null {
  return latestVersion;
}

export function useChangelogContent(version: string) {
  const [content, setContent] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadChangelog() {
      if (version === latestVersion && latestContent) {
        const { content: parsed, date: parsedDate } =
          processContent(latestContent);
        setContent(parsed);
        setDate(parsedDate);
        setLoading(false);
        return;
      }

      // Only the bundled changelog is available; older entries are not fetched
      // from a remote repository.
      if (cancelled) return;
      setContent(null);
      setDate(null);
      setLoading(false);
    }

    loadChangelog();

    return () => {
      cancelled = true;
    };
  }, [version]);

  return { content, date, loading };
}
