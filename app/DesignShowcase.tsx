"use client";

import { useEffect, useState } from "react";
import PrivateNotebook from "./concepts/PrivateNotebook";
import Glassbox from "./concepts/Glassbox";
import QuietCompanion from "./concepts/QuietCompanion";
import styles from "./DesignShowcase.module.css";

const concepts = [
  {
    id: "private-notebook",
    number: "01",
    name: "Private Notebook",
    note: "Calm, editorial, trust-first",
  },
  {
    id: "glassbox",
    number: "02",
    name: "Glassbox",
    note: "Technical, auditable, security-first",
  },
  {
    id: "quiet-companion",
    number: "03",
    name: "Quiet Companion",
    note: "Warm, approachable, presence-first",
  },
] as const;

type ConceptId = (typeof concepts)[number]["id"];

const isConceptId = (value: string): value is ConceptId =>
  concepts.some((concept) => concept.id === value);

export default function DesignShowcase() {
  const [activeConcept, setActiveConcept] =
    useState<ConceptId>("private-notebook");

  useEffect(() => {
    const hashTimer = window.setTimeout(() => {
      const hash = window.location.hash.replace("#", "");
      if (isConceptId(hash)) {
        setActiveConcept(hash);
      }
    }, 0);

    return () => window.clearTimeout(hashTimer);
  }, []);

  const chooseConcept = (concept: ConceptId) => {
    setActiveConcept(concept);
    window.history.replaceState(null, "", `#${concept}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={styles.showcase}>
      <aside className={styles.studyBar} aria-label="Meeki design concepts">
        <div className={styles.studyIdentity}>
          <span className={styles.studyMark} aria-hidden="true">
            M
          </span>
          <span>
            <strong>Meeki design study</strong>
            <small>Choose a direction to explore</small>
          </span>
        </div>

        <div className={styles.conceptTabs} role="tablist">
          {concepts.map((concept) => (
            <button
              className={`${styles.conceptTab} ${
                activeConcept === concept.id ? styles.activeTab : ""
              }`}
              key={concept.id}
              onClick={() => chooseConcept(concept.id)}
              role="tab"
              aria-selected={activeConcept === concept.id}
              aria-controls={`concept-${concept.id}`}
              type="button"
            >
              <span>{concept.number}</span>
              <span>
                <strong>{concept.name}</strong>
                <small>{concept.note}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section
        className={styles.conceptCanvas}
        id={`concept-${activeConcept}`}
        role="tabpanel"
        aria-label={
          concepts.find((concept) => concept.id === activeConcept)?.name
        }
      >
        {activeConcept === "private-notebook" && <PrivateNotebook />}
        {activeConcept === "glassbox" && <Glassbox />}
        {activeConcept === "quiet-companion" && <QuietCompanion />}
      </section>
    </div>
  );
}
