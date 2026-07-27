"use client";

import { useState } from "react";
import styles from "./QuietCompanion.module.css";

type DemoTab = "notes" | "enhanced" | "transcript";

const meetings = [
  {
    id: "product-direction",
    time: "9:30",
    period: "AM",
    title: "Product direction",
    meta: "42 min · Maya, Theo + 2",
    label: "Product",
    color: "blue",
    noteDate: "Today, 9:30 AM",
    notes: [
      "Keep the first-run experience focused on one clear job.",
      "The trust story should be visible before sign-in.",
      "Maya to pressure-test the new onboarding with three teams.",
    ],
    enhanced: [
      {
        eyebrow: "Decision",
        title: "Lead with the private default",
        body: "The team agreed that local processing belongs in the product experience—not buried in security documentation.",
      },
      {
        eyebrow: "Next move",
        title: "Test one calm onboarding path",
        body: "Maya will run three founder-led sessions by Friday. Theo will prepare the instrumented build.",
      },
      {
        eyebrow: "Open question",
        title: "How much choice is useful on day one?",
        body: "Explore progressive disclosure for BYO AI and self-hosted options after the first meeting.",
      },
    ],
    transcript: [
      {
        time: "09:34",
        speaker: "Maya",
        words:
          "If privacy is our default, people should feel it before they need to read about it.",
      },
      {
        time: "09:36",
        speaker: "Theo",
        words:
          "Agreed. The first meeting should work locally, and the advanced choices can wait.",
      },
      {
        time: "09:41",
        speaker: "You",
        words:
          "Let’s keep the test narrow: one job, one path, three teams, then learn.",
      },
    ],
  },
  {
    id: "customer-research",
    time: "1:15",
    period: "PM",
    title: "Customer research",
    meta: "31 min · Lina + 1",
    label: "Research",
    color: "apricot",
    noteDate: "Today, 1:15 PM",
    notes: [
      "Teams are copying decisions out of long call transcripts.",
      "Security review happens before a pilot can begin.",
      "A clear self-hosted path would unblock the healthcare group.",
    ],
    enhanced: [
      {
        eyebrow: "Signal",
        title: "Teams want the answer, not the archive",
        body: "Participants care most about decisions, owners, and evidence—not a wall of automatically generated prose.",
      },
      {
        eyebrow: "Friction",
        title: "Privacy review begins too late",
        body: "Buyers need deployment and retention controls before they can confidently start a pilot.",
      },
      {
        eyebrow: "Opportunity",
        title: "Make self-hosting easy to evaluate",
        body: "A concise architecture view and deployable package could unblock privacy-sensitive teams.",
      },
    ],
    transcript: [
      {
        time: "13:18",
        speaker: "Lina",
        words:
          "We don’t need more transcript. We need to know what changed and who owns the next step.",
      },
      {
        time: "13:22",
        speaker: "Sam",
        words:
          "Our security team asks where audio goes before anyone asks what the notes look like.",
      },
      {
        time: "13:31",
        speaker: "You",
        words:
          "So the privacy boundary is part of the buying experience, not a footnote.",
      },
    ],
  },
  {
    id: "founder-sync",
    time: "4:00",
    period: "PM",
    title: "Founder sync",
    meta: "24 min · Just us",
    label: "Private",
    color: "navy",
    noteDate: "Today, 4:00 PM",
    notes: [
      "Protect two mornings a week for product work.",
      "Move the partner conversation to next Tuesday.",
      "Share the hiring scorecard, not the raw discussion.",
    ],
    enhanced: [
      {
        eyebrow: "Commitment",
        title: "Protect the maker schedule",
        body: "Tuesday and Thursday mornings stay meeting-free for the next four weeks.",
      },
      {
        eyebrow: "Decision",
        title: "Give the partnership more room",
        body: "Move the next conversation to Tuesday after the revised proposal is ready.",
      },
      {
        eyebrow: "Private context",
        title: "Keep the discussion on this device",
        body: "Only the finalized hiring scorecard will be shared outside the founder pair.",
      },
    ],
    transcript: [
      {
        time: "16:03",
        speaker: "Alex",
        words:
          "We’re spending our best thinking hours talking about the work instead of doing it.",
      },
      {
        time: "16:07",
        speaker: "You",
        words:
          "Let’s protect two mornings and treat them like customer commitments.",
      },
      {
        time: "16:19",
        speaker: "Alex",
        words:
          "For hiring, share the scorecard. The candid discussion stays with us.",
      },
    ],
  },
] as const;

