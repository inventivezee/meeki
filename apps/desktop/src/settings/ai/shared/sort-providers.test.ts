import { describe, expect, test } from "vitest";

import { sortProviders } from "./sort-providers";

describe("sortProviders", () => {
  test("keeps AssemblyAI first and Custom last", () => {
    const sorted = sortProviders([
      { id: "custom", displayName: "Custom" },
      { id: "fireworks", displayName: "Fireworks", disabled: true },
      { id: "openai", displayName: "OpenAI" },
      { id: "hyprnote", displayName: "Meeki" },
      { id: "assemblyai", displayName: "AssemblyAI" },
    ]);

    expect(sorted.map((provider) => provider.id)).toEqual([
      "assemblyai",
      "hyprnote",
      "openai",
      "fireworks",
      "custom",
    ]);
  });
});
