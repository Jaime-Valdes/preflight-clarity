"use client";

import { useState } from "react";
import { VARIANT_SHORT_LABELS, type OpenTextAnswers, type TextAnswer } from "@preflight/shared/stats";
import { Block, EmptyNote, formatDateShort } from "./bits";

const INITIAL = 5;

function TextList({ title, items }: { title: string; items: TextAnswer[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, INITIAL);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400 tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <EmptyNote className="mt-3">Nothing written yet.</EmptyNote>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {visible.map((item) => (
            <li key={item.sessionId} className="rounded-2xl bg-canvas/70 px-4 py-3 ring-1 ring-inset ring-line/70">
              <p className="text-sm leading-relaxed text-ink-900">“{item.text}”</p>
              <p className="mt-1.5 text-xs text-ink-400">
                {VARIANT_SHORT_LABELS[item.variant]} · {formatDateShort(item.createdAt)}
                {item.isTest ? " · test session" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {items.length > INITIAL ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 h-10 rounded-full px-4 text-sm font-semibold text-breeze-700 hover:bg-breeze-50"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  );
}

/** The three free-text answers as readable lists, newest first. */
export function OpenTextBlock({ answers, className }: { answers: OpenTextAnswers; className?: string }) {
  return (
    <Block
      id="words"
      className={className}
      title="In their own words"
      subtitle="Free-text answers from the post-survey, newest first. Quoted exactly as typed."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <TextList title="What they'd still be scared of" items={answers.stillScaredOf} />
        <TextList title="What made them more anxious" items={answers.feltWorse} />
        <TextList title="What it would replace" items={answers.wouldReplace} />
      </div>
    </Block>
  );
}
