import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";

import { liveQueryClient } from "~/db";
import { finalizeSessionDeletion, softDeleteSession } from "~/session/queries";

/**
 * Identity of a recording: content hash paired with size.
 *
 * The hash alone would do — no sha256 collision has ever been produced — but
 * the size is already sitting next to it on both sides, so pairing them costs
 * nothing and makes a match something you can check by hand.
 */
function fingerprintKey(sha256: string, sizeBytes: number): string {
  return `${sha256}:${sizeBytes}`;
}

/**
 * Every recording already in the library, by fingerprint.
 *
 * Each import is hashed on the way in and the attachment row keeps both halves,
 * so recognising a file we already have costs a lookup rather than a scan. Read
 * once per import: across several hundred files a per-row query would cost more
 * than the hashing.
 */
export async function loadImportedAudioFingerprints(): Promise<Set<string>> {
  const rows = await liveQueryClient.execute<{
    sha256: string;
    size_bytes: number;
  }>(
    `SELECT DISTINCT sha256, size_bytes
     FROM session_attachments
     WHERE source_type = 'session_audio'
       AND deleted_at IS NULL
       AND sha256 <> ''`,
  );
  return new Set(rows.map((row) => fingerprintKey(row.sha256, row.size_bytes)));
}

/**
 * Recognises a recording we already have, by content rather than by name.
 *
 * Two ways in, because the two import paths know different things. A file
 * chosen from the picker has a path, so it can be fingerprinted before the copy
 * and skipped outright. A dropped file has no path at all — that is a property
 * of HTML5 drops, not something we can work around — so it has to be imported
 * first and undone if it turns out to be a duplicate.
 *
 * Catches a renamed or relocated copy of the same audio exactly. Does not catch
 * the same conversation re-encoded: different bytes, different hash. That would
 * need audio fingerprinting rather than a checksum.
 *
 * A file that cannot be read is treated as new. Failing to hash something is
 * not evidence that it is a duplicate, and the cost of being wrong runs the
 * wrong way — a spare note is recoverable, a deleted recording is not.
 */
export function createDuplicateFilter(known: Set<string>) {
  const seen = new Set(known);

  const claim = (sha256: string, sizeBytes: number): boolean => {
    const key = fingerprintKey(sha256, sizeBytes);
    if (seen.has(key)) {
      return true;
    }
    // Claimed even when new, so two copies inside one selection collapse to one
    // note rather than racing each other.
    seen.add(key);
    return false;
  };

  return {
    /** For the picker: decide before paying to copy the file in. */
    async isDuplicateSource(sourcePath: string): Promise<boolean> {
      try {
        const result = await fsSyncCommands.audioSourceFingerprint(sourcePath);
        if (result.status === "error") {
          return false;
        }
        return claim(result.data.sha256, result.data.sizeBytes);
      } catch {
        return false;
      }
    },

    /**
     * For drops: the file is already in the session folder, so this asks the
     * same question of the copy and reports whether it should be undone.
     */
    async isDuplicateImport(sessionId: string): Promise<boolean> {
      try {
        const result = await fsSyncCommands.audioMetadata(sessionId);
        if (result.status === "error" || !result.data) {
          return false;
        }
        return claim(result.data.sha256, result.data.sizeBytes);
      } catch {
        return false;
      }
    },
  };
}

/**
 * Undoes an import that turned out to be a duplicate.
 *
 * Only ever called with a session this import created moments ago, which is
 * what makes deleting safe: it has no title, no notes and no transcript, so
 * there is nothing in it but the copy being reclaimed. Nothing here may be
 * pointed at a session the user already had.
 */
export async function discardDuplicateImport(sessionId: string): Promise<void> {
  try {
    const deleted = await softDeleteSession(sessionId);
    if (!deleted) {
      return;
    }
    await finalizeSessionDeletion(sessionId);
  } catch (error) {
    // A note left behind is untidy; a failed cleanup is not worth losing the
    // rest of the import over.
    console.error("[import] failed to discard a duplicate recording", {
      sessionId,
      error,
    });
  }
}
