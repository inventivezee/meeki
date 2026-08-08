"use client";

import { useEffect, useState } from "react";

import { DOWNLOAD_URL, GITHUB_URL } from "./links";
import styles from "./MeekiLanding.module.css";

type DemoTab = "notes" | "enhanced" | "transcript";

const tabs: { id: DemoTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "enhanced", label: "Enhanced" },
  { id: "transcript", label: "Transcript" },
];

const waveBars = Array.from({ length: 34 }, (_, index) => index);

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function MeekiLanding() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<DemoTab>("notes");
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsed((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  const toggleRecording = () => {
    setIsRecording((current) => !current);
  };

  return (
    <div className={styles.site}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>

      <nav className={styles.nav} aria-label="Primary navigation">
        <a className={styles.brand} href="#top" aria-label="Meeki home">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>meeki</span>
        </a>

        <div className={styles.navLinks}>
          <a href="#privacy">Privacy</a>
          <a href="#how-it-works">How it works</a>
          <a href="#open-source">Open source</a>
        </div>

        <a
          className={styles.navCta}
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
        >
          Download
          <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} id="top">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              <span className={styles.statusDot} aria-hidden="true" />
              Open source · MIT licensed
            </div>
            <h1>
              Your meetings
              <br />
              should stay <em>yours.</em>
            </h1>
            <p className={styles.heroSubhead}>
              The private meeting note-taker for founders, product teams, and
              privacy-sensitive organizations—local by default, with control
              over every AI and storage boundary.
            </p>
            <div className={styles.heroActions}>
              <a
                className={styles.primaryButton}
                href={DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
              >
                Download Meeki
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
            <div className={styles.heroFootnote}>
              <span>Local by default</span>
              <span>Bring your own AI</span>
              <span>Self-host or use managed</span>
            </div>
          </div>

          <div className={styles.demoWrap}>
            <div className={styles.paperCorner} aria-hidden="true" />
            <div
              className={styles.demo}
              aria-label="Interactive Meeki product preview"
            >
              <div className={styles.demoTopbar}>
                <div className={styles.windowDots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles.demoTitle}>meeki / my notebook</span>
                <span className={styles.moreButton} aria-hidden="true">
                  ···
                </span>
              </div>

              <div className={styles.demoBody}>
                <aside className={styles.demoSidebar}>
                  <div className={styles.sidebarLabel}>Today</div>
                  <div className={styles.meetingItemActive}>
                    <span className={styles.meetingTime}>10:00</span>
                    <span>
                      Launch review
                      <small>In progress</small>
                    </span>
                  </div>
                  <div className={styles.meetingItem}>
                    <span className={styles.meetingTime}>14:30</span>
                    <span>
                      Customer debrief
                      <small>45 min</small>
                    </span>
                  </div>
                  <div className={styles.sidebarRule} />
                  <div className={styles.localBadge}>
                    <span aria-hidden="true">●</span>
                    Local notebook
                  </div>
                </aside>

                <div className={styles.notebook}>
                  <div className={styles.meetingHeading}>
                    <div>
                      <span className={styles.dateLine}>Tuesday, 26 July</span>
                      <h2>Launch review</h2>
                    </div>
                    <div
                      className={styles.avatars}
                      aria-label="Meeting participants"
                    >
                      <span title="Maya">M</span>
                      <span title="Theo">T</span>
                      <span title="You">Y</span>
                    </div>
                  </div>

                  <div className={styles.recorder}>
                    <button
                      className={`${styles.recordButton} ${
                        isRecording ? styles.recordButtonActive : ""
                      }`}
                      type="button"
                      onClick={toggleRecording}
                      aria-pressed={isRecording}
                      aria-label={
                        isRecording
                          ? "Stop sample recording"
                          : "Start sample recording"
                      }
                    >
                      <span aria-hidden="true" />
                    </button>
                    <div className={styles.recorderInfo}>
                      <span className={styles.recorderStatus} role="status">
                        {isRecording
                          ? "Recording on this device"
                          : "Ready to record"}
                      </span>
                      <span className={styles.timer}>
                        {formatTime(elapsed)}
                      </span>
                    </div>
                    <div
                      className={`${styles.waveform} ${
                        isRecording ? styles.waveformActive : ""
                      }`}
                      aria-hidden="true"
                    >
                      {waveBars.map((bar) => (
                        <span key={bar} />
                      ))}
                    </div>
                    <button
                      className={styles.recordTextButton}
                      type="button"
                      onClick={toggleRecording}
                    >
                      {isRecording ? "Stop" : elapsed > 0 ? "Resume" : "Start"}
                    </button>
                  </div>

                  <div
                    className={styles.tabs}
                    role="tablist"
                    aria-label="Meeting note views"
                  >
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        id={`private-notebook-tab-${tab.id}`}
                        className={activeTab === tab.id ? styles.activeTab : ""}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls="private-notebook-panel"
                        onClick={() => setActiveTab(tab.id)}
                      >
                        {tab.label}
                        {tab.id === "enhanced" && (
                          <span className={styles.sparkle} aria-hidden="true">
                            ✦
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div
                    className={styles.notePanel}
                    id="private-notebook-panel"
                    role="tabpanel"
                    aria-labelledby={`private-notebook-tab-${activeTab}`}
                  >
                    {activeTab === "notes" && (
                      <div className={styles.rawNotes}>
                        <p>Northstar security review — approved</p>
                        <p>Managed pilot opens Monday · 8 teams</p>
                        <p>Keep local mode as the default</p>
                        <p>Maya to send the onboarding plan Thursday</p>
                        {isRecording && (
                          <p className={styles.liveNote}>
                            <span aria-hidden="true" />
                            Listening for the next thought…
                          </p>
                        )}
                      </div>
                    )}

                    {activeTab === "enhanced" && (
                      <div className={styles.enhancedNotes}>
                        <div className={styles.summaryBlock}>
                          <span>Summary</span>
                          <p>
                            The Northstar review is complete. The team will open
                            the managed pilot to eight design partners on Monday
                            while keeping local mode as the default.
                          </p>
                        </div>
                        <div className={styles.noteColumns}>
                          <div>
                            <h3>Decisions</h3>
                            <ul>
                              <li>Open the managed pilot on Monday</li>
                              <li>Keep local mode as the default path</li>
                            </ul>
                          </div>
                          <div>
                            <h3>Actions</h3>
                            <ul>
                              <li>
                                <span className={styles.personTag}>T</span>
                                Finalize deployment checklist
                              </li>
                              <li>
                                <span className={styles.personTag}>M</span>
                                Send partner onboarding plan
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {activeTab === "transcript" && (
                      <div className={styles.transcript}>
                        <div>
                          <span className={styles.speaker}>Maya</span>
                          <span className={styles.transcriptTime}>10:08</span>
                          <p>
                            Northstar signed off on the security review. We can
                            open the pilot to all eight design partners Monday.
                          </p>
                        </div>
                        <div>
                          <span className={styles.speaker}>Theo</span>
                          <span className={styles.transcriptTime}>10:09</span>
                          <p>
                            I&apos;ll finalize the deployment checklist. Local
                            mode stays the default, and managed remains opt-in.
                          </p>
                        </div>
                        {isRecording && (
                          <div className={styles.transcribingLine}>
                            <span aria-hidden="true" />
                            Transcribing locally…
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={styles.demoPrivacyBar}>
                    <span className={styles.shield} aria-hidden="true">
                      ✓
                    </span>
                    Local mode · audio stays on this device
                    <button
                      type="button"
                      aria-expanded={showPrivacyDetails}
                      aria-controls="local-processing-details"
                      onClick={() =>
                        setShowPrivacyDetails((current) => !current)
                      }
                    >
                      {showPrivacyDetails ? "Hide" : "Details"}
                    </button>
                    {showPrivacyDetails && (
                      <span
                        className={styles.privacyDetails}
                        id="local-processing-details"
                      >
                        Capture, transcription, AI, and storage run locally in
                        this mode.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.pencilNote} aria-hidden="true">
              <span>Private by design</span>
              <span className={styles.noteArrow}>↗</span>
            </div>
          </div>
        </section>

        <section
          className={styles.proofStrip}
          id="privacy"
          aria-labelledby="proof-heading"
        >
          <h2 id="proof-heading" className={styles.visuallyHidden}>
            Meeki privacy principles
          </h2>
          <div className={styles.proofItem}>
            <strong>0</strong>
            <span>
              bots invited
              <small>Meeki listens from your device</small>
            </span>
          </div>
          <div className={styles.proofItem}>
            <strong>1</strong>
            <span>
              owner: you
              <small>Your notes, your retention rules</small>
            </span>
          </div>
          <div className={styles.proofItem}>
            <strong>MIT</strong>
            <span>
              inspectable
              <small>Code you can audit and fork</small>
            </span>
          </div>
        </section>

        <section className={styles.flowSection} id="how-it-works">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionNumber}>01 / HOW IT WORKS</span>
            <h2>
              Your conversation.
              <br />A clear path to notes.
            </h2>
            <p>
              No mystery pipeline. Meeki makes every boundary visible and leaves
              the important choices in your hands.
            </p>
          </div>

          <div className={styles.flowGrid}>
            <article className={styles.flowCard}>
              <span className={styles.flowStep}>01</span>
              <div className={styles.flowIcon} aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <h3>Capture</h3>
              <p>Listen through your computer. No bot joins the call.</p>
              <span className={styles.flowTag}>System audio</span>
            </article>
            <article className={styles.flowCard}>
              <span className={styles.flowStep}>02</span>
              <div className={styles.processingIcon} aria-hidden="true">
                <span>m</span>
              </div>
              <h3>Understand</h3>
              <p>Use a local model, your provider, or your own deployment.</p>
              <span className={styles.flowTag}>Your choice</span>
            </article>
            <article className={styles.flowCard}>
              <span className={styles.flowStep}>03</span>
              <div className={styles.notebookIcon} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h3>Remember</h3>
              <p>Keep searchable notes in a notebook you control.</p>
              <span className={styles.flowTag}>Private storage</span>
            </article>
          </div>
        </section>

        <section className={styles.boundarySection}>
          <div className={styles.boundaryHeading}>
            <span className={styles.sectionNumber}>02 / YOUR BOUNDARY</span>
            <h2>
              Private isn&apos;t
              <br />
              one-size-fits-all.
            </h2>
          </div>

          <div className={styles.boundaryOptions}>
            <article className={styles.featuredOption}>
              <div className={styles.optionTopline}>
                <span>Local</span>
                <small>Default</small>
              </div>
              <h3>Never leave your desk.</h3>
              <p>
                Run capture, models, and storage locally. Your meeting memory
                stays on your computer.
              </p>
              <div className={styles.optionDiagram} aria-hidden="true">
                <span>Your device</span>
                <i>↻</i>
                <span>Your notes</span>
              </div>
            </article>

            <article>
              <div className={styles.optionTopline}>
                <span>Bring your own AI</span>
                <small>Your provider</small>
              </div>
              <h3>Your keys, your choice.</h3>
              <p>
                Connect the cloud transcription or AI provider you already
                trust. You decide which service receives meeting data.
              </p>
              <div className={styles.optionDiagram} aria-hidden="true">
                <span>Your device</span>
                <i>↔</i>
                <span>Your AI</span>
              </div>
            </article>

            <article>
              <div className={styles.optionTopline}>
                <span>Self-hosted</span>
                <small>Full control</small>
              </div>
              <h3>Your stack, your rules.</h3>
              <p>
                Deploy Meeki inside your own infrastructure and connect the
                models your team already trusts.
              </p>
              <div className={styles.optionDiagram} aria-hidden="true">
                <span>Your cloud</span>
                <i>↔</i>
                <span>Your team</span>
              </div>
            </article>

            <article>
              <div className={styles.optionTopline}>
                <span>Managed</span>
                <small>Optional</small>
              </div>
              <h3>Convenience when you want it.</h3>
              <p>
                Opt into Meeki-managed transcription and AI when your team wants
                a ready-to-use service instead of running the stack.
              </p>
              <div className={styles.optionDiagram} aria-hidden="true">
                <span>Your device</span>
                <i>→</i>
                <span>Meeki managed</span>
              </div>
            </article>
          </div>
        </section>

        <section className={styles.openSourceSection} id="open-source">
          <div className={styles.openSourceCopy}>
            <span className={styles.sectionNumber}>03 / OPEN SOURCE</span>
            <h2>
              Trust is better
              <br />
              when it&apos;s verifiable.
            </h2>
            <p>
              Meeki&apos;s codebase is open source under the MIT license. Read
              it, run it yourself, improve it, or build something entirely new.
            </p>
            <div className={styles.licenseRow}>
              <span>MIT</span>
              <p>
                Use, copy, modify, merge,
                <br />
                publish, and distribute.
              </p>
            </div>
            <a
              className={styles.darkButton}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              Explore the repository
              <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div
            className={styles.codeCard}
            aria-label="Illustrative Meeki local-mode settings"
          >
            <div className={styles.codeCardHeader}>
              <div className={styles.windowDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span>Local mode · example</span>
              <span className={styles.publicLabel}>illustrative</span>
            </div>
            <pre>
              <code>
                <span className={styles.codeMuted}>
                  {"// An illustrative privacy profile."}
                </span>
                {"\n"}
                <span className={styles.codePurple}>const</span>
                {" privacy = {\n"}
                {"  processing: "}
                <span className={styles.codeGreen}>&quot;on-device&quot;</span>
                {",\n"}
                {"  model: "}
                <span className={styles.codeGreen}>&quot;local&quot;</span>
                {",\n"}
                {"  storage: "}
                <span className={styles.codeGreen}>
                  &quot;your-device&quot;
                </span>
                {"\n};"}
              </code>
            </pre>
            <div className={styles.codeFooter}>
              <span>Built in the open</span>
              <span>MIT License</span>
            </div>
          </div>
        </section>

        <section className={styles.finalCta}>
          <div className={styles.ctaScribble} aria-hidden="true">
            yours, truly.
          </div>
          <span className={styles.sectionNumber}>THE PRIVATE NOTEBOOK</span>
          <h2>
            Remember more.
            <br />
            Reveal less.
          </h2>
          <p>
            Download Meeki and keep your next conversation where it belongs.
          </p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryButton}
              href={DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
            >
              Download Meeki
              <span aria-hidden="true">↓</span>
            </a>
            <a
              className={styles.secondaryButton}
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <a className={styles.brand} href="#top" aria-label="Meeki home">
          <span className={styles.brandMark} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>meeki</span>
        </a>
        <p>Private meeting notes, made in the open.</p>
        <div className={styles.footerLinks}>
          <a href="#privacy">Privacy</a>
          <a href="#open-source">MIT License</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
        <span className={styles.copyright}>
          © {new Date().getFullYear()} Meeki
        </span>
      </footer>
    </div>
  );
}
