import { Switch } from "@meeki/ui/components/ui/switch";

import { setSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

/**
 * On by default. Starting the model at launch cost several GB and a slower
 * first paint for a session the user might never ask anything of.
 */
export function SaveMemoryToggle() {
  const enabled = useConfigValue("save_memory");

  return (
    <div className="border-border/60 bg-card/70 flex items-center justify-between gap-4 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Save memory when possible</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Loads the model only when you ask for a summary or open chat, and
          unloads it after five minutes idle. Turn this off to keep it resident
          so the first answer is instant.
        </p>
      </div>
      <Switch
        checked={enabled !== false}
        aria-label="Save memory when possible"
        onCheckedChange={(checked) => {
          void setSettingValue("save_memory", checked);
        }}
      />
    </div>
  );
}
