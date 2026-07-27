"use client";

import { useState } from "react";

import styles from "./Glassbox.module.css";

const DOWNLOAD_URL = "https://github.com/inventivezee/meeki/releases/latest";
const GITHUB_URL = "https://github.com/inventivezee/meeki";

type ProcessingMode = "local" | "api" | "managed";
type DemoTab = "notes" | "transcript" | "flow";

type FlowStep = {
  number: string;
  title: string;
  detail: string;
};

type ModeDetail = {
  label: string;
  kicker: string;
  engine: string;
  outbound: string;
  storage: string;
  accent: string;
  flow: FlowStep[];
};

const modes: Record<ProcessingMode, ModeDetail> = {
  local: {
    label: "Local model",
    kicker: "No network required",
    engine: "Whisper + local LLM",
    outbound: "0 requests",
    storage: "Encrypted local vault",
    accent: "OFFLINE",
    flow: [
      { number: "01", title: "Capture", detail: "Mic + system audio" },
      { number: "02", title: "Transcribe", detail: "Whisper on-device" },
      { number: "03", title: "Summarize", detail: "Local model" },
      { number: "04", title: "Store", detail: "Your encrypted vault" },
    ],
  },
  api: {
    label: "Your API",
    kicker: "Your key, your provider",
    engine: "Provider you configure",
    outbound: "2 scoped requests",
    storage: "Encrypted local vault",
    accent: "BYO KEY",
    flow: [
      { number: "01", title: "Capture", detail: "Audio stays local" },
      { number: "02", title: "Transcribe", detail: "Your STT endpoint" },
      { number: "03", title: "Summarize", detail: "Your LLM endpoint" },
      { number: "04", title: "Store", detail: "Local canonical copy" },
    ],
  },
  managed: {
    label: "Managed",
    kicker: "Convenience, explicitly enabled",
    engine: "Meeki managed models",
    outbound: "Audited + visible",
    storage: "User-set retention",
    accent: "OPT-IN",
    flow: [
      { number: "01", title: "Capture", detail: "Device audio" },
      { number: "02", title: "Process", detail: "Encrypted transit" },
      { number: "03", title: "Summarize", detail: "Managed inference" },
      { number: "04", title: "Return", detail: "Retention you set" },
    ],
  },
};

const demoTabs: Array<{ id: DemoTab; label: string }> = [
  { id: "notes", label: "Notes" },
  { id: "transcript", label: "Transcript" },
  { id: "flow", label: "Data flow" },
];

const processingCards = [
  {
    index: "01",
    title: "Local model",
    tag: "DEFAULT",
    copy: "Record, transcribe, summarize, and search without a network connection.",
    route: "device → device",
    detail: "Whisper / Ollama / MLX",
  },
  {
    index: "02",
    title: "Bring your own API",
    tag: "YOUR KEY",
    copy: "Point Meeki at the providers you already trust. Credentials stay on your machine.",
    route: "device → your provider",
    detail: "OpenAI-compatible endpoints",
  },
  {
    index: "03",
    title: "Self-hosted",
    tag: "YOUR CLOUD",
    copy: "Run the processing plane inside your own network and keep policy under your control.",
    route: "device → your network",
    detail: "Docker / private endpoint",
  },
  {
    index: "04",
    title: "Managed",
    tag: "OPT-IN",
    copy: "Choose a managed path when you want it, with visible egress and explicit retention.",
    route: "device → Meeki",
    detail: "Convenience without ambiguity",
  },
];

const securityControls = [
  {
    index: "SEC-01",
    title: "Local-first by default",
    copy: "The default route processes meeting audio on your device and makes zero network requests.",
    evidence: "runtime/processing/local",
  },
  {
    index: "SEC-02",
    title: "Every outbound call is legible",
    copy: "See the destination, purpose, payload class, and retention policy before enabling a connection.",
    evidence: "runtime/egress/manifest",
  },
  {
    index: "SEC-03",
    title: "Portable, user-owned data",
    copy: "Your canonical record lives in an exportable local database, not a closed document silo.",
    evidence: "storage/schema + exporters",
  },
  {
    index: "SEC-04",
    title: "No training on your meetings",
    copy: "Meeting content is never used to train Meeki models. Managed providers are contractually isolated.",
    evidence: "policy/model-training",
  },
];

