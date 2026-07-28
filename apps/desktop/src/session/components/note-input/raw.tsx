import { Trans } from "@lingui/react/macro";
import { AudioLinesIcon } from "lucide-react";
import type { EditorView } from "prosemirror-view";
import { forwardRef, useCallback, useMemo, useRef, useState } from "react";

import { parseJsonContent } from "@meeki/editor/markdown";
import {
  NoteEditor,
  type JSONContent,
  type NoteEditorRef,
  normalizePortableAttachmentUrls,
} from "@meeki/editor/note";
import { commands as analyticsCommands } from "@meeki/plugin-analytics";
import { cn } from "@meeki/utils";

import { AudioDropTarget } from "./audio-drop-target";
import { useNoteFileHandlerConfig } from "./file-handler";
import { MeetingChatHighlights } from "./meeting-chat-highlights";

import { useAudioExists } from "~/audio-player";
import { AppLinkView } from "~/editor-bridge/app-link-view";
import { useMentionConfig } from "~/editor-bridge/mention-config";
import { openEditorLink } from "~/editor-bridge/open-editor-link";
import { sessionMentionDropConfig } from "~/editor-bridge/session-mention-drop";
import { SessionNodeView } from "~/editor-bridge/session-view";
import { useSessionCommentAnchors } from "~/session-sharing/comment-anchors";
import { hasStoredNoteContent } from "~/session/components/shared";
import { useAttachmentResolver } from "~/session/hooks/useAttachmentResolver";
import { useUpdateSession } from "~/session/queries";
import {
  ensureFirstLineTitle,
  extractFirstLineTitle,
  documentTitlePlaceholder,
} from "~/session/title-content";
import { useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";

const extraNodeViews = { appLink: AppLinkView, session: SessionNodeView };

/**
 * The hint is for a genuinely untouched note. It goes the moment the user does
 * anything that shows intent — typing, recording, or opening chat — rather than
 * lingering over content they are creating.
 */
export function shouldShowUploadHint({
  hasTyped,
  rawMd,
  audioExists,
  sessionMode,
  chatMode,
}: {
  hasTyped: boolean;
  rawMd: string;
  audioExists: boolean;
  sessionMode: string;
  chatMode: string;
}): boolean {
  return (
    !hasTyped &&
    !hasStoredNoteContent(rawMd) &&
    !audioExists &&
    sessionMode === "inactive" &&
    chatMode === "FloatingClosed"
  );
}

export const RawEditor = forwardRef<
  NoteEditorRef,
  {
    sessionId: string;
    rawMd: string;
    sessionTitle: string;
    className?: string;
    onNavigateToTitle?: (pixelWidth?: number) => void;
    syncTasks?: boolean;
    showFormatToolbar?: boolean;
    onViewReady?: (view: EditorView) => void;
    onViewDisposed?: (view: EditorView) => void;
  }
>(
  (
    {
      sessionId,
      rawMd,
      sessionTitle,
      className,
      onNavigateToTitle,
      syncTasks = true,
      showFormatToolbar = true,
      onViewReady,
      onViewDisposed,
    },
    ref,
  ) => {
    const updateSession = useUpdateSession(sessionId);
    const resolveAttachment = useAttachmentResolver(sessionId);
    const { audioDropTargetProps, fileHandlerConfig, isAudioDragActive } =
      useNoteFileHandlerConfig(sessionId);
    const initialContent = useMemo<JSONContent>(
      () => ensureFirstLineTitle(parseJsonContent(rawMd), sessionTitle),
      [rawMd, sessionTitle],
    );

    const persistChange = useCallback(
      (input: JSONContent) => {
        const portableInput = normalizePortableAttachmentUrls(input);
        const title = extractFirstLineTitle(portableInput);
        return updateSession({
          raw_md: JSON.stringify(portableInput),
          ...(title !== null || hasStoredNoteContent(rawMd)
            ? { title: title ?? "" }
            : {}),
        });
      },
      [rawMd, updateSession],
    );

    const hasTrackedWriteRef = useRef(false);
    const trackedSessionIdRef = useRef(sessionId);
    if (trackedSessionIdRef.current !== sessionId) {
      trackedSessionIdRef.current = sessionId;
      hasTrackedWriteRef.current = false;
    }

    const hasNonEmptyText = useCallback(
      (node?: JSONContent): boolean =>
        !!node?.text?.trim() ||
        !!node?.content?.some((child: JSONContent) => hasNonEmptyText(child)),
      [],
    );

    const handleChange = useCallback(
      (input: JSONContent) => {
        void persistChange(input).catch((error) => {
          console.error("[raw-editor] failed to persist note", error);
        });

        if (!hasTrackedWriteRef.current) {
          const hasContent = hasNonEmptyText(input);
          if (hasContent) {
            hasTrackedWriteRef.current = true;
            void trackNoteEdited();
          }
        }
      },
      [persistChange, hasNonEmptyText],
    );

    const mentionConfig = useMentionConfig();
    const commentAnchors = useSessionCommentAnchors(sessionId);

    // Note persistence is debounced, so rawMd still reads empty for the first
    // half second of typing. Track the keystroke locally so the hint goes on
    // the first character rather than after the debounce settles.
    const [hasTyped, setHasTyped] = useState(false);
    const audioExists = useAudioExists(sessionId);
    const sessionMode = useListener((state) => state.getSessionMode(sessionId));
    const chatMode = useTabs((state) => state.chatMode);

    const showUploadHint = shouldShowUploadHint({
      hasTyped,
      rawMd,
      audioExists,
      sessionMode,
      chatMode,
    });

    return (
      <AudioDropTarget
        targetProps={audioDropTargetProps}
        isActive={isAudioDragActive}
      >
        <div className="contents" onInputCapture={() => setHasTyped(true)}>
          {showUploadHint && (
            <div
              aria-hidden="true"
              className={cn([
                "pointer-events-none absolute inset-0 z-10",
                "flex flex-col items-center justify-center gap-2",
                "text-muted-foreground/70 select-none",
              ])}
            >
              <AudioLinesIcon className="size-6 opacity-60" />
              <p className="text-sm">
                <Trans>Drag and drop to upload a recording</Trans>
              </p>
            </div>
          )}
          <NoteEditor
            ref={ref}
            className={cn(["session-note-editor", className])}
            key={`session-${sessionId}-raw`}
            initialContent={initialContent}
            resolveAttachment={resolveAttachment}
            handleChange={handleChange}
            placeholderComponent={documentTitlePlaceholder}
            mentionConfig={mentionConfig}
            sessionMentionDropConfig={sessionMentionDropConfig}
            onNavigateToTitle={onNavigateToTitle}
            onLinkOpen={openEditorLink}
            fileHandlerConfig={fileHandlerConfig}
            taskSource={
              syncTasks
                ? { type: "session_raw_note", id: sessionId }
                : undefined
            }
            extraNodeViews={extraNodeViews}
            showFormatToolbar={showFormatToolbar}
            commentAnchorsEnabled
            onViewReady={(view) => {
              commentAnchors.onViewReady(view);
              onViewReady?.(view);
            }}
            onViewDisposed={(view) => {
              commentAnchors.onViewDisposed(view);
              onViewDisposed?.(view);
            }}
          />
          <MeetingChatHighlights sessionId={sessionId} />
        </div>
      </AudioDropTarget>
    );
  },
);

async function trackNoteEdited() {
  try {
    await analyticsCommands.event({
      event: "note_edited",
      has_content: true,
    });
  } catch (error) {
    console.error("[raw-editor] failed to record note analytics", error);
  }
}
