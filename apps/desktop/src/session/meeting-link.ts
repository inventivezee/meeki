/** Legacy onboarding opened a hosted anarlog demo video; treat as no meeting. */
export function resolveMeetingLink(meetingLink: string | null | undefined) {
  if (!meetingLink) {
    return null;
  }
  if (meetingLink.includes("onboarding-demo")) {
    return null;
  }
  return meetingLink;
}
