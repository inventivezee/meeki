// A file chosen from the native dialog arrives as a path; one dropped into the
// window arrives as a File, because WKWebView does not expose its path.
type PendingUpload =
  | { kind: "audio" | "transcript"; filePath: string; file?: undefined }
  | { kind: "audio"; file: File; filePath?: undefined };

const pending = new Map<string, PendingUpload>();

export function setPendingUpload(
  sessionId: string,
  upload: PendingUpload,
): void {
  pending.set(sessionId, upload);
}

export function consumePendingUpload(sessionId: string): PendingUpload | null {
  const upload = pending.get(sessionId);
  if (upload) {
    pending.delete(sessionId);
    return upload;
  }
  return null;
}
