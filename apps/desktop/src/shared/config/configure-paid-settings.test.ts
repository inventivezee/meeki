import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStoredSettingValues: vi.fn(),
  setSettingValues: vi.fn(async () => undefined),
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: mocks.getStoredSettingValues,
  setSettingValues: mocks.setSettingValues,
}));

import { configurePaidSettings } from "./configure-paid-settings";

describe("configurePaidSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not auto-select Anarlog Pro STT or LLM", async () => {
    mocks.getStoredSettingValues.mockResolvedValue({
      values: {},
      hasValues: new Set(),
    });

    await configurePaidSettings();

    expect(mocks.setSettingValues).not.toHaveBeenCalled();
  });
});
