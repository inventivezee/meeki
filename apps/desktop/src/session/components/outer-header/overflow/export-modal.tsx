import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { downloadDir, join } from "@tauri-apps/api/path";
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { json2md } from "@meeki/editor/markdown";
import { commands as analyticsCommands } from "@meeki/plugin-analytics";
import {
  commands as exportCommands,
  type ExportMetadata,
  type TranscriptItem,
} from "@meeki/plugin-export";
import { commands as fsSyncCommands } from "@meeki/plugin-fs-sync";
import { commands as fs2Commands } from "@meeki/plugin-fs2";
import { commands as openerCommands } from "@meeki/plugin-opener2";
import { cn } from "@meeki/utils";

import { formatDate, formatDuration } from "./export-utils";

import { useTranscriptExportSegments } from "~/session/components/note-input/transcript/export-data";
import {
  loadActiveSessionIds,
  loadSessionContentSnapshot,
} from "~/session/content-queries";
import {
  useEnhancedNote,
  useSession,
  useSessionParticipants,
} from "~/session/queries";
import { buildExportName } from "~/session/recordings/export-name";
import { loadExportableRecordings } from "~/session/recordings/queries";
import { getSessionEvent } from "~/session/utils";
import type { EditorView } from "~/store/zustand/tabs/schema";
import { useSessionTranscripts } from "~/stt/queries";

type FileFormat = "pdf" | "txt" | "md" | "org" | "audio";
type ExportScope = "current" | "all";

type ExportBundle = {
  title: string;
  createdAt?: string | null;
  participantNames: string[];
  duration: string | null;
  memoMd: string;
  summaryMd: string;
  transcriptText: string;
};

