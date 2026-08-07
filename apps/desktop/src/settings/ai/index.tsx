import { Trans } from "@lingui/react/macro";

import { ConfigureProviders as ConfigureLlmProviders } from "./llm/configure";
import { LlmSettingsProvider } from "./llm/context";
import { SelectProviderAndModel as SelectLlmProviderAndModel } from "./llm/select";
import { ConfigureProviders as ConfigureSttProviders } from "./stt/configure";
import { SttSettingsProvider } from "./stt/context";
import { SelectProviderAndModel as SelectSttProviderAndModel } from "./stt/select";

import { OnDeviceSetupCard } from "~/settings/ai/shared/on-device-setup";
import { SettingsPageTitle } from "~/settings/page-title";

/**
 * One page for both models, because "Transcription" and "Intelligence" name
 * the machinery rather than the job. Someone looking for why their meeting was
 * not written down, or why no summary appeared, has to already know which of
 * those two words owns their problem. The section headings say what each model
 * does first and what it is called second.
 *
 * The two halves keep their own providers and their own components; this only
 * puts them under one roof.
 */
export function AiModels() {
  return (
    <div className="flex flex-col gap-10">
      <SettingsPageTitle title={<Trans>AI Models</Trans>} />

      {/*
        One control for both halves, at the top, so the fix for "nothing works
        yet" is the first thing on the page. It fetches only what is missing and
        hides itself once both jobs have something to do them.
      */}
      <OnDeviceSetupCard />

      <SttSettingsProvider>
        <section className="flex flex-col gap-6">
          <SectionHeading
            title={<Trans>Voice to Text</Trans>}
            detail={
              <Trans>
                Writes down what was said in your meetings. Also called
                transcription.
              </Trans>
            }
          />
          <SelectSttProviderAndModel />
          <ConfigureSttProviders />
        </section>
      </SttSettingsProvider>

      <LlmSettingsProvider>
        <section className="flex flex-col gap-6">
          <SectionHeading
            title={<Trans>Text summarisation &amp; more</Trans>}
            detail={
              <Trans>
                Turns a transcript into a summary, and answers questions about
                it in chat. Also called intelligence.
              </Trans>
            }
          />
          <SelectLlmProviderAndModel />
          <ConfigureLlmProviders />
        </section>
      </LlmSettingsProvider>
    </div>
  );
}

function SectionHeading({
  title,
  detail,
}: {
  title: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="font-hand text-2xl leading-none font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{detail}</p>
    </div>
  );
}
