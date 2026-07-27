import { expect, it } from "vitest";

import { resolveMeetingLink } from "./meeting-link";

it("treats missing links as absent", () => {
  expect(resolveMeetingLink(undefined)).toBeNull();
  expect(resolveMeetingLink(null)).toBeNull();
  expect(resolveMeetingLink("")).toBeNull();
});

it("strips the legacy hosted onboarding demo meeting", () => {
  expect(resolveMeetingLink("https://meeki.org/onboarding-demo/")).toBeNull();
  expect(
    resolveMeetingLink(
      "https://meeki.org/onboarding-demo/?completion_url=http://127.0.0.1:1/onboarding-demo/complete",
    ),
  ).toBeNull();
});

it("keeps real meeting links", () => {
  expect(resolveMeetingLink("https://meet.google.com/abc-defg-hij")).toBe(
    "https://meet.google.com/abc-defg-hij",
  );
});
