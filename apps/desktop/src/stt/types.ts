import type { SpeakerHintStorage, WordStorage } from "@meeki/store";

export type WordWithId = WordStorage & { id: string };
export type SpeakerHintWithId = SpeakerHintStorage & { id: string };