const tabs: { id: DemoTab; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "enhanced", label: "Enhanced" },
  { id: "transcript", label: "Transcript" },
];

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? styles.wordmarkCompact : styles.wordmark}>
      <span className={styles.logoMark} aria-hidden="true">
        <span />
        <span />
      </span>
      <span>meeki</span>
    </span>
  );
}

export default function QuietCompanion() {
  const [meetingId, setMeetingId] =
    useState<(typeof meetings)[number]["id"]>(meetings[0].id);
  const [activeTab, setActiveTab] = useState<DemoTab>("notes");
  const [tidied, setTidied] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [autoDelete, setAutoDelete] = useState(true);

  const activeMeeting =
    meetings.find((meeting) => meeting.id === meetingId) ?? meetings[0];

  const chooseMeeting = (id: (typeof meetings)[number]["id"]) => {
    setMeetingId(id);
    setActiveTab("notes");
    setTidied(false);
  };

  const tidyNotes = () => {
    setTidied(true);
    setActiveTab("enhanced");
  };

  return (
    <main className={styles.page}>
      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Main navigation">
          <a className={styles.logoLink} href="#top" aria-label="Meeki home">
            <Wordmark />
          </a>

          <div className={styles.navLinks}>
            <a href="#demo">See it work</a>
            <a href="#teams">For teams</a>
            <a href="#privacy">Privacy</a>
            <a href="#open-source">Open source</a>
          </div>

          <div className={styles.navActions}>
            <a
              className={styles.ghostNavLink}
              href="https://github.com/inventivezee/meeki"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className={styles.navDownload}
              href="https://github.com/inventivezee/meeki/releases/latest"
            >
              Download
            </a>
          </div>
        </nav>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span>03</span>
            The Quiet Companion
          </p>
          <h1>
            Stay present.
            <br />
            <em>Keep what matters.</em>
          </h1>
          <p className={styles.heroDescription}>
            Meeki is the private meeting note-taker for conversations that
            matter. It listens quietly, works locally, and turns the meeting
            into a useful memory you own.
          </p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryButton}
              href="https://github.com/inventivezee/meeki/releases/latest"
            >
              <span>Download Meeki</span>
              <span aria-hidden="true">↓</span>
            </a>
            <a
              className={styles.secondaryButton}
              href="https://github.com/inventivezee/meeki"
              target="_blank"
              rel="noreferrer"
            >
              View on GitHub
              <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className={styles.heroFootnote}>
            <span className={styles.localPulse} aria-hidden="true" />
            Local by default
            <span aria-hidden="true">·</span>
            MIT licensed
            <span aria-hidden="true">·</span>
            No meeting bot
          </div>
        </div>

        <div className={styles.heroAside} aria-hidden="true">
          <div className={styles.companionCard}>
            <span className={styles.companionOrb}>
              <span />
              <span />
            </span>
            <p>Nothing leaves this device</p>
            <span>Listening locally · 18:42</span>
          </div>
          <p className={styles.marginNote}>
            The best meeting software knows when to disappear.
          </p>
        </div>
      </section>

      <section className={styles.demoSection} id="demo">
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.kicker}>A calmer meeting memory</p>
            <h2>Write a little. Remember a lot.</h2>
          </div>
          <p>
            Begin with your own rough notes. Meeki keeps them beside the
            transcript and turns them into clear decisions when you ask.
          </p>
        </div>

        <div className={styles.demoShell}>
          <div className={styles.windowBar}>
            <div className={styles.windowDots} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span className={styles.windowTitle}>Meeki · Today</span>
            <button
              className={styles.privacyButton}
              type="button"
              aria-expanded={privacyOpen}
              aria-controls="quiet-privacy-panel"
              onClick={() => setPrivacyOpen((open) => !open)}
            >
              <span className={styles.privacyIndicator} aria-hidden="true" />
              Private · On-device
              <span aria-hidden="true">{privacyOpen ? "↑" : "↓"}</span>
            </button>
          </div>

          <div className={styles.demoBody}>
            <aside className={styles.demoSidebar}>
              <div className={styles.demoBrand}>
                <Wordmark compact />
                <button type="button" aria-label="Create a new meeting note">
                  +
                </button>
              </div>

              <div className={styles.todayHeading}>
                <span>Today</span>
                <span>3 meetings</span>
              </div>

              <div
                className={styles.meetingTimeline}
                aria-label="Choose a sample meeting"
              >
                {meetings.map((meeting) => (
                  <button
                    className={`${styles.meetingButton} ${
                      meeting.id === activeMeeting.id
                        ? styles.meetingButtonActive
                        : ""
                    }`}
                    type="button"
                    key={meeting.id}
                    aria-pressed={meeting.id === activeMeeting.id}
                    onClick={() => chooseMeeting(meeting.id)}
                  >
                    <span className={styles.meetingTime}>
                      {meeting.time}
                      <small>{meeting.period}</small>
                    </span>
                    <span
                      className={`${styles.timelineDot} ${
                        styles[`dot${meeting.color}`]
                      }`}
                      aria-hidden="true"
                    />
                    <span className={styles.meetingInfo}>
                      <strong>{meeting.title}</strong>
                      <small>{meeting.meta}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className={styles.sidebarStatus}>
                <span className={styles.statusIcon} aria-hidden="true">
                  M
                </span>
                <span>
                  <strong>Local workspace</strong>
                  <small>All notes on this device</small>
                </span>
              </div>
            </aside>

            <div className={styles.workspace}>
              <header className={styles.meetingHeader}>
                <div>
                  <div className={styles.meetingMeta}>
                    <span>{activeMeeting.noteDate}</span>
                    <span>•</span>
                    <span>{activeMeeting.label}</span>
                  </div>
                  <h3>{activeMeeting.title}</h3>
                </div>
                <button
                  className={`${styles.tidyButton} ${
                    tidied ? styles.tidyButtonDone : ""
                  }`}
                  type="button"
                  onClick={tidyNotes}
                >
                  <span aria-hidden="true">{tidied ? "✓" : "✦"}</span>
                  {tidied ? "Tidied on-device" : "Tidy privately"}
                </button>
              </header>

              <div className={styles.tabRow} role="tablist" aria-label="Note view">
                {tabs.map((tab) => (
                  <button
                    id={`quiet-tab-${tab.id}`}
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    aria-controls={`quiet-panel-${tab.id}`}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                    className={activeTab === tab.id ? styles.activeTab : ""}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    {tab.id === "enhanced" && tidied && (
                      <span className={styles.newDot} aria-label="Updated" />
                    )}
                  </button>
                ))}
              </div>

              <div
                className={styles.notePanel}
                id={`quiet-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`quiet-tab-${activeTab}`}
              >
                {activeTab === "notes" && (
                  <div className={styles.rawNotes}>
                    <p className={styles.noteHint}>
                      Your notes, exactly as you wrote them.
                    </p>
                    <h4>What we want to remember</h4>
                    <ul>
                      {activeMeeting.notes.map((note) => (
                        <li key={note}>
                          <button
                            type="button"
                            className={styles.checkButton}
                            aria-label={`Mark complete: ${note}`}
                          >
                            <span aria-hidden="true" />
                          </button>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                    <button className={styles.addNote} type="button">
                      <span aria-hidden="true">+</span>
                      Add a thought
                    </button>
                  </div>
                )}

                {activeTab === "enhanced" && (
                  <div className={styles.enhancedNotes}>
                    {!tidied && (
                      <div className={styles.enhancedPrompt}>
                        <span aria-hidden="true">✦</span>
                        <div>
                          <strong>Your private summary is ready when you are.</strong>
                          <p>
                            Meeki can organize this meeting with your on-device
                            model.
                          </p>
                        </div>
                        <button type="button" onClick={tidyNotes}>
                          Tidy now
                        </button>
                      </div>
                    )}
                    {activeMeeting.enhanced.map((item) => (
                      <article key={item.title}>
                        <span>{item.eyebrow}</span>
                        <h4>{item.title}</h4>
                        <p>{item.body}</p>
                      </article>
                    ))}
                  </div>
                )}

                {activeTab === "transcript" && (
                  <div className={styles.transcript}>
                    <div className={styles.transcriptNotice}>
                      <span className={styles.localPulse} aria-hidden="true" />
                      Transcribed locally · Speaker audio was not uploaded
                    </div>
                    {activeMeeting.transcript.map((line) => (
                      <div className={styles.transcriptLine} key={line.time}>
                        <time>{line.time}</time>
                        <strong>{line.speaker}</strong>
                        <p>{line.words}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {privacyOpen && (
            <aside
              className={styles.privacyDrawer}
              id="quiet-privacy-panel"
              aria-label="Meeting privacy controls"
            >
              <div className={styles.drawerHeader}>
                <div>
                  <p>Privacy controls</p>
                  <span>Product direction</span>
                </div>
                <button
                  type="button"
                  aria-label="Close privacy controls"
                  onClick={() => setPrivacyOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className={styles.boundaryCard}>
                <span className={styles.boundaryIcon} aria-hidden="true">
                  <span />
                </span>
                <div>
                  <strong>Protected on this device</strong>
                  <p>Audio, transcript, and notes stay inside your boundary.</p>
                </div>
              </div>

              <dl className={styles.privacyFacts}>
                <div>
                  <dt>Transcription</dt>
                  <dd>Whisper · Local</dd>
                </div>
                <div>
                  <dt>Note model</dt>
                  <dd>Meeki Local 4B</dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>This device</dd>
                </div>
              </dl>

              <button
                className={styles.switchRow}
                type="button"
                role="switch"
                aria-checked={cloudEnabled}
                onClick={() => setCloudEnabled((enabled) => !enabled)}
              >
                <span>
                  <strong>Allow my BYO cloud model</strong>
                  <small>Off by default for every meeting</small>
                </span>
                <span
                  className={`${styles.switch} ${
                    cloudEnabled ? styles.switchOn : ""
                  }`}
                  aria-hidden="true"
                >
                  <span />
                </span>
              </button>

              <button
                className={styles.switchRow}
                type="button"
                role="switch"
                aria-checked={autoDelete}
                onClick={() => setAutoDelete((enabled) => !enabled)}
              >
                <span>
                  <strong>Delete audio after transcription</strong>
                  <small>Keep the transcript, not the recording</small>
                </span>
                <span
                  className={`${styles.switch} ${
                    autoDelete ? styles.switchOn : ""
                  }`}
                  aria-hidden="true"
                >
                  <span />
                </span>
              </button>
            </aside>
          )}

          <p className={styles.srOnly} aria-live="polite">
            {tidied ? "Meeting notes tidied privately on this device." : ""}
          </p>
        </div>
      </section>

      <section className={styles.trustStrip} aria-label="Meeki privacy principles">
        <div>
          <span>01</span>
          <strong>Your notes are yours.</strong>
          <p>Stored locally, in a format you can keep.</p>
        </div>
        <div>
          <span>02</span>
          <strong>Your meeting stays human.</strong>
          <p>No bot joins. No awkward interruption.</p>
        </div>
        <div>
          <span>03</span>
          <strong>Your boundary is visible.</strong>
          <p>You choose every model and destination.</p>
        </div>
      </section>

      <section className={styles.teamsSection} id="teams">
        <div className={styles.teamsHeading}>
          <p className={styles.kicker}>For conversations with consequence</p>
          <h2>Built for the people in the room.</h2>
          <p>
            Meeki keeps the useful context close without turning your most
            candid conversations into somebody else&apos;s dataset.
          </p>
        </div>

        <div className={styles.useCaseGrid}>
          <article className={styles.useCaseLead}>
            <div className={styles.caseNumber}>01</div>
            <div className={styles.conversationLines} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <p>Founders</p>
              <h3>Keep the candid version.</h3>
              <span>
                Preserve the decisions, tradeoffs, and private context that
                rarely survive a founder sync.
              </span>
            </div>
          </article>

          <article className={styles.useCaseProduct}>
            <div className={styles.caseNumber}>02</div>
            <div className={styles.signalGraph} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div>
              <p>Product teams</p>
              <h3>Find the signal while it is fresh.</h3>
              <span>
                Bring customer nuance, open questions, and next moves back into
                the work.
              </span>
            </div>
          </article>

          <article className={styles.useCaseSensitive}>
            <div className={styles.caseNumber}>03</div>
            <div className={styles.safeShape} aria-hidden="true">
              <span>M</span>
            </div>
            <div>
              <p>Sensitive industries</p>
              <h3>Put every conversation inside your boundary.</h3>
              <span>
                Keep legal, healthcare, finance, and security discussions local
                or self-hosted.
              </span>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.privacySection} id="privacy">
        <div className={styles.privacyStatement}>
          <p className={styles.darkKicker}>Private by construction</p>
          <h2>
            Your meeting memory
            <br />
            should live <em>with you.</em>
          </h2>
          <p>
            Meeki starts from a simple boundary: process and store everything
            on your device. Connect more only when you choose.
          </p>
          <a href="https://github.com/inventivezee/meeki">
            Inspect the source <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className={styles.privacyArchitecture}>
          <div className={styles.deviceFrame}>
            <div className={styles.deviceTop}>
              <span>YOUR DEVICE</span>
              <span className={styles.secureLabel}>SECURE</span>
            </div>
            <div className={styles.deviceFlow}>
              <div>
                <span className={styles.flowIcon} aria-hidden="true">
                  •••
                </span>
                <strong>Audio</strong>
                <small>Captured here</small>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span className={styles.flowIcon} aria-hidden="true">
                  Aa
                </span>
                <strong>Transcript</strong>
                <small>Made here</small>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span className={styles.flowIcon} aria-hidden="true">
                  ✦
                </span>
                <strong>Notes</strong>
                <small>Kept here</small>
              </div>
            </div>
            <div className={styles.deviceFooter}>
              <span className={styles.localPulse} aria-hidden="true" />
              Nothing has left this device
            </div>
          </div>
          <p>
            The local path is complete. Cloud is an option—not a dependency.
          </p>
        </div>
      </section>

      <section className={styles.choiceSection}>
        <div className={styles.sectionIntro}>
          <div>
            <p className={styles.kicker}>One product. Your boundary.</p>
            <h2>Run Meeki your way.</h2>
          </div>
          <p>
            Start completely local. Bring a model you trust, host the whole
            stack, or use our managed service when convenience matters.
          </p>
        </div>

        <div className={styles.choiceGrid}>
          <article>
            <span className={styles.choiceIndex}>01</span>
            <div className={styles.choiceGlyph} aria-hidden="true">
              <span className={styles.glyphDevice} />
            </div>
            <h3>Local</h3>
            <p>
              Transcribe and tidy on-device. Your complete meeting workflow can
              stay offline.
            </p>
            <span className={styles.defaultTag}>Default</span>
          </article>
          <article>
            <span className={styles.choiceIndex}>02</span>
            <div className={styles.choiceGlyph} aria-hidden="true">
              <span className={styles.glyphKey}>⌁</span>
            </div>
            <h3>Bring your own AI</h3>
            <p>
              Use your own keys and provider. Meeki sends only what you
              explicitly allow.
            </p>
            <span className={styles.textTag}>Your keys</span>
          </article>
          <article>
            <span className={styles.choiceIndex}>03</span>
            <div className={styles.choiceGlyph} aria-hidden="true">
              <span className={styles.glyphStack} />
            </div>
            <h3>Self-hosted</h3>
            <p>
              Deploy Meeki within your own infrastructure and security
              controls.
            </p>
            <span className={styles.textTag}>Your stack</span>
          </article>
          <article>
            <span className={styles.choiceIndex}>04</span>
            <div className={styles.choiceGlyph} aria-hidden="true">
              <span className={styles.glyphCloud}>M</span>
            </div>
            <h3>Managed</h3>
            <p>
              Give teams a ready-to-use workspace without taking on the
              operations.
            </p>
            <span className={styles.textTag}>Our service</span>
          </article>
        </div>
      </section>

      <section className={styles.openSourceSection} id="open-source">
        <div className={styles.openSourceSeal} aria-hidden="true">
          <span>MIT</span>
          <small>OPEN SOURCE</small>
        </div>
        <div className={styles.openSourceCopy}>
          <p className={styles.kicker}>Open all the way down</p>
          <h2>Trust the code, not the promise.</h2>
          <p>
            Meeki is MIT licensed and fully open source. Read it, fork it,
            improve it, or run it yourself. Privacy is easier to believe when
            you can verify how it works.
          </p>
        </div>
        <div className={styles.repoCard}>
          <div>
            <span className={styles.repoMark} aria-hidden="true">
              M
            </span>
            <span>
              <small>github.com</small>
              <strong>inventivezee / meeki</strong>
            </span>
          </div>
          <a
            href="https://github.com/inventivezee/meeki"
            target="_blank"
            rel="noreferrer"
          >
            Explore repository <span aria-hidden="true">↗</span>
          </a>
          <p>
            <span>MIT License</span>
            <span>Fork welcome</span>
          </p>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.ctaOrb} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>The room is yours again.</p>
        <h2>Be in the meeting.<br />Meeki will remember.</h2>
        <div className={styles.heroActions}>
          <a
            className={styles.primaryButton}
            href="https://github.com/inventivezee/meeki/releases/latest"
          >
            <span>Download Meeki</span>
            <span aria-hidden="true">↓</span>
          </a>
          <a
            className={styles.secondaryButton}
            href="https://github.com/inventivezee/meeki"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        <span className={styles.ctaNote}>
          Open source · Local by default · Yours to keep
        </span>
      </section>

      <footer className={styles.footer}>
        <div>
          <a href="#top" aria-label="Back to top">
            <Wordmark />
          </a>
          <p>Your private meeting note-taker.</p>
        </div>
        <div className={styles.footerLinks}>
          <div>
            <strong>Product</strong>
            <a href="#demo">Demo</a>
            <a href="#privacy">Privacy</a>
            <a href="https://github.com/inventivezee/meeki/releases/latest">
              Download
            </a>
          </div>
          <div>
            <strong>Project</strong>
            <a
              href="https://github.com/inventivezee/meeki"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a href="https://github.com/inventivezee/meeki/blob/main/LICENSE">
              MIT License
            </a>
            <a href="https://github.com/inventivezee/meeki/issues">Issues</a>
          </div>
        </div>
        <div className={styles.footerEnd}>
          <span>Built quietly, in the open.</span>
          <a href="#top">
            Back to top <span aria-hidden="true">↑</span>
          </a>
        </div>
      </footer>
    </main>
  );
}
