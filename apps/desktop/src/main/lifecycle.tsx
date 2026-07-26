import { useRouteContext } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

import {
  useEnsureLocalLlm,
  useLanguageModel,
  useLLMConnection,
} from "~/ai/hooks";
import { AttachmentTransferLifecycle } from "~/attachment-sync/lifecycle";
import { useAuth } from "~/auth";
import { searchCalendarEvents } from "~/calendar/queries";
import { useSessionTab } from "~/chat/components/use-session-tab";
import { buildChatTools } from "~/chat/tools";
import { searchContacts } from "~/contacts/queries";
import { useRegisterTools } from "~/contexts/tool";
import {
  stripLegacyWelcomeDemoMeetingLinks,
  takePendingWelcomeSession,
} from "~/onboarding/welcome-note";
import { useSearchEngine } from "~/search/contexts/engine";
import { initEnhancerService } from "~/services/enhancer";
import { OwnedSharedNotePublisher } from "~/session-sharing/sync";
import { SharedAttachmentCacheLifecycle } from "~/shared-notes/attachment-cache-lifecycle";
import { SharedNotePreviewAuthLifecycle } from "~/shared-notes/preview";
import { DurableSharedNoteCacheSync } from "~/shared-notes/sync";
import { useConfigValue } from "~/shared/config";
import { configureAssemblyAiSttFromEnv } from "~/shared/config/configure-assemblyai";
import { configureVeniceLlmFromEnv } from "~/shared/config/configure-venice";
import { useDesktopTabLifecycle } from "~/shared/desktop-tab-lifecycle";
import { useMountEffect } from "~/shared/hooks/useMountEffect";
import { useTabs } from "~/store/zustand/tabs";
import { LiveCaptureRecovery } from "~/stt/live-capture-recovery";
import { MainListenerControlBridge } from "~/stt/window-control";

export function useClassicMainLifecycle() {
  const openNew = useTabs((state) => state.openNew);

  const openDefaultEmptyTab = useCallback(() => {
    openNew({ type: "empty" });
  }, [openNew]);

  const openPendingWelcomeTab = useCallback(() => {
    const welcomeSessionId = takePendingWelcomeSession();
    if (welcomeSessionId) {
      openNew({ type: "sessions", id: welcomeSessionId });
    }
  }, [openNew]);

  useDesktopTabLifecycle({
    onEmpty: openDefaultEmptyTab,
    onInitialized: openPendingWelcomeTab,
    onZeroTabs: openDefaultEmptyTab,
  });
}

export function ClassicMainServices() {
  return (
    <>
      <AttachmentTransferLifecycle />
      <DurableSharedNoteCacheSync />
      <SharedAttachmentCacheLifecycle />
      <OwnedSharedNotePublisher />
      <SharedNotePreviewAuthLifecycle />
      <LiveCaptureRecovery />
      <MainListenerControlBridge />
      <ToolRegistration />
      <LocalLlmEnsure />
      <EnhancerInit />
      <LegacyWelcomeDemoCleanup />
    </>
  );
}

function LocalLlmEnsure() {
  useEnsureLocalLlm();
  return null;
}

function LegacyWelcomeDemoCleanup() {
  useMountEffect(() => {
    void stripLegacyWelcomeDemoMeetingLinks().catch((error) => {
      console.error(
        "[onboarding] failed to clear legacy welcome demo meeting links",
        error,
      );
    });
    void configureAssemblyAiSttFromEnv().catch((error) => {
      console.error(
        "[stt] failed to configure AssemblyAI from environment",
        error,
      );
    });
    void configureVeniceLlmFromEnv().catch((error) => {
      console.error("[llm] failed to configure Venice from environment", error);
    });
  });

  return null;
}

function ToolRegistration() {
  const auth = useAuth();
  const { search } = useSearchEngine();

  const getContactSearchResults = searchContacts;

  const getCalendarEventSearchResults = searchCalendarEvents;

  const { getSessionId, getEnhancedNoteId } = useSessionTab();
  const getAuthHeaders = useCallback(() => auth?.getHeaders(), [auth]);
  const openEditTab = useCallback((requestId: string) => {
    useTabs.getState().openNew({ type: "edit", requestId });
  }, []);

  useRegisterTools(
    "chat-general",
    () =>
      buildChatTools({
        search,
        getContactSearchResults,
        getCalendarEventSearchResults,
        getSessionId,
        getEnhancedNoteId,
        openEditTab,
        getAuthHeaders,
      }),
    [
      search,
      getContactSearchResults,
      getCalendarEventSearchResults,
      getSessionId,
      getEnhancedNoteId,
      openEditTab,
      getAuthHeaders,
    ],
  );

  return null;
}

function EnhancerInit() {
  const { aiTaskStore } = useRouteContext({
    from: "__root__",
  });

  const model = useLanguageModel("enhance");
  const { conn: llmConn } = useLLMConnection();
  const selectedTemplateId = useConfigValue("selected_template_id");

  const modelRef = useRef(model);
  modelRef.current = model;
  const llmConnRef = useRef(llmConn);
  llmConnRef.current = llmConn;
  const templateIdRef = useRef(selectedTemplateId);
  templateIdRef.current = selectedTemplateId;

  useEffect(() => {
    if (!aiTaskStore) return;

    const service = initEnhancerService({
      aiTaskStore,
      getModel: () => modelRef.current,
      getLLMConn: () => llmConnRef.current,
      getSelectedTemplateId: () => templateIdRef.current || undefined,
    });

    return () => service.dispose();
  }, [aiTaskStore]);

  return null;
}
