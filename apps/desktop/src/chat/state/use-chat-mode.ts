import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useChatContext } from "./chat-context";

import { claimLocalLlm } from "~/ai/local-llm-demand";
import { useTabs } from "~/store/zustand/tabs";

export type { ChatEvent, ChatMode } from "~/store/zustand/tabs";

export function useChatMode() {
  const mode = useTabs((state) => state.chatMode);

  // Opening chat is the earliest reliable signal that the local model is
  // about to be asked something, which gives it time to load before the
  // first message rather than stalling on it.
  useEffect(() => {
    if (mode === "FloatingClosed") {
      return;
    }
    return claimLocalLlm("chat");
  }, [mode]);
  const transitionChatMode = useTabs((state) => state.transitionChatMode);

  const groupId = useChatContext((state) => state.groupId);
  const sessionId = useChatContext((state) => state.sessionId);
  const setGroupId = useChatContext((state) => state.setGroupId);
  const rollbackFailedGroup = useChatContext(
    (state) => state.rollbackFailedGroup,
  );
  const startNewChat = useChatContext((state) => state.startNewChat);
  const selectChat = useChatContext((state) => state.selectChat);

  useHotkeys(
    "mod+j",
    () => {
      transitionChatMode({ type: "TOGGLE" });
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
    [transitionChatMode],
  );

  return {
    mode,
    sendEvent: transitionChatMode,
    groupId,
    sessionId,
    setGroupId,
    rollbackFailedGroup,
    startNewChat,
    selectChat,
  };
}
