import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

import { Kbd } from "@meeki/ui/components/ui/kbd";
import { cn } from "@meeki/utils";

import { FloatingChatSphere } from "~/shared/chat-sphere";
import { StandardContentWrapper } from "~/shared/main";
import {
  useNewNote,
  useNewNoteAndListen,
  useNewNoteAndUpload,
  useNewNoteFromDroppedAudio,
} from "~/shared/useNewNote";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import {
  listUntranscribedSessions,
  useAudioBacklog,
} from "~/stt/audio-backlog";

export function TabContentEmpty({
  tab: _tab,
}: {
  tab: Extract<Tab, { type: "empty" }>;
}) {
  return (
    <StandardContentWrapper floatingButton={<FloatingChatSphere />}>
      <EmptyView />
    </StandardContentWrapper>
  );
}

function EmptyView() {
  const newNote = useNewNote({ behavior: "current" });
  const newNoteAndListen = useNewNoteAndListen({ behavior: "current" });
  const newNoteAndUpload = useNewNoteAndUpload();
  const newNoteFromDroppedAudio = useNewNoteFromDroppedAudio();
  const [isAudioDragActive, setIsAudioDragActive] = useState(false);
  const openCurrent = useTabs((state) => state.openCurrent);

  const uploadRecording = useCallback(
    () => void newNoteAndUpload("audio"),
    [newNoteAndUpload],
  );

  const openSettings = useCallback(
    () => openCurrent({ type: "settings" }),
    [openCurrent],
  );

  return (
    <div
      data-tauri-drag-region
      onDragOver={(event) => {
        event.preventDefault();
        setIsAudioDragActive(true);
      }}
      onDragLeave={() => setIsAudioDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsAudioDragActive(false);
        const files = Array.from(event.dataTransfer.files ?? []);
        if (files.length > 0) {
          void newNoteFromDroppedAudio(files);
        }
      }}
      className={cn([
        "relative flex h-full flex-col items-center justify-center gap-6",
        isAudioDragActive && "bg-accent/40",
      ])}
    >
      {isAudioDragActive ? (
        <div className="border-border/70 text-muted-foreground pointer-events-none absolute inset-6 flex items-center justify-center rounded-xl border border-dashed text-sm">
          <Trans>Drop audio files to transcribe them</Trans>
        </div>
      ) : null}
      <div className="flex min-w-[280px] flex-col gap-1 text-center">
        <ActionItem
          label={<Trans>New Note</Trans>}
          shortcut={["⌘", "N"]}
          onClick={newNote}
        />
        <ActionItem
          label={<Trans>Start Recording</Trans>}
          shortcut={["⌘", "⇧", "N"]}
          onClick={newNoteAndListen}
        />
        <ActionItem
          label={<Trans>Upload a Recording</Trans>}
          onClick={uploadRecording}
        />
        <ResumeBacklogItem />
        <div className="bg-accent my-1 h-px" />
        <ActionItem
          label={<Trans>Settings</Trans>}
          shortcut={["⌘", ","]}
          onClick={openSettings}
        />
      </div>
    </div>
  );
}

/**
 * How an interrupted backlog run is picked up again. The queue is a query, so
 * "resume" is just starting over — anything already transcribed no longer
 * matches. Hidden when there is nothing waiting, which is the normal case.
 */
function ResumeBacklogItem() {
  const running = useAudioBacklog((state) => state.running);
  const start = useAudioBacklog((state) => state.start);
  const [count, setCount] = useState(0);

  // Counted on mount and whenever a run ends, rather than polled: the empty tab
  // is a menu, not a dashboard, and this is the only place its contents depend
  // on the database.
  useEffect(() => {
    if (running) {
      return;
    }

    let current = true;
    void listUntranscribedSessions()
      .then((pending) => {
        if (current) {
          setCount(pending.length);
        }
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [running]);

  if (running || count === 0) {
    return null;
  }

  return (
    <ActionItem
      label={<Trans>Transcribe {count} imported recordings</Trans>}
      onClick={() => start(count)}
    />
  );
}

function ActionItem({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: React.ReactNode;
  shortcut?: string[];
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-tauri-drag-region="false"
      className={cn([
        "group",
        "flex items-center justify-between gap-8",
        "text-foreground text-sm",
        "rounded-full px-4 py-2",
        "hover:bg-accent cursor-pointer transition-colors",
      ])}
    >
      <span>{label}</span>
      {shortcut && shortcut.length > 0 ? (
        <Kbd
          className={cn([
            "transition-all duration-100",
            "group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_0_0_var(--kbd-shadow-outer-hover),inset_0_1px_0_0_var(--kbd-shadow-inset)]",
            "group-active:translate-y-0.5 group-active:shadow-none",
          ])}
        >
          {shortcut.join(" ")}
        </Kbd>
      ) : (
        icon
      )}
    </button>
  );
}
