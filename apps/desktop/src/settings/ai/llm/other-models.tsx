import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Channel } from "@tauri-apps/api/core";
import { Check, Download, Loader2 } from "lucide-react";
import { useState } from "react";

import {
  commands as localLlmCommands,
  type GgufLlmModel,
  type ModelInfo,
} from "@meeki/plugin-local-llm";
import { Button } from "@meeki/ui/components/ui/button";
import { sonnerToast } from "@meeki/ui/components/ui/toast";

import { Disclosure } from "~/chat/components/message/shared";
import { ModelFacts } from "~/settings/ai/shared/model-facts";

/**
 * Every catalog entry other than the one recommended for this Mac. Without
 * this the dropdown can only ever offer models that are already downloaded.
 */
export function OtherLocalModels({
  recommendedKey,
}: {
  recommendedKey: GgufLlmModel | null;
}) {
  const queryClient = useQueryClient();
  const [downloading, setDownloading] = useState<GgufLlmModel | null>(null);

  const supported = useQuery({
    queryKey: ["local-llm-supported"],
    queryFn: async () => {
      const result = await localLlmCommands.listSupportedModel();
      return result.status === "ok" ? result.data : [];
    },
    staleTime: Infinity,
  });

  // Same key as the sibling cards, so this reads the cached recommendation
  // rather than issuing another sysinfo probe.
  const recommended = useQuery({
    queryKey: ["local-llm-recommended"],
    queryFn: async () => {
      const result = await localLlmCommands.recommendedModel();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
    staleTime: Infinity,
  });

  const downloaded = useQuery({
    queryKey: ["local-llm-downloaded"],
    queryFn: async () => {
      const result = await localLlmCommands.listDownloadedModel();
      return result.status === "ok" ? result.data : [];
    },
    refetchInterval: 2_000,
  });

  const download = useMutation({
    mutationFn: async (model: ModelInfo) => {
      setDownloading(model.key);
      const channel = new Channel<number>();
      channel.onmessage = (value) => {
        if (value >= 0) {
          sonnerToast.message(`Downloading ${model.name}`, {
            id: `local-llm-other-${model.key}`,
            description: `${Math.round(value)}%`,
          });
        }
      };
      const result = await localLlmCommands.downloadModel(model.key, channel);
      if (result.status === "error") {
        throw new Error(result.error);
      }
    },
    onSuccess: async (_data, model) => {
      await queryClient.invalidateQueries({
        queryKey: ["local-llm-downloaded"],
      });
      sonnerToast.success(`${model.name} downloaded`, {
        id: `local-llm-other-${model.key}`,
        description: "Select it in the model dropdown above.",
      });
    },
    onError: (error, model) => {
      sonnerToast.error(`Couldn’t download ${model.name}`, {
        id: `local-llm-other-${model.key}`,
        description: error instanceof Error ? error.message : String(error),
      });
    },
    onSettled: () => setDownloading(null),
  });

  const others = (supported.data ?? []).filter(
    (model) => model.key !== recommendedKey,
  );

  if (others.length === 0) {
    return null;
  }

  return (
    <Disclosure
      icon={<Download className="h-3 w-3" />}
      title="Other local models"
    >
      <div className="flex flex-col gap-2 pt-1">
        {others.map((model) => {
          const isDownloaded = downloaded.data?.includes(model.key) ?? false;
          const isDownloading = downloading === model.key;

          return (
            <div
              key={model.key}
              className="flex items-start justify-between gap-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-xs font-medium">{model.name}</p>
                <ModelFacts
                  model={model}
                  totalMemoryBytes={recommended.data?.total_memory_bytes ?? 0}
                />
              </div>
              {isDownloaded ? (
                <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]">
                  <Check className="size-3" />
                  Downloaded
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-xs"
                  disabled={downloading !== null}
                  onClick={() => download.mutate(model)}
                >
                  {isDownloading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    "Download"
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Disclosure>
  );
}
