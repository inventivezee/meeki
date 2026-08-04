import { md2json } from "@meeki/editor/markdown";
import type { SessionEvent } from "@meeki/store";

import { liveQueryClient } from "~/db";
import { WELCOME_NOTE_TRACKING_ID } from "~/onboarding/welcome-note.constants";
import { createSession } from "~/session/queries";
import { DEFAULT_USER_ID } from "~/shared/utils";

const PENDING_WELCOME_SESSION_KEY = "meeki.pending-welcome-session";

const WELCOME_NOTE_TITLE = "Meeki - your personal meeting note-taker";

const WELCOME_NOTE = `Welcome to Meeki 👋


This note is a quick way to see how Meeki works.


Click **Record** in the top-right corner. Meeki will listen to your microphone and system audio, transcribe what it hears, and turn it into notes.


Recording needs Meeki's on-device models, so everything stays private on your Mac. Open **Settings → Transcription** and click **Download on-device models** — it's a few gigabytes and a one-time wait.


When you stop recording, Meeki can start creating your summary.`;

let pendingWelcomeSession: Promise<string> | null = null;

export function getOrCreateWelcomeSession(): Promise<string> {
  if (!pendingWelcomeSession) {
    pendingWelcomeSession = findOrCreateWelcomeSession().finally(() => {
      pendingWelcomeSession = null;
    });
  }
  return pendingWelcomeSession;
}

export function setPendingWelcomeSession(sessionId: string | null) {
  if (sessionId) {
    localStorage.setItem(PENDING_WELCOME_SESSION_KEY, sessionId);
  } else {
    localStorage.removeItem(PENDING_WELCOME_SESSION_KEY);
  }
}

export function takePendingWelcomeSession(): string | null {
  const sessionId = localStorage.getItem(PENDING_WELCOME_SESSION_KEY);
  localStorage.removeItem(PENDING_WELCOME_SESSION_KEY);
  return sessionId;
}

async function stripLegacyDemoMeetingLink(sessionId: string) {
  await liveQueryClient.execute(
    `
      UPDATE sessions
      SET
        event_json = json_set(
          json_set(event_json, '$.meeting_link', ''),
          '$.description',
          'A quick introduction to recording with Meeki.'
        ),
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = ?
        AND deleted_at IS NULL
        AND json_valid(event_json)
        AND coalesce(json_extract(event_json, '$.meeting_link'), '') LIKE '%onboarding-demo%'
    `,
    [sessionId],
  );
}

/** Clears leftover hosted demo meeting links from welcome notes. */
export async function stripLegacyWelcomeDemoMeetingLinks() {
  const rows = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM sessions
      WHERE deleted_at IS NULL
        AND json_valid(event_json)
        AND coalesce(json_extract(event_json, '$.meeting_link'), '') LIKE '%onboarding-demo%'
    `,
    [],
  );
  for (const row of rows) {
    await stripLegacyDemoMeetingLink(row.id);
  }
}

async function findOrCreateWelcomeSession(): Promise<string> {
  const rows = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT id
      FROM sessions
      WHERE deleted_at IS NULL
        AND CASE
          WHEN json_valid(event_json)
          THEN json_extract(event_json, '$.tracking_id')
        END = ?
      ORDER BY created_at, id
      LIMIT 1
    `,
    [WELCOME_NOTE_TRACKING_ID],
  );
  if (rows[0]) {
    await stripLegacyDemoMeetingLink(rows[0].id).catch((error) => {
      console.error(
        "[onboarding] failed to clear legacy welcome demo meeting link",
        error,
      );
    });
    return rows[0].id;
  }

  const now = new Date().toISOString();
  const event: SessionEvent = {
    tracking_id: WELCOME_NOTE_TRACKING_ID,
    calendar_id: "",
    title: WELCOME_NOTE_TITLE,
    started_at: now,
    ended_at: "",
    is_all_day: false,
    has_recurrence_rules: false,
    description: "A quick introduction to recording with Meeki.",
  };

  return createSession(WELCOME_NOTE_TITLE, DEFAULT_USER_ID, {
    event_json: JSON.stringify(event),
    raw_md: JSON.stringify(md2json(WELCOME_NOTE)),
  });
}
