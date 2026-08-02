"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DOWNLOAD_URL, GITHUB_URL } from "./links";
import styles from "./NotekeeperLanding.module.css";

export type NotekeeperVariant = "private" | "personal";

type NoteTab = "summary" | "actions" | "transcript";

const tabs: { id: NoteTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "actions", label: "Actions" },
  { id: "transcript", label: "Transcript" },
];

const variantCopy = {
  private: {
    eyebrow: "Fully private in local mode · Fully open source, always",
    emphasis: "private",
    subhead:
      "Record, transcribe, and organize meetings on your device. Use local models, bring your own AI, or self-host the stack—you control every boundary.",
    primaryCta: "Download Meeki",
    previewLabel: "Local privacy boundary",
    previewNote: "Nothing leaves this device",
    sectionKicker: "PRIVATE BY CONSTRUCTION",
    sectionTitle: "A keeper, not a collector.",
    sectionBody:
      "Meeki remembers the useful parts of a meeting without turning your conversations into someone else’s data.",
    boundaryTitle: "Choose your boundary.",
    boundaryBody:
      "Local is the default. Every connection beyond your device is visible, deliberate, and yours to choose.",
    finalKicker: "KEEP THE MEETING. LOSE THE SURVEILLANCE.",
    finalTitle: "Your conversations belong with you.",
    finalBody:
      "Bring a fully private, open-source notekeeper to your next meeting.",
  },
  personal: {
    eyebrow: "Fully private by default · Fully open source, always",
    emphasis: "personal",
    subhead:
      "Meeki keeps your notes, decisions, and next steps organized while your conversations stay under your control. Run it locally, connect your own AI, or self-host it.",
    primaryCta: "Download your notekeeper",
    previewLabel: "My local notebook",
    previewNote: "Remembered on this device",
    sectionKicker: "YOUR MEETING MEMORY",
    sectionTitle: "Listens. Tidies. Remembers.",
    sectionBody:
      "Meeki turns the conversation into useful memory—clear notes, decisions, and next steps that still feel like yours.",
    boundaryTitle: "Friendly to you. Closed to everyone else.",
    boundaryBody:
      "Start fully local, then opt into only the services you trust. Your notekeeper follows your rules.",
    finalKicker: "YOUR NOTES. YOUR MEMORY. YOUR RULES.",
    finalTitle: "Bring Meeki to your next meeting.",
    finalBody:
      "A personal notekeeper that stays private and is built in the open.",
  },
} satisfies Record<NotekeeperVariant, Record<string, string>>;

const meetingNotes = {
  summary: {
    title: "The short version",
    body:
      "The team approved the private beta launch for Monday. Local mode stays the default, and eight design partners will receive onboarding details Thursday.",
  },
  actions: {
    title: "What happens next",
    body:
      "Maya sends onboarding details Thursday. Theo completes the deployment checklist. You confirm the Monday launch window.",
  },
  transcript: {
    title: "What was said",
    body:
      "Maya · 10:08 — The security review is complete. We can open the pilot Monday while keeping local mode as the default.",
  },
} satisfies Record<NoteTab, { title: string; body: string }>;

