import { describe, expect, it } from "vitest";

import {
  buildAccountSessionShareUrl,
  buildPublicSessionShareUrl,
  buildSessionInvitationUrl,
  buildSessionShareLinkUrl,
} from "./urls";

const shareId = "33333333-3333-4333-8333-333333333333";
const invitationId = "55555555-5555-4555-8555-555555555555";
const token = "t".repeat(43);
const publicSlug = `s_${"a".repeat(32)}`;

describe("session share URLs", () => {
  it("places bearer link tokens only in the fragment", () => {
    const url = new URL(
      buildSessionShareLinkUrl({
        appBaseUrl: "https://meeki.ai",
        shareId,
        linkToken: token,
      }),
    );

    expect(url.pathname).toBe(`/share/link/${shareId}/`);
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${token}`);
  });

  it("places invitation tokens only in the fragment", () => {
    const url = new URL(
      buildSessionInvitationUrl({
        appBaseUrl: "https://meeki.ai",
        invitationId,
        inviteToken: token,
      }),
    );

    expect(url.pathname).toBe(`/share/invite/${invitationId}/`);
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${token}`);
  });

  it("builds token-free account and public URLs", () => {
    expect(
      buildAccountSessionShareUrl({
        appBaseUrl: "https://meeki.ai",
        shareId,
      }),
    ).toBe(`https://meeki.ai/share/${shareId}/`);
    expect(
      buildPublicSessionShareUrl({
        appBaseUrl: "https://meeki.ai",
        publicSlug,
      }),
    ).toBe(`https://meeki.ai/share/public/${publicSlug}/`);
  });

  it("targets non-stable builds without changing stable canonical URLs", () => {
    const linkUrl = new URL(
      buildSessionShareLinkUrl({
        appBaseUrl: "https://meeki.ai",
        shareId,
        linkToken: token,
        desktopScheme: "meeki-staging",
      }),
    );
    expect(linkUrl.searchParams.get("scheme")).toBe("meeki-staging");
    expect(linkUrl.hash).toBe(`#token=${token}`);

    const publicUrl = new URL(
      buildPublicSessionShareUrl({
        appBaseUrl: "https://meeki.ai",
        publicSlug,
        desktopScheme: "meeki-dev",
      }),
    );
    expect(publicUrl.searchParams.get("scheme")).toBe("meeki-dev");

    const stableUrl = new URL(
      buildAccountSessionShareUrl({
        appBaseUrl: "https://meeki.ai",
        shareId,
        desktopScheme: "meeki",
      }),
    );
    expect(stableUrl.search).toBe("");
  });

  it("rejects tokens or base URLs that could escape the canonical shape", () => {
    expect(() =>
      buildSessionShareLinkUrl({
        appBaseUrl: "javascript:alert(1)",
        shareId,
        linkToken: token,
      }),
    ).toThrow("Share URL is unavailable");
    expect(() =>
      buildSessionShareLinkUrl({
        appBaseUrl: "https://meeki.ai?token=old",
        shareId,
        linkToken: token,
      }),
    ).toThrow("Share URL is unavailable");
    expect(() =>
      buildSessionShareLinkUrl({
        appBaseUrl: "https://meeki.ai",
        shareId,
        linkToken: "bad?token",
      }),
    ).toThrow("Share URL is unavailable");
  });
});
