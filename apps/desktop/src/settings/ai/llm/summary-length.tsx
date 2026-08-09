import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meeki/ui/components/ui/select";

import {
  DEFAULT_SUMMARY_LENGTH,
  isSummaryLength,
  type SummaryLength,
} from "~/services/enhancer/summary-length";
import { setSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";

const OPTIONS: { value: SummaryLength; label: string; hint: string }[] = [
  { value: "brief", label: "Brief", hint: "Just the decisions and actions" },
  { value: "balanced", label: "Balanced", hint: "The default" },
  { value: "detailed", label: "Detailed", hint: "Keeps supporting detail" },
];

/**
 * Length still scales with how long the meeting was — this shifts that budget
 * up or down rather than replacing it, so a long meeting stays longer than a
 * short one at every setting.
 */
export function SummaryLengthSelect() {
  const stored = useConfigValue("summary_length");
  const value = isSummaryLength(stored) ? stored : DEFAULT_SUMMARY_LENGTH;

  return (
    <div className="border-border/60 bg-card/70 flex items-center justify-between gap-4 rounded-2xl border px-4 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Summary length</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          How much detail to keep. Summaries already grow with the length of the
          meeting; this sets how generous that is.
        </p>
      </div>
      <Select
        value={value}
        onValueChange={(next) => {
          void setSettingValue("summary_length", next);
        }}
      >
        <SelectTrigger className="w-36 shrink-0" aria-label="Summary length">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="flex flex-col">
                <span>{option.label}</span>
                <span className="text-muted-foreground text-xs">
                  {option.hint}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
