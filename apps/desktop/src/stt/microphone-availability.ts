import { commands as listenerCommands } from "@meeki/plugin-transcription";

export const NO_MICROPHONE_MESSAGE =
  "No microphone detected. Connect one and try again — desktops like the Mac mini and Mac Studio have no built-in mic.";

/**
 * CoreAudio reports `kAudioHardwareBadObjectError` when asked for a default
 * input on a machine with none, which surfaces deep in the capture actor as an
 * opaque restart loop and only reaches the user as a transcription failure
 * minutes later. Check before starting so the real cause is what they read.
 *
 * Returns true when recording should proceed. A failing enumeration is treated
 * as "available" — better to attempt the capture than to block on a probe.
 */
export async function hasMicrophone() {
  try {
    const result = await listenerCommands.listMicrophoneDevices();
    if (result.status === "error") {
      console.warn("[listener] could not enumerate microphones", result.error);
      return true;
    }
    return result.data.length > 0;
  } catch (error) {
    console.warn("[listener] microphone enumeration threw", error);
    return true;
  }
}