const boundaryModes = [
  {
    number: "01",
    name: "On your device",
    label: "Default",
    body: "Capture, transcription, AI, and storage can all run locally.",
  },
  {
    number: "02",
    name: "Bring your own AI",
    label: "Your keys",
    body: "Connect only the transcription or AI provider you already trust.",
  },
  {
    number: "03",
    name: "Self-hosted",
    label: "Your stack",
    body: "Deploy Meeki inside infrastructure controlled by your organization.",
  },
  {
    number: "04",
    name: "Managed",
    label: "Optional",
    body: "Choose a ready-to-use service when convenience matters most.",
  },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function BrandMark() {
  return (
    <span className={styles.brandMark} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export default function NotekeeperLanding({
  variant,
}: {
  variant: NotekeeperVariant;
}) {
  const copy = variantCopy[variant];
  const [activeTab, setActiveTab] = useState<NoteTab>("summary");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(42);

  useEffect(() => {
    if (!recording) return;

    const timer = window.setInterval(() => {
      setElapsed((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [recording]);

  const activeNote = meetingNotes[activeTab];

  return (
    <div className={`${styles.site} ${styles[variant]}`} data-variant={variant}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>

      <header className={styles.header}>
        <a className={styles.brand} href="#top" aria-label="Meeki home">
          <BrandMark />
          <span>meeki</span>
        </a>

        <nav className={styles.navLinks} aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#privacy">Privacy</a>
          <a href="#open-source">Open source</a>
        </nav>

        <div className={styles.headerActions}>
          <div className={styles.variantSwitch} aria-label="Website variations">
            <Link
              href="/"
              aria-current={variant === "private" ? "page" : undefined}
            >
              Private
            </Link>
            <Link
              href="/personal"
              aria-current={variant === "personal" ? "page" : undefined}
            >
              Personal
            </Link>
          </div>
          <a
            className={styles.navCta}
            href={DOWNLOAD_URL}
            target="_blank"
            rel="noreferrer"
          >
            Download <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} id="top">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span aria-hidden="true" />
              {copy.eyebrow}
            </div>

            <h1>
              Meeki is your <strong>{copy.emphasis}</strong> meeting{" "}
              <em>notekeeper.</em>
            </h1>

            <p className={styles.heroSubhead}>{copy.subhead}</p>
            <p className={styles.categoryLine}>
              An open-source, local-first meeting note-taker.
            </p>

            <div className={styles.heroActions}>
              <a
                className={styles.primaryButton}
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                {copy.primaryCta}
                <span aria-hidden="true">↓</span>
              </a>
              <a
                className={styles.secondaryButton}
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
              >
                Inspect the code
                <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className={styles.heroProof} aria-label="Meeki product principles">
              <span>Local by default</span>
              <span>Bring your own AI</span>
              <span>Self-hostable</span>
            </div>
          </div>

          <div className={styles.heroVisual} id="product">
            <div className={styles.mascot}>
              <div className={styles.mascotPortrait}>
                <Image
                  src="/meeki-rabbit-notekeeper-cutout.png"
                  alt="Meeki’s rabbit notekeeper holding a notepad"
                  fill
                  unoptimized
                  sizes="(max-width: 680px) 150px, 240px"
                  priority
                  style={{ objectFit: "contain", objectPosition: "center bottom" }}
                />
              </div>
            </div>

            <div className={styles.previewCard}>
              <div className={styles.previewTopbar}>
                <div className={styles.windowDots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span>meeki / launch review</span>
                <span className={styles.localPill}>
                  <i aria-hidden="true" /> Local
                </span>
              </div>

              <div className={styles.previewLayout}>
                <aside className={styles.previewSidebar} aria-label="Meeting list">
                  <span className={styles.sidebarTitle}>Today</span>
                  <button type="button" className={styles.activeMeeting}>
                    <span>10:00</span>
                    Launch review
                    <small>In progress</small>
                  </button>
                  <button type="button">
                    <span>14:30</span>
                    Customer debrief
                    <small>45 min</small>
                  </button>
                  <div className={styles.sidebarPrivacy}>
                    <i aria-hidden="true">✓</i>
                    {copy.previewLabel}
                  </div>
                </aside>

                <div className={styles.noteWorkspace}>
                  <div className={styles.meetingHeading}>
                    <div>
                      <span>Tuesday · 10:00 AM</span>
                      <h2>Launch review</h2>
                    </div>
                    <div className={styles.avatars} aria-label="Three participants">
                      <span>M</span>
                      <span>T</span>
                      <span>Y</span>
                    </div>
                  </div>

                  <div className={styles.recorder}>
                    <button
                      type="button"
                      className={`${styles.recordButton} ${
                        recording ? styles.recording : ""
                      }`}
                      aria-pressed={recording}
                      aria-label={recording ? "Stop sample recording" : "Start sample recording"}
                      onClick={() => setRecording((value) => !value)}
                    >
                      <span aria-hidden="true" />
                    </button>
                    <div>
                      <strong>{recording ? "Recording locally" : "Ready on this device"}</strong>
                      <span>{formatTime(elapsed)}</span>
                    </div>
                    <div
                      className={`${styles.waveform} ${recording ? styles.waveformActive : ""}`}
                      aria-hidden="true"
                    >
                      {Array.from({ length: 18 }, (_, index) => (
                        <i key={index} />
                      ))}
                    </div>
                  </div>

                  <div className={styles.tabs} role="tablist" aria-label="Meeting note views">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        id={`${variant}-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls={`${variant}-notes-panel`}
                        className={activeTab === tab.id ? styles.activeTab : ""}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div
                    className={styles.notePanel}
                    id={`${variant}-notes-panel`}
                    role="tabpanel"
                    aria-labelledby={`${variant}-tab-${activeTab}`}
                  >
                    <span>{activeNote.title}</span>
                    <p>{activeNote.body}</p>
                    {activeTab === "actions" && (
                      <div className={styles.actionTags}>
                        <span>M · Thursday</span>
                        <span>T · Friday</span>
                        <span>You · Monday</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.previewFooter}>
                    <span aria-hidden="true">◎</span>
                    {copy.previewNote}
                    <strong>Private mode</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.visualNote} aria-hidden="true">
              {variant === "private" ? "Your boundary stays visible." : "Your meeting, neatly kept."}
            </div>
          </div>
        </section>

        <section className={styles.proofBand} aria-label="Meeki trust proof">
          <div>
            <strong>0</strong>
            <span>No meeting bots</span>
            <small>Meeki listens through your device.</small>
          </div>
          <div>
            <strong>100%</strong>
            <span>Fully private local mode</span>
            <small>Capture, process, and store locally.</small>
          </div>
          <div>
            <strong>MIT</strong>
            <span>Fully open source</span>
            <small>Inspect, fork, and self-host the code.</small>
          </div>
        </section>

        <section className={styles.storySection} id="how-it-works">
          <div className={styles.sectionIntro}>
            <span>{copy.sectionKicker}</span>
            <h2>{copy.sectionTitle}</h2>
            <p>{copy.sectionBody}</p>
          </div>

          <div className={styles.processGrid}>
            <article>
              <span className={styles.cardNumber}>01</span>
              <div className={styles.captureIcon} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <h3>Listens without joining</h3>
              <p>Capture system audio without inviting a bot into the room.</p>
            </article>
            <article>
              <span className={styles.cardNumber}>02</span>
              <div className={styles.tidyIcon} aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <h3>Turns talk into signal</h3>
              <p>Find decisions, context, and next steps with the model you choose.</p>
            </article>
            <article>
              <span className={styles.cardNumber}>03</span>
              <div className={styles.keepIcon} aria-hidden="true">
                <span>✓</span>
              </div>
              <h3>Keeps it under your control</h3>
              <p>Search a private notebook whose storage and retention you decide.</p>
            </article>
          </div>
        </section>

        <section className={styles.boundarySection} id="privacy">
          <div className={styles.boundaryIntro}>
            <span>YOUR PRIVACY BOUNDARY</span>
            <h2>{copy.boundaryTitle}</h2>
            <p>{copy.boundaryBody}</p>
          </div>

          <div className={styles.boundaryGrid}>
            {boundaryModes.map((mode, index) => (
              <article key={mode.name} className={index === 0 ? styles.featuredMode : ""}>
                <div className={styles.modeTopline}>
                  <span>{mode.number}</span>
                  <small>{mode.label}</small>
                </div>
                <h3>{mode.name}</h3>
                <p>{mode.body}</p>
                <div className={styles.modeLine} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.openSourceSection} id="open-source">
          <div className={styles.openSourceCopy}>
            <span>BUILT IN THE OPEN</span>
            <h2>Trust should be inspectable.</h2>
            <p>
              Meeki is fully open source under the MIT license. Audit every
              boundary, run the entire stack yourself, or help make the
              notekeeper better for everyone.
            </p>
            <div className={styles.licenseStamp}>
              <strong>MIT</strong>
              <span>Use · copy · modify · distribute</span>
            </div>
            <a
              className={styles.lightButton}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              View Meeki on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className={styles.codeWindow} aria-label="Illustrative local-mode configuration">
            <div className={styles.codeTopbar}>
              <div className={styles.windowDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span>privacy.config.ts</span>
              <small>illustrative</small>
            </div>
            <pre>
              <code>
                <span>{"const"}</span>{" boundary = {\n"}
                {"  capture: "}<strong>{'"on-device"'}</strong>{",\n"}
                {"  model: "}<strong>{'"local"'}</strong>{",\n"}
                {"  storage: "}<strong>{'"yours"'}</strong>{",\n"}
                {"  cloud: "}<strong>{'"opt-in"'}</strong>{"\n};"}
              </code>
            </pre>
            <div className={styles.codeStatus}>
              <span><i /> Fully private local mode</span>
              <span>MIT licensed</span>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <span>{copy.finalKicker}</span>
          <h2>{copy.finalTitle}</h2>
          <p>{copy.finalBody}</p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryButton}
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
            >
              Download Meeki <span aria-hidden="true">↓</span>
            </a>
            <a
              className={styles.secondaryButton}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top" aria-label="Meeki home">
          <BrandMark />
          <span>meeki</span>
        </a>
        <p>Fully private in local mode. Fully open source, always.</p>
        <div>
          <a href="#privacy">Privacy</a>
          <a href="#open-source">MIT License</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
        <small>© {new Date().getFullYear()} Meeki</small>
      </footer>
    </div>
  );
}
