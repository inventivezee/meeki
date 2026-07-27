import { type ModelInfo } from "@meeki/plugin-local-llm";
import { cn } from "@meeki/utils";

/**
 * Decimal GB, because a download is checked against Finder and Hugging Face,
 * and both count storage in powers of ten. Dividing by 1024³ here would call
 * the 13.6 GB Gemma file "12.7 GB".
 */
export function formatGb(bytes: number) {
  return (bytes / 1e9).toFixed(1);
}

/** Memory is binary and reads as whole tiers ("24 GB Mac"), never as 24.0. */
export function formatMemoryGb(bytes: number) {
  return Math.round(bytes / (1024 * 1024 * 1024));
}

/**
 * Compared at the rounded GB the user actually sees, so a Mac that reports
 * 23.9 GiB never gets "needs 24 GB · this Mac has 24 GB".
 */
export function fitsInMemory(model: ModelInfo, totalMemoryBytes: number) {
  return (
    totalMemoryBytes === 0 ||
    formatMemoryGb(model.min_memory_bytes) <= formatMemoryGb(totalMemoryBytes)
  );
}

/**
 * What a model is for, what it costs to fetch, and what it needs to run —
 * enough to choose between catalog entries without leaving the app.
 */
export function ModelFacts({
  model,
  totalMemoryBytes,
}: {
  model: ModelInfo;
  totalMemoryBytes: number;
}) {
  const fits = fitsInMemory(model, totalMemoryBytes);

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        {model.description}
      </p>
      <p
        className={cn([
          "text-[11px]",
          fits ? "text-muted-foreground" : "text-amber-700",
        ])}
      >
        {formatGb(model.size_bytes)} GB download · needs{" "}
        {formatMemoryGb(model.min_memory_bytes)} GB RAM
        {fits
          ? ""
          : ` · this Mac has ${formatMemoryGb(totalMemoryBytes)} GB, so it will run slowly or not at all`}
      </p>
    </div>
  );
}
