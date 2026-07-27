import { env } from "~/env";
import { getStoredAiProvider, setAiProvider } from "~/settings/providers";
import { getStoredSettingValues, setSettingValues } from "~/settings/queries";

const VENICE_PROVIDER = "venice";
const VENICE_DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";
/**
 * Venice private Qwen 3.6 35B-A3B (MoE, ~3B active) — preferred for
 * note/interpretation/summarization over slower reasoning-first models.
 */
export const VENICE_DEFAULT_MODEL = "e2ee-qwen3-6-35b-a3b";

/**
 * If VITE_VENICE_API_KEY is set, configure Venice and select Qwen 3.6 whenever
 * the LLM provider is unset or still pointing at Meeki Pro cloud.
 */
export async function configureVeniceLlmFromEnv(): Promise<void> {
  const apiKey = env.VITE_VENICE_API_KEY?.trim();
  if (!apiKey) {
    return;
  }

  const baseUrl = env.VITE_VENICE_BASE_URL?.trim() || VENICE_DEFAULT_BASE_URL;
  const model = env.VITE_VENICE_MODEL?.trim() || VENICE_DEFAULT_MODEL;

  const existing = await getStoredAiProvider("llm", VENICE_PROVIDER);
  if (!existing?.api_key) {
    await setAiProvider("llm", VENICE_PROVIDER, {
      base_url: baseUrl,
      api_key: apiKey,
    });
  }

  const { values } = await getStoredSettingValues();
  const switchingFromHyprnote = values.current_llm_provider === "hyprnote";
  const onVenice = values.current_llm_provider === VENICE_PROVIDER;
  const legacyVeniceModel =
    onVenice &&
    (!values.current_llm_model ||
      values.current_llm_model === "zai-org-glm-5-2" ||
      values.current_llm_model === "zai-org-glm-5");
  const shouldSelectVenice =
    !values.current_llm_provider || switchingFromHyprnote || legacyVeniceModel;

  if (!shouldSelectVenice) {
    return;
  }

  await setSettingValues({
    current_llm_provider: VENICE_PROVIDER,
    current_llm_model: model,
  });
}
