import { Switch } from "@hypr/ui/components/ui/switch";

import { setSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

/**
 * Reasoning is off by default: it multiplies summary latency, and the short
 * tasks (titles, key facts) run on tight token budgets.
 */
export function ThinkingToggle() {
  const enabled = useConfigValue("llm_thinking");

  return (
    <div className="border-border/60 bg-card/70 flex items-center justify-between gap-4 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Thinking mode</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Lets the model reason before writing the summary. More accurate on
          implicit action items, but noticeably slower. You can expand the
          model’s thinking while it works.
        </p>
      </div>
      <Switch
        checked={Boolean(enabled)}
        aria-label="Thinking mode"
        onCheckedChange={(checked) => {
          void setSettingValue("llm_thinking", checked);
        }}
      />
    </div>
  );
}
