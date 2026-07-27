"use client";

import { useEffect, useState } from "react";
import styles from "./PrivateNotebook.module.css";

const DOWNLOAD_URL = "https://github.com/inventivezee/meeki/releases/latest";
const GITHUB_URL = "https://github.com/inventivezee/meeki";

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

export default function PrivateNotebook() {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState<DemoTab>("notes");

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
    <main className={styles.site}>
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

      <div id="main-content">
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
              Meeki is the private meeting notebook that turns conversation
              into clear, useful notes—without giving up ownership of your
              memory.
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
              <span>No meeting bot</span>
              <span>No hidden training</span>
              <span>Your choice of AI</span>
            </div>
          </div>

          <div className={styles.demoWrap}>
            <div className={styles.paperCorner} aria-hidden="true" />
            <div className={styles.demo} aria-label="Interactive Meeki product preview">
              <div className={styles.demoTopbar}>
                <div className={styles.windowDots} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <span className={styles.demoTitle}>meeki / my notebook</span>
                <button className={styles.moreButton} type="button" aria-label="More options">
                  ···
                </button>
              </div>

              <div className={styles.demoBody}>
                <aside className={styles.demoSidebar}>
                  <div className={styles.sidebarLabel}>Today</div>
                  <button className={styles.meetingItemActive} type="button">
                    <span className={styles.meetingTime}>10:00</span>
                    <span>
                      Product check-in
                      <small>In progress</small>
                    </span>
                  </button>
                  <button className={styles.meetingItem} type="button">
                    <span className={styles.meetingTime}>14:30</span>
                    <span>
                      Design review
                      <small>45 min</small>
                    </span>
                  </button>
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
                      <h2>Product check-in</h2>
                    </div>
                    <div className={styles.avatars} aria-label="Meeting participants">
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
                      aria-label={isRecording ? "Stop sample recording" : "Start sample recording"}
                    >
                      <span aria-hidden="true" />
                    </button>
                    <div className={styles.recorderInfo}>
                      <span className={styles.recorderStatus} role="status">
                        {isRecording ? "Recording on this device" : "Ready to record"}
                      </span>
                      <span className={styles.timer}>{formatTime(elapsed)}</span>
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

                  <div className={styles.tabs} role="tablist" aria-label="Meeting note views">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        id={`private-notebook-tab-${tab.id}`}
                        className={activeTab === tab.id ? styles.activeTab : ""}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.id}
                        aria-controls={`private-notebook-panel-${tab.id}`}
                        tabIndex={activeTab === tab.id ? 0 : -1}
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
                    id={`private-notebook-panel-${activeTab}`}
                    role="tabpanel"
                    aria-labelledby={`private-notebook-tab-${activeTab}`}
                  >
                    {activeTab === "notes" && (
                      <div className={styles.rawNotes}>
                        <p>Launch plan — keep the first release small</p>
                        <p>Desktop first, mobile later?</p>
                        <p>Need privacy FAQ before beta</p>
                        <p>Theo to test the local model build</p>
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
                            The team agreed to keep the beta focused on a
                            private, desktop-first experience before expanding
                            to mobile.
                          </p>
                        </div>
                        <div className={styles.noteColumns}>
                          <div>
                            <h3>Decisions</h3>
                            <ul>
                              <li>Ship the smallest useful beta</li>
                              <li>Prioritize desktop and local processing</li>
                            </ul>
                          </div>
                          <div>
                            <h3>Actions</h3>
                            <ul>
                              <li>
                                <span className={styles.personTag}>T</span>
                                Test local model build
                              </li>
                              <li>
                                <span className={styles.personTag}>M</span>
                                Draft privacy FAQ
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
                            I&apos;d rather make the first release small and
                            genuinely private than add every integration.
                          </p>
                        </div>
                        <div>
                          <span className={styles.speaker}>Theo</span>
                          <span className={styles.transcriptTime}>10:09</span>
                          <p>
                            Agreed. I&apos;ll test the local model build this
                            afternoon and document what works.
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
                    Audio stays on this device
                    <button type="button" aria-label="Learn about local processing">
                      How?
                    </button>
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

        <section className={styles.proofStrip} id="privacy" aria-labelledby="proof-heading">
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
            <strong>100%</strong>
            <span>
              inspectable
              <small>Every line is open source</small>
            </span>
          </div>
        </section>

        <section className={styles.flowSection} id="how-it-works">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionNumber}>01 / HOW IT WORKS</span>
            <h2>Your conversation.<br />A clear path to notes.</h2>
            <p>
              No mystery pipeline. Meeki makes every boundary visible and
              leaves the important choices in your hands.
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
            <h2>Private isn&apos;t<br />one-size-fits-all.</h2>
          </div>

          <div className={styles.boundaryOptions}>
            <article>
              <div className={styles.optionTopline}>
                <span>Managed</span>
                <small>Easy start</small>
              </div>
              <h3>Ready when you are.</h3>
              <p>
                Use Meeki&apos;s managed service with clear controls for model
                providers, sync, and retention.
              </p>
              <div className={styles.optionDiagram} aria-hidden="true">
                <span>Your device</span>
                <i>→</i>
                <span>Meeki</span>
              </div>
            </article>

            <article className={styles.featuredOption}>
              <div className={styles.optionTopline}>
                <span>Local</span>
                <small>Most private</small>
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
          </div>
        </section>

        <section className={styles.openSourceSection} id="open-source">
          <div className={styles.openSourceCopy}>
            <span className={styles.sectionNumber}>03 / OPEN SOURCE</span>
            <h2>Trust is better<br />when it&apos;s verifiable.</h2>
            <p>
              Meeki is free and open source under the MIT license. Read the
              code, run it yourself, improve it, or build something entirely
              new.
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

          <div className={styles.codeCard} aria-label="Example Meeki configuration">
            <div className={styles.codeCardHeader}>
              <div className={styles.windowDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <span>meeki.config.ts</span>
              <span className={styles.publicLabel}>public</span>
            </div>
            <pre>
              <code>
                <span className={styles.codeMuted}>{"// Your meeting memory, your rules."}</span>
                {"\n"}
                <span className={styles.codePurple}>export default</span>
                {" defineConfig({\n"}
                {"  capture: "}
                <span className={styles.codeGreen}>&quot;local&quot;</span>
                {",\n"}
                {"  model: "}
                <span className={styles.codeGreen}>&quot;ollama/llama3&quot;</span>
                {",\n"}
                {"  storage: {\n"}
                {"    encrypted: "}
                <span className={styles.codePurple}>true</span>
                {",\n"}
                {"    retention: "}
                <span className={styles.codeGreen}>&quot;30d&quot;</span>
                {"\n  }\n});"}
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
          <h2>Remember more.<br />Reveal less.</h2>
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
      </div>

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
        <span className={styles.copyright}>© {new Date().getFullYear()} Meeki</span>
      </footer>
    </main>
  );
}
