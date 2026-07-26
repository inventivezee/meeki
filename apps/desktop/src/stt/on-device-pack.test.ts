import { describe, expect, test } from "vitest";

import {
  isOnDeviceSttPackModel,
  modelsForOnDeviceDownload,
  ON_DEVICE_STT_PACK,
} from "./on-device-pack";

describe("on-device STT pack", () => {
  test("includes Parakeet streaming and Qwen3 Large", () => {
    expect(ON_DEVICE_STT_PACK).toEqual([
      "soniqo-parakeet-streaming",
      "soniqo-qwen3-large",
    ]);
  });

  test("downloads the full pack from either pack member", () => {
    expect(modelsForOnDeviceDownload("soniqo-qwen3-large")).toEqual([
      ...ON_DEVICE_STT_PACK,
    ]);
    expect(modelsForOnDeviceDownload("soniqo-parakeet-streaming")).toEqual([
      ...ON_DEVICE_STT_PACK,
    ]);
  });

  test("keeps unrelated local models as single downloads", () => {
    expect(modelsForOnDeviceDownload("soniqo-qwen3-small")).toEqual([
      "soniqo-qwen3-small",
    ]);
    expect(isOnDeviceSttPackModel("soniqo-qwen3-small")).toBe(false);
  });
});