function ProductDemo() {
  const [mode, setMode] = useState<ProcessingMode>("local");
  const [tab, setTab] = useState<DemoTab>("notes");
  const activeMode = modes[mode];

  return (
    <div className={styles.demoShell} aria-label="Interactive Meeki product demo">
      <div className={styles.demoTopbar}>
        <div className={styles.windowControls} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className={styles.runtimeTitle}>
          <span className={styles.runtimePulse} />
          MEEKI RUNTIME
        </div>
        <span className={styles.buildLabel}>build 0.8.4 / verified</span>
      </div>

      <div className={styles.modeBar}>
        <div>
          <span className={styles.microLabel}>PROCESSING ROUTE</span>
          <strong>{activeMode.kicker}</strong>
        </div>
        <div className={styles.modeToggle} aria-label="Processing mode">
          {(Object.keys(modes) as ProcessingMode[]).map((modeId) => (
            <button
              className={`${styles.modeButton} ${
                mode === modeId ? styles.modeButtonActive : ""
              }`}
              type="button"
              key={modeId}
              aria-pressed={mode === modeId}
              onClick={() => setMode(modeId)}
            >
              {modes[modeId].label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.meetingHeader}>
        <div>
          <span className={styles.microLabel}>ACTIVE MEETING</span>
          <h2>Product direction / weekly</h2>
          <p>14:02–14:34 · 4 participants · private</p>
        </div>
        <div className={styles.liveStatus}>
          <span className={styles.liveBars} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          TRANSCRIBING
        </div>
      </div>

      <div className={styles.demoTabs} role="tablist" aria-label="Meeting views">
        {demoTabs.map((demoTab) => (
          <button
            key={demoTab.id}
            id={`glassbox-tab-${demoTab.id}`}
            className={`${styles.demoTab} ${
              tab === demoTab.id ? styles.demoTabActive : ""
            }`}
            type="button"
            role="tab"
            aria-selected={tab === demoTab.id}
            aria-controls={`glassbox-panel-${demoTab.id}`}
            onClick={() => setTab(demoTab.id)}
          >
            {demoTab.label}
          </button>
        ))}
        <div className={styles.tabTelemetry}>
          <span>{activeMode.accent}</span>
          <span>EGRESS: {activeMode.outbound}</span>
        </div>
      </div>

      <div className={styles.demoBody}>
        <div className={styles.demoContent}>
          {tab === "notes" && (
            <div
              className={styles.notesPanel}
              role="tabpanel"
              id="glassbox-panel-notes"
              aria-labelledby="glassbox-tab-notes"
            >
              <section className={styles.rawNotes}>
                <div className={styles.panelHeading}>
                  <span>MY NOTES</span>
                  <span>editable</span>
                </div>
                <p>Need a clearer owner for the desktop beta.</p>
                <p>Ship export before adding more integrations.</p>
                <p>Security page should show the actual data path.</p>
                <span className={styles.noteCursor} aria-hidden="true" />
              </section>
              <section className={styles.enhancedNotes}>
                <div className={styles.panelHeading}>
                  <span>ENHANCED</span>
                  <span>{activeMode.engine}</span>
                </div>
                <h3>Decisions</h3>
                <ul>
                  <li>
                    Desktop beta ownership moves to <strong>Mira</strong> through
                    launch.
                  </li>
                  <li>
                    Portable export ships before the integration marketplace.
                  </li>
                </ul>
                <h3>Next actions</h3>
                <div className={styles.actionRow}>
                  <span className={styles.checkBox}>01</span>
                  <p>Publish the processing architecture with the beta.</p>
                  <span>THU</span>
                </div>
              </section>
            </div>
          )}

          {tab === "transcript" && (
            <div
              className={styles.transcriptPanel}
              role="tabpanel"
              id="glassbox-panel-transcript"
              aria-labelledby="glassbox-tab-transcript"
            >
              <div className={styles.transcriptLine}>
                <span className={styles.speakerYou}>YOU</span>
                <time>14:24:08</time>
                <p>
                  I want the security page to show the actual data path, not a
                  generic promise.
                </p>
              </div>
              <div className={styles.transcriptLine}>
                <span className={styles.speakerMira}>MIRA</span>
                <time>14:24:14</time>
                <p>
                  Agreed. We can expose the route for local, API, and managed
                  processing separately.
                </p>
              </div>
              <div className={styles.transcriptLine}>
                <span className={styles.speakerJon}>JON</span>
                <time>14:24:31</time>
                <p>
                  And the audit log should stay readable after the meeting ends.
                </p>
              </div>
              <div className={styles.redactionRow}>
                <span>PII FILTER</span>
                <p>
                  1 optional redaction detected · nothing removed automatically
                </p>
                <span>REVIEW</span>
              </div>
            </div>
          )}

          {tab === "flow" && (
            <div
              className={styles.flowPanel}
              role="tabpanel"
              id="glassbox-panel-flow"
              aria-labelledby="glassbox-tab-flow"
            >
              <div className={styles.flowRail}>
                {activeMode.flow.map((step, index) => (
                  <div className={styles.flowStep} key={step.number}>
                    <div className={styles.flowNode}>
                      <span>{step.number}</span>
                    </div>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                    {index < activeMode.flow.length - 1 && (
                      <span className={styles.flowConnector} aria-hidden="true">
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className={styles.flowManifest}>
                <div>
                  <span>INFERENCE</span>
                  <strong>{activeMode.engine}</strong>
                </div>
                <div>
                  <span>NETWORK</span>
                  <strong>{activeMode.outbound}</strong>
                </div>
                <div>
                  <span>CANONICAL STORE</span>
                  <strong>{activeMode.storage}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className={styles.auditLog} aria-label="Static processing audit log">
          <div className={styles.auditHeader}>
            <span>AUDIT LOG</span>
            <span>immutable session view</span>
          </div>
          <ol>
            <li>
              <time>14:02:11.082</time>
              <span className={styles.logOk}>ALLOW</span>
              <code>audio.capture</code>
            </li>
            <li>
              <time>14:02:11.109</time>
              <span className={styles.logOk}>OPEN</span>
              <code>vault/session_842</code>
            </li>
            <li>
              <time>14:02:12.004</time>
              <span className={styles.logBlock}>BLOCK</span>
              <code>network.unspecified</code>
            </li>
            <li>
              <time>14:34:06.771</time>
              <span className={styles.logOk}>WRITE</span>
              <code>transcript.sqlite</code>
            </li>
            <li>
              <time>14:34:08.013</time>
              <span className={styles.logOk}>SIGN</span>
              <code>summary.sha256</code>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}

export default function Glassbox() {
  return (
    <main className={styles.page} id="top">
      <nav className={styles.nav} aria-label="Primary navigation">
        <div className={styles.navInner}>
          <a className={styles.brand} href="#top" aria-label="Meeki Glassbox home">
            <span className={styles.brandMark} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>meeki</span>
            <span className={styles.edition}>GLASSBOX</span>
          </a>

          <div className={styles.navLinks}>
            <a href="#architecture">Architecture</a>
            <a href="#source">Open source</a>
            <a href="#security">Security</a>
          </div>

          <div className={styles.navActions}>
            <a
              className={styles.navGithub}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <a
              className={styles.navDownload}
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
            >
              Download
            </a>
          </div>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span>GLASSBOX PROTOCOL</span>
            <span>OPEN / AUDITABLE / LOCAL-FIRST</span>
          </div>
          <h1>
            Open-source meeting memory.
            <span>No black box.</span>
          </h1>
          <p className={styles.heroLead}>
            Meeki captures the conversation, improves the notes you write, and
            gives you a meeting memory you can actually inspect.
          </p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryButton}
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span>Download Meeki</span>
              <span aria-hidden="true">↓</span>
            </a>
            <a
              className={styles.secondaryButton}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span className={styles.codeGlyph} aria-hidden="true">
                &lt;/&gt;
              </span>
              View on GitHub
            </a>
          </div>
          <div className={styles.heroProof}>
            <span>
              <i className={styles.proofLight} /> MIT licensed
            </span>
            <span>
              <i className={styles.proofLight} /> Bot-free capture
            </span>
            <span>
              <i className={styles.proofLight} /> Your data path
            </span>
          </div>
        </div>

        <ProductDemo />
      </section>

      <section className={styles.signalStrip} aria-label="Meeki trust summary">
        <div>
          <span className={styles.signalValue}>0</span>
          <span className={styles.signalLabel}>required cloud services</span>
        </div>
        <div>
          <span className={styles.signalValue}>4</span>
          <span className={styles.signalLabel}>processing routes you control</span>
        </div>
        <div>
          <span className={styles.signalValue}>100%</span>
          <span className={styles.signalLabel}>source available under MIT</span>
        </div>
        <div className={styles.signalTrace}>
          <span className={styles.traceLine} aria-hidden="true" />
          <span>RUNTIME STATUS</span>
          <strong>NOMINAL</strong>
        </div>
      </section>

      <section className={styles.section} id="architecture">
        <div className={styles.sectionIntro}>
          <div className={styles.sectionCode}>01 / PROCESSING</div>
          <h2>Choose where intelligence happens.</h2>
          <p>
            Privacy is a routing decision. Meeki makes that route explicit for
            every meeting, from fully local to deliberately managed.
          </p>
        </div>

        <div className={styles.processingGrid}>
          {processingCards.map((card, index) => (
            <article
              className={`${styles.processingCard} ${
                index === 0 ? styles.processingCardFeatured : ""
              }`}
              key={card.title}
            >
              <div className={styles.cardTopline}>
                <span>{card.index}</span>
                <span>{card.tag}</span>
              </div>
              <div className={styles.processingIcon} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
              <dl>
                <div>
                  <dt>ROUTE</dt>
                  <dd>{card.route}</dd>
                </div>
                <div>
                  <dt>RUNTIME</dt>
                  <dd>{card.detail}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <div className={styles.manifestBar}>
          <span>MEETING MANIFEST</span>
          <code>
            route=local · egress=deny · store=encrypted · retention=forever
          </code>
          <span className={styles.manifestValid}>VALID</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sourceSection}`} id="source">
        <div className={styles.sourceCopy}>
          <div className={styles.sectionCode}>02 / OPEN SOURCE</div>
          <h2>Trust the code, not the copy.</h2>
          <p>
            Meeki is MIT licensed. Read how audio is captured, trace every
            network request, change the storage layer, or run your own build.
          </p>
          <ul className={styles.sourcePoints}>
            <li>
              <span>01</span>
              Inspect the complete capture-to-summary path.
            </li>
            <li>
              <span>02</span>
              Fork, self-host, and adapt it to your environment.
            </li>
            <li>
              <span>03</span>
              Keep notes portable with open, documented exports.
            </li>
          </ul>
          <a
            className={styles.sourceLink}
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            Explore the repository <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className={styles.terminal} aria-label="Clone Meeki from GitHub">
          <div className={styles.terminalHeader}>
            <span>meeki / main</span>
            <div aria-hidden="true">
              <i />
              <i />
            </div>
          </div>
          <div className={styles.terminalBody}>
            <p>
              <span>$</span> git clone https://github.com/inventivezee/meeki.git
            </p>
            <p>
              <span>$</span> cd meeki
            </p>
            <p>
              <span>$</span> pnpm install
            </p>
            <p>
              <span>$</span> pnpm tauri dev
            </p>
            <div className={styles.terminalResult}>
              <span>✓</span>
              <div>
                <strong>LOCAL RUNTIME READY</strong>
                <p>network policy: deny-by-default</p>
                <p>data directory: ./meeki-vault</p>
              </div>
            </div>
          </div>
          <div className={styles.licenseStamp}>
            <span>LICENSE</span>
            <strong>MIT</strong>
            <span>FORKABLE · COMMERCIAL · PERMISSIVE</span>
          </div>
        </div>
      </section>

      <section className={styles.securitySection} id="security">
        <div className={styles.sectionIntro}>
          <div className={styles.sectionCode}>03 / SECURITY PROOF</div>
          <h2>Claims with something behind them.</h2>
          <p>
            The product surfaces the same evidence a security reviewer needs:
            route, storage, egress, retention, and source.
          </p>
        </div>

        <div className={styles.securityLayout}>
          <div className={styles.controlList}>
            {securityControls.map((control) => (
              <article className={styles.controlRow} key={control.index}>
                <span className={styles.controlIndex}>{control.index}</span>
                <div>
                  <h3>{control.title}</h3>
                  <p>{control.copy}</p>
                </div>
                <code>{control.evidence}</code>
              </article>
            ))}
          </div>

          <aside className={styles.proofConsole}>
            <div className={styles.proofConsoleHeader}>
              <span>SESSION PROOF</span>
              <span className={styles.verifiedBadge}>VERIFIED</span>
            </div>
            <div className={styles.hashBlock}>
              <span>SESSION HASH</span>
              <code>4be2f1a0…90c8d7e4</code>
            </div>
            <div className={styles.proofTable}>
              <div>
                <span>Audio retained</span>
                <strong>NO</strong>
              </div>
              <div>
                <span>Network egress</span>
                <strong>0 B</strong>
              </div>
              <div>
                <span>Transcript store</span>
                <strong>LOCAL</strong>
              </div>
              <div>
                <span>Model training</span>
                <strong>NEVER</strong>
              </div>
              <div>
                <span>Delete control</span>
                <strong>USER</strong>
              </div>
            </div>
            <div className={styles.proofFooter}>
              <span className={styles.proofSeal} aria-hidden="true">
                M
              </span>
              <p>
                This record can be exported with every meeting for independent
                verification.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalGrid} aria-hidden="true" />
        <div className={styles.finalLabel}>READY WHEN YOU ARE / NO ACCOUNT REQUIRED</div>
        <h2>Your meetings deserve a memory you own.</h2>
        <p>
          Start locally. Connect only what you choose. Keep the code and the
          conversation in view.
        </p>
        <div className={styles.heroActions}>
          <a
            className={styles.primaryButton}
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
          >
            <span>Download latest release</span>
            <span aria-hidden="true">↓</span>
          </a>
          <a
            className={styles.secondaryButton}
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            Read the source
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <a className={styles.brand} href="#top" aria-label="Meeki home">
            <span className={styles.brandMark} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>meeki</span>
          </a>
          <p>Private meeting memory, in plain sight.</p>
        </div>
        <div className={styles.footerLinks}>
          <a href="#architecture">Architecture</a>
          <a href="#source">MIT license</a>
          <a href="#security">Security</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
        <div className={styles.footerMeta}>
          <span>© 2026 MEEKI CONTRIBUTORS</span>
          <span>OPEN SOURCE / MIT</span>
        </div>
      </footer>
    </main>
  );
}
