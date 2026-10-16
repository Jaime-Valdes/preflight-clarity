import { getAirport } from "@preflight/shared/airports";
import { addDays, daysBetween, formatShortDate, isISODate } from "@preflight/shared/dates";
import { airportCode, dateStatus, MAX_DAYS_AHEAD, type RouteDay } from "@/lib/c/model";

/*
 * Version C search: what the visitor typed (form) or linked (URL), checked
 * against the catalogue and the searchable window — today … today + 330 days,
 * as far as airlines publish schedules and fares (MAX_DAYS_AHEAD / dateStatus
 * in lib/c/model.ts). Pure — safe in render. Copy is calm: hints say what to
 * do, never "error".
 */

/**
 * The date the home form starts with, and popular routes link to: tomorrow,
 * so a first search shows the whole picture (the turbulence forecast for each
 * flight exists from 2 days before departure).
 */
export const DEFAULT_DAYS_AHEAD = 1;

/** "the next 11 months" — the searchable window, for copy. */
export const WINDOW_TEXT = "the next 11 months";

/** A search form's fields: catalogue codes once picked (free text otherwise), "YYYY-MM-DD" or "". */
export interface SearchDraft {
  origin: string;
  destination: string;
  date: string;
}

export interface DraftErrors {
  origin?: string;
  destination?: string;
  date?: string;
}

export type DraftCheck = { ok: true; day: RouteDay } | { ok: false; errors: DraftErrors };

export function maxSearchDate(today: string): string {
  return addDays(today, MAX_DAYS_AHEAD);
}

export function defaultSearchDate(today: string): string {
  return addDays(today, DEFAULT_DAYS_AHEAD);
}

/** A hint for a date that can't be searched, or undefined when it can. */
export function dateHint(date: string, today: string): string | undefined {
  if (!date) return "Pick a date.";
  if (!isISODate(date)) return "That date doesn’t look right.";
  const status = dateStatus(date, today);
  if (status === "past") return "Pick a date from today onwards.";
  if (status === "too-far") return `Pick a date within ${WINDOW_TEXT}.`;
  return undefined;
}

/** "Thu, Nov 26 · in 42 days" for a searchable date. */
export function dateNote(date: string, today: string): string {
  const days = daysBetween(today, date);
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `${formatShortDate(date)} · ${when}`;
}

export function validateDraft(draft: SearchDraft, today: string): DraftCheck {
  const errors: DraftErrors = {};
  const origin = airportCode(draft.origin);
  const destination = airportCode(draft.destination);
  // Typed text that matches no airport isn't kept (flights only exist between real airports).
  if (!draft.origin.trim()) errors.origin = "Where are you flying from? Pick an airport from the suggestions.";
  else if (!origin) errors.origin = "Pick an airport from the suggestions.";
  if (!draft.destination.trim()) errors.destination = "Where are you flying to? Pick an airport from the suggestions.";
  else if (!destination) errors.destination = "Pick an airport from the suggestions.";
  else if (origin && origin === destination) errors.destination = "Pick a destination different from where you’re leaving.";
  const date = dateHint(draft.date, today);
  if (date) errors.date = date;
  if (!origin || !destination || errors.destination || errors.date) return { ok: false, errors };
  return { ok: true, day: { origin, destination, date: draft.date } };
}

// ── The /c/search query string ──────────────────────────────────────────────

export type QueryIssue =
  | "empty"
  | "origin-missing"
  | "origin-unknown"
  | "destination-missing"
  | "destination-unknown"
  | "same"
  | "date-missing"
  | "date-invalid"
  | "date-past"
  | "date-far";

export interface QueryCheck {
  /** The route and day, when every part is valid and searchable. */
  day: RouteDay | null;
  /** The first thing to fix (null when `day` is set). */
  issue: QueryIssue | null;
  /** The usable parts, to start the search form with. */
  draft: SearchDraft;
  /** What the link said, trimmed (for the message). */
  raw: { from: string; to: string; date: string };
}

type Params = { get(name: string): string | null };

export function checkQuery(params: Params, today: string): QueryCheck {
  const raw = {
    from: (params.get("from") ?? "").trim().slice(0, 40),
    to: (params.get("to") ?? "").trim().slice(0, 40),
    date: (params.get("date") ?? "").trim().slice(0, 40),
  };
  const origin = airportCode(raw.from);
  const destination = airportCode(raw.to);
  const dateOk = isISODate(raw.date);
  const status = dateOk ? dateStatus(raw.date, today) : null;
  const inWindow = status === "ok";
  const draft: SearchDraft = {
    origin: origin ?? "",
    destination: destination && destination !== origin ? destination : "",
    date: inWindow ? raw.date : "",
  };

  let issue: QueryIssue | null = null;
  if (!raw.from && !raw.to && !raw.date) issue = "empty";
  else if (!raw.from) issue = "origin-missing";
  else if (!origin) issue = "origin-unknown";
  else if (!raw.to) issue = "destination-missing";
  else if (!destination) issue = "destination-unknown";
  else if (origin === destination) issue = "same";
  else if (!raw.date) issue = "date-missing";
  else if (!dateOk) issue = "date-invalid";
  else if (status === "past") issue = "date-past";
  else if (status === "too-far") issue = "date-far";

  return {
    day: issue === null && origin && destination ? { origin, destination, date: raw.date } : null,
    issue,
    draft,
    raw,
  };
}

/** A calm title and sentence for a search link that can't be shown. */
export function issueMessage(issue: QueryIssue, raw: QueryCheck["raw"]): { title: string; text: string } {
  switch (issue) {
    case "empty":
      return {
        title: "Where would you like to fly?",
        text: "Pick where you’re leaving from, where you’re going and a date to see that day’s nonstop flights.",
      };
    case "origin-missing":
      return { title: "Pick where you’re leaving from", text: "Choose an airport from the suggestions to see flights." };
    case "origin-unknown":
      return {
        title: "We don’t have that airport",
        text: `“${raw.from}” isn’t one of the airports in this prototype. Pick one from the suggestions.`,
      };
    case "destination-missing":
      return { title: "Pick where you’re going", text: "Choose an airport from the suggestions to see flights." };
    case "destination-unknown":
      return {
        title: "We don’t have that airport",
        text: `“${raw.to}” isn’t one of the airports in this prototype. Pick one from the suggestions.`,
      };
    case "same": {
      const airport = getAirport(raw.from);
      return {
        title: "That’s the same airport twice",
        text: `${airport ? `${airport.city} (${airport.code})` : "The airport"} is both the origin and the destination. Pick two different airports.`,
      };
    }
    case "date-missing":
      return { title: "Pick a date", text: "Choose a day to see its nonstop flights." };
    case "date-invalid":
      return { title: "That date doesn’t look right", text: "Pick another date from the calendar." };
    case "date-past":
      return {
        title: "That date has passed",
        text: "Flights are shown from today up to about 11 months ahead. Pick another date.",
      };
    case "date-far":
      return {
        title: "That date is a little far ahead",
        text: "Airlines publish schedules and fares about 11 months ahead, so flights are shown up to then. Pick an earlier date.",
      };
  }
}
