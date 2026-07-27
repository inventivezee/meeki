import { env } from "~/env";
import { getStoredAiProvider, setAiProvider } from "~/settings/providers";
import { getStoredSettingValues, setSettingValues } from "~/settings/queries";

const ASSEMBLYAI_PROVIDER = "assemblyai";
const ASSEMBLYAI_DEFAULT_MODEL = "u3-rt-pro";

/**
 * If VITE_ASSEMBLYAI_API_KEY is set, ensure AssemblyAI is configured and selected
 * whenever STT is unset or still pointing at Meeki Pro cloud.
 */
export async function configureAssemblyAiSttFromEnv(): Promise<void> {
  const apiKey = env.VITE_ASSEMBLYAI_API_KEY?.trim();
  if (!apiKey) {
    return;
  }

  const baseUrl =
    env.VITE_ASSEMBLYAI_BASE_URL?.trim() || "https://api.assemblyai.com";

  const existing = await getStoredAiProvider("stt", ASSEMBLYAI_PROVIDER);
  if (!existing?.api_key) {
    await setAiProvider("stt", ASSEMBLYAI_PROVIDER, {
      base_url: baseUrl,
      api_key: apiKey,
    });
  }

  const { values } = await getStoredSettingValues();
  const switchingFromHyprnote = values.current_stt_provider === "hyprnote";
  const shouldSelectAssemblyAi =
    !values.current_stt_provider ||
    switchingFromHyprnote ||
    (values.current_stt_provider === ASSEMBLYAI_PROVIDER &&
      !values.current_stt_model);

  if (!shouldSelectAssemblyAi) {
    return;
  }

  await setSettingValues({
    current_stt_provider: ASSEMBLYAI_PROVIDER,
    current_stt_model:
      switchingFromHyprnote || !values.current_stt_model
        ? ASSEMBLYAI_DEFAULT_MODEL
        : values.current_stt_model,
  });
}