function markdownToText(content: string): string {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownToOrg(content: string): string {
  return content
    .replace(/^(#{1,6})\s+/gm, (_match, hashes: string) => {
      return `${"*".repeat(hashes.length)} `;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "[[$2][$1]]")
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    .replace(/__(.*?)__/g, "*$1*")
    .replace(/`([^`]+)`/g, "~$1~")
    .trim();
}

export function ExportModal({
  sessionId,
  currentView,
  open,
  onOpenChange,
  /** Settings exports the whole library, so the choice is not offered there. */
  lockedScope,
}: {
  sessionId: string;
  currentView: EditorView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedScope?: ExportScope;
}) {
  const { t } = useLingui();
  const [format, setFormat] = useState<FileFormat>("pdf");
  const [chosenScope, setScope] = useState<ExportScope>(
    lockedScope ?? "current",
  );
  const scope = lockedScope ?? chosenScope;
  const [includeMemo, setIncludeMemo] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeTranscript, setIncludeTranscript] = useState(false);

  const session = useSession(sessionId);
  const sessionTitle = session?.title;
  const sessionCreatedAt = session?.created_at;
  const event = session ? getSessionEvent(session) : null;
  const eventTitle = event?.title;
  const rawMd = session?.raw_md;

  const enhancedNoteId = currentView.type === "enhanced" ? currentView.id : "";
  const enhancedNoteContent = useEnhancedNote(enhancedNoteId)?.content;
  const participants = useSessionParticipants(sessionId);

  const participantNames = useMemo(
    () => participants.map((participant) => participant.name).filter(Boolean),
    [participants],
  );

  const { data: transcriptItems, isLoading: isTranscriptLoading } =
    useTranscriptExportSegments(sessionId);

  const transcripts = useSessionTranscripts(sessionId);

  const transcriptDuration = useMemo((): string | null => {
    if (transcripts.length === 0) {
      return null;
    }

    let minStartedAt: number | null = null;
    let maxEndedAt: number | null = null;

    for (const transcript of transcripts) {
      if (minStartedAt === null || transcript.startedAt < minStartedAt) {
        minStartedAt = transcript.startedAt;
      }
      if (transcript.endedAt !== undefined) {
        if (maxEndedAt === null || transcript.endedAt > maxEndedAt) {
          maxEndedAt = transcript.endedAt;
        }
      }
    }

    if (minStartedAt !== null && maxEndedAt !== null) {
      return formatDuration(minStartedAt, maxEndedAt);
    }
    return null;
  }, [transcripts]);

  const getMemoMd = (): string => {
    if (!rawMd) return "";
    try {
      const parsed = JSON.parse(rawMd);
      return json2md(parsed);
    } catch {
      return "";
    }
  };

  const getSummaryMd = (): string => {
    if (!enhancedNoteContent) return "";
    try {
      const parsed = JSON.parse(enhancedNoteContent);
      return json2md(parsed);
    } catch {
      return "";
    }
  };

  const getTranscriptText = (): string => {
    if (transcriptItems.length === 0) return "";
    return transcriptItems
      .map((item) => {
        const speaker = item.speaker ? `${item.speaker}: ` : "";
        return `${speaker}${item.text}`;
      })
      .join("\n\n");
  };

  const buildMdContent = (bundle: ExportBundle): string => {
    const sections: string[] = [];
    const title = bundle.title || t`Untitled`;
    sections.push(`# ${title}`);

    if (bundle.createdAt) {
      sections.push(`- ${t`Created`}: ${formatDate(bundle.createdAt)}`);
    }

    if (bundle.participantNames.length > 0) {
      sections.push(
        `- ${t`Participants`}: ${bundle.participantNames.join(", ")}`,
      );
    }

    if (bundle.duration) {
      sections.push(`- ${t`Duration`}: ${bundle.duration}`);
    }

    if (includeMemo) {
      const memo = bundle.memoMd;
      if (memo) {
        sections.push("");
        sections.push(`## ${t`Memo`}`);
        sections.push(memo);
      }
    }

    if (includeSummary) {
      const summary = bundle.summaryMd;
      if (summary) {
        sections.push("");
        sections.push(`## ${t`Summary`}`);
        sections.push(summary);
      }
    }

    if (includeTranscript) {
      const transcript = bundle.transcriptText;
      if (transcript) {
        sections.push("");
        sections.push(`## ${t`Transcript`}`);
        sections.push(transcript);
      }
    }

    return sections.join("\n");
  };

  const buildTxtContent = (bundle: ExportBundle): string => {
    const sections: string[] = [];
    const title = bundle.title || t`Untitled`;
    sections.push(title);
    sections.push("=".repeat(title.length));

    if (bundle.createdAt) {
      sections.push(formatDate(bundle.createdAt));
    }

    if (bundle.participantNames.length > 0) {
      sections.push(
        `${t`Participants`}: ${bundle.participantNames.join(", ")}`,
      );
    }

    if (bundle.duration) {
      sections.push(`${t`Duration`}: ${bundle.duration}`);
    }

    if (includeMemo) {
      const memo = bundle.memoMd;
      if (memo) {
        sections.push("");
        sections.push(t`Memo`);
        sections.push("-".repeat(4));
        sections.push(markdownToText(memo));
      }
    }

    if (includeSummary) {
      const summary = bundle.summaryMd;
      if (summary) {
        sections.push("");
        sections.push(t`Summary`);
        sections.push("-".repeat(7));
        sections.push(markdownToText(summary));
      }
    }

    if (includeTranscript) {
      const transcript = bundle.transcriptText;
      if (transcript) {
        sections.push("");
        sections.push(t`Transcript`);
        sections.push("-".repeat(10));
        sections.push(transcript);
      }
    }

    return sections.join("\n");
  };

  const buildOrgContent = (bundle: ExportBundle): string => {
    const sections: string[] = [];
    const title = bundle.title || t`Untitled`;
    sections.push(`#+TITLE: ${title}`);

    if (bundle.createdAt) {
      sections.push(`#+DATE: ${formatDate(bundle.createdAt)}`);
    }

    sections.push("");
    sections.push(`* ${t`Metadata`}`);

    if (bundle.createdAt) {
      sections.push(`- ${t`Created`} :: ${formatDate(bundle.createdAt)}`);
    }

    if (bundle.participantNames.length > 0) {
      sections.push(
        `- ${t`Participants`} :: ${bundle.participantNames.join(", ")}`,
      );
    }

    if (bundle.duration) {
      sections.push(`- ${t`Duration`} :: ${bundle.duration}`);
    }

    if (includeMemo) {
      const memo = bundle.memoMd;
      if (memo) {
        sections.push("");
        sections.push(`* ${t`Memo`}`);
        sections.push(markdownToOrg(memo));
      }
    }

    if (includeSummary) {
      const summary = bundle.summaryMd;
      if (summary) {
        sections.push("");
        sections.push(`* ${t`Summary`}`);
        sections.push(markdownToOrg(summary));
      }
    }

    if (includeTranscript) {
      const transcript = bundle.transcriptText;
      if (transcript) {
        sections.push("");
        sections.push(`* ${t`Transcript`}`);
        sections.push(transcript);
      }
    }

    return sections.join("\n");
  };

  const buildPdfContent = (
    bundle: ExportBundle,
  ): {
    enhancedMd: string;
    memoMd: string | null;
    transcript: { items: TranscriptItem[] } | null;
    metadata: ExportMetadata | null;
  } => {
    const metadata: ExportMetadata = {
      title: bundle.title || t`Untitled`,
      createdAt: bundle.createdAt ? formatDate(bundle.createdAt) : "",
      participants: bundle.participantNames,
      eventTitle: eventTitle || null,
      duration: bundle.duration,
    };

    let memoMd: string | null = null;
    if (includeMemo) {
      const memo = bundle.memoMd;
      if (memo) memoMd = memo;
    }

    const parts: string[] = [];

    if (includeSummary) {
      const summary = bundle.summaryMd;
      if (summary) parts.push(summary);
    }

    return {
      enhancedMd: parts.join("\n\n"),
      memoMd,
      transcript:
        includeTranscript && transcriptItems.length > 0
          ? { items: transcriptItems }
          : null,
      metadata,
    };
  };

  const currentBundle = (): ExportBundle => ({
    title: sessionTitle ?? "",
    createdAt: sessionCreatedAt,
    participantNames,
    duration: transcriptDuration,
    memoMd: includeMemo ? getMemoMd() : "",
    summaryMd: includeSummary ? getSummaryMd() : "",
    transcriptText: includeTranscript ? getTranscriptText() : "",
  });

  /**
   * Exporting a second note cannot use per-session hooks, so the bundle comes
   * from the same rows the hooks read. Transcripts are omitted deliberately:
   * rendering them with speaker labels runs through a hook-built request, and
   * silently exporting an unlabelled transcript would be worse than saying so.
   */
  const loadBundle = async (id: string): Promise<ExportBundle | null> => {
    const snapshot = await loadSessionContentSnapshot(id);
    if (!snapshot) {
      return null;
    }

    return {
      title: snapshot.title,
      createdAt: snapshot.createdAt,
      participantNames: [],
      duration: null,
      memoMd: includeMemo ? snapshot.rawMarkdown : "",
      summaryMd: includeSummary
        ? (snapshot.enhancedNotes[0]?.markdown ?? "")
        : "",
      transcriptText: "",
    };
  };

  const isAudio = format === "audio";

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const downloadsPath = await downloadDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      // Many files need somewhere of their own; dropping a whole library
      // loose into Downloads is worse than not offering it.
      const destDir =
        scope === "all"
          ? await join(downloadsPath, `Meeki export ${timestamp}`)
          : downloadsPath;

      if (isAudio) {
        const targets =
          scope === "all"
            ? await loadExportableRecordings()
            : [
                {
                  sessionId,
                  title: sessionTitle ?? "",
                  startedAt: sessionCreatedAt ?? new Date().toISOString(),
                  timezone: null,
                },
              ];

        let firstPath: string | null = null;
        for (const target of targets) {
          const result = await fsSyncCommands.audioExport(
            target.sessionId,
            destDir,
            buildExportName(target),
          );
          // A note with no recording is normal, not a failure worth aborting on.
          if (result.status === "ok") {
            firstPath ??= result.data;
          }
        }

        if (!firstPath) {
          throw new Error("no_audio_to_export");
        }
        return scope === "all" ? destDir : firstPath;
      }

      const writeBundle = async (bundle: ExportBundle) => {
        const sanitizedTitle = (
          (bundle.title || t`Untitled`).trim() || t`Untitled`
        ).replace(/[<>:"/\\|?*]/g, "_");
        const filename =
          scope === "all"
            ? `${sanitizedTitle}.${format}`
            : `${sanitizedTitle}_${timestamp}.${format}`;
        const path = await join(destDir, filename);

        if (format === "pdf") {
          const result = await exportCommands.export(
            path,
            buildPdfContent(bundle),
          );
          if (result.status === "error") {
            throw new Error(result.error);
          }
        } else {
          const textContent =
            format === "md"
              ? buildMdContent(bundle)
              : format === "org"
                ? buildOrgContent(bundle)
                : buildTxtContent(bundle);
          const result = await fs2Commands.writeTextFile(path, textContent);
          if (result.status === "error") {
            throw new Error(result.error);
          }
        }
        return path;
      };

      if (scope === "current") {
        return writeBundle(currentBundle());
      }

      const ids = await loadActiveSessionIds();
      let written = 0;
      for (const id of ids) {
        const bundle = await loadBundle(id);
        // An empty note is skipped rather than writing a file with a heading
        // and nothing under it.
        if (!bundle || (!bundle.memoMd && !bundle.summaryMd)) {
          continue;
        }
        await writeBundle(bundle);
        written += 1;
      }

      if (written === 0) {
        throw new Error("nothing_to_export");
      }
      return destDir;
    },
    onSuccess: (path) => {
      if (path) {
        void analyticsCommands.event({
          event: "session_exported",
          format,
          include_summary: includeSummary,
          include_transcript: includeTranscript,
        });
        void openerCommands.revealItemInDir(path);
      }
      onOpenChange(false);
    },
    onError: console.error,
  });

  const hasAnyContentSelected =
    isAudio || includeMemo || includeSummary || includeTranscript;
  const isTranscriptPending = includeTranscript && isTranscriptLoading;
  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/20 backdrop-blur-xs"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="absolute top-1/2 left-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={cn([
            "border-border/80 bg-background rounded-xl border",
            "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
            "flex flex-col gap-5 p-7 text-center",
          ])}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">
              <Trans>Export</Trans>
            </h2>
            <p className="text-muted-foreground text-sm">
              <Trans>Choose what to export and in which format.</Trans>
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div
              className={cn(["flex flex-col gap-2", lockedScope && "hidden"])}
            >
              <span className="text-sm font-medium">
                <Trans>Notes</Trans>
              </span>
              <div className="flex justify-center gap-4">
                {(
                  [
                    ["current", <Trans>This note</Trans>],
                    ["all", <Trans>All notes</Trans>],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="export-scope"
                      checked={scope === value}
                      onChange={() => setScope(value)}
                      className="accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                <Trans>File format</Trans>
              </span>
              <div className="flex justify-center gap-4">
                {(["pdf", "txt", "md", "org", "audio"] as const).map((f) => (
                  <label
                    key={f}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <input
                      type="radio"
                      name="export-format"
                      checked={format === f}
                      onChange={() => setFormat(f)}
                      className="accent-primary"
                    />
                    {f === "md"
                      ? "Markdown"
                      : f === "org"
                        ? "Org"
                        : f === "audio"
                          ? "MP3"
                          : f.toUpperCase()}
                  </label>
                ))}
              </div>
            </div>

            <div
              className={cn([
                "flex flex-col gap-2",
                isAudio && "pointer-events-none opacity-40",
              ])}
            >
              <span className="text-sm font-medium">
                <Trans>Include</Trans>
              </span>
              {scope === "all" && !isAudio && (
                <p className="text-muted-foreground text-xs">
                  <Trans>
                    Transcripts are only available when exporting a single note.
                  </Trans>
                </p>
              )}
              <div className="flex justify-center gap-4">
                {(
                  [
                    ["memo", <Trans>Memo</Trans>, includeMemo, setIncludeMemo],
                    [
                      "summary",
                      <Trans>Summary</Trans>,
                      includeSummary,
                      setIncludeSummary,
                    ],
                    [
                      "transcript",
                      <Trans>Transcript</Trans>,
                      includeTranscript && scope === "current",
                      setIncludeTranscript,
                    ],
                  ] as const
                ).map(([id, label, checked, setter]) => (
                  <label
                    key={id}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setter(e.target.checked)}
                      className="accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => mutate(null)}
            disabled={
              isPending || isTranscriptPending || !hasAnyContentSelected
            }
            className="border-primary bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-full rounded-full border-2 text-sm font-medium shadow-[0_4px_14px_rgba(87,83,78,0.4)] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending
              ? t`Exporting...`
              : isTranscriptPending
                ? t`Preparing transcript...`
                : t`Export`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
