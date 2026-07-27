type Sortable = {
  id: string;
  disabled?: boolean;
  displayName: string;
};

export function sortProviders<T extends Sortable>(
  providers: readonly T[],
): T[] {
  return [...providers].sort((a, b) => {
    // Prefer AssemblyAI (STT), On device, and Venice for Meeki.
    // `hyprnote` is the STT id for on-device Soniqo models; the hosted LLM
    // provider that used to share this id was removed.
    if (a.id === "assemblyai") return -1;
    if (b.id === "assemblyai") return 1;
    if (a.id === "on_device") return -1;
    if (b.id === "on_device") return 1;
    if (a.id === "hyprnote" && !a.disabled) return -1;
    if (b.id === "hyprnote" && !b.disabled) return 1;
    if (a.id === "venice") return -1;
    if (b.id === "venice") return 1;

    if (a.id === "custom") return 1;
    if (b.id === "custom") return -1;

    if (a.disabled && !b.disabled) return 1;
    if (!a.disabled && b.disabled) return -1;

    const localOnlyIds = ["ollama", "lmstudio"];
    const aIsLocalOnly = localOnlyIds.includes(a.id);
    const bIsLocalOnly = localOnlyIds.includes(b.id);
    if (aIsLocalOnly && !bIsLocalOnly) return 1;
    if (!aIsLocalOnly && bIsLocalOnly) return -1;

    return a.displayName.localeCompare(b.displayName);
  });
}
