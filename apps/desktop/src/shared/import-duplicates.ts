import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";

import { liveQueryClient } from "~/db";

/**
 * Content hashes of every recording already in the library.
 *
 * Every imported recording is hashed on the way in — `audio_metadata` computes
 * it and the attachment row stores it — so recognising a file we already have
 * costs a lookup rather than a scan. Read once per import rather than per file:
 * across several hundred files the per-row query would dominate the hashing.
 */
export async function loadImportedAudioHashes(): Promise<Set<string>> {
  const rows = await liveQueryClient.execute<{ sha256: string }>(
    `SELECT DISTINCT sha256
     FROM session_attachments
     WHERE source_type = 'session_audio'
       AND deleted_at IS NULL
       AND sha256 <> ''`,
  );
  return new Set(rows.map((row) => row.sha256));
}

/**
 * Decides whether a file is worth importing, by content rather than by name.
 *
 * Hashing the source before the copy is the whole point: `audio_metadata` can
 * only hash a file already inside a session folder, which means importing a
 * duplicate in full before discovering it was one. Across a folder of several
 * hundred recordings that is gigabytes of writes to undo.
 *
 * Catches a renamed or relocated copy of the same audio exactly. Does not catch
 * the same conversation re-encoded — different bytes, different hash — which
 * would need audio fingerprinting rather than a checksum.
 *
 * A file that cannot be hashed is treated as new. Refusing to import something
 * because we failed to read it would be the wrong way round.
 */
export function createDuplicateFilter(known: Set<string>) {
  const seen = new Set(known);

  return {
    async isDuplicate(sourcePath: string): Promise<boolean> {
      let hash: string;
      try {
        const result = await fsSyncCommands.audioSourceSha256(sourcePath);
        if (result.status === "error") {
          return false;
        }
        hash = result.data;
      } catch {
        return false;
      }

      // Added even when it is new, so two copies inside one selection collapse
      // to one note without waiting for the first to finish importing.
      if (seen.has(hash)) {
        return true;
      }
      seen.add(hash);
      return false;
    },
  };
}
