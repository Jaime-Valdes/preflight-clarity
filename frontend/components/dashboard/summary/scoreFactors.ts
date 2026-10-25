import { departWindowOf } from "@preflight/shared/fakeFlight";
import type { BumpWindow, Flight, SectionContext, WeatherReport } from "@preflight/shared/types";
import { PHASE_WHEN, historyBasis, typicalBumpyPhaseLine, typicalSmoothLine } from "../turbulence/format";

/*
 * What goes into the smoothness score — the factors the illustrative model
 * actually uses (shared/src/fakeFlight.ts: the expected bumpy stretches,
 * aircraft size, time of day), two pieces of context that do not move the
 * number, and how firm the forecast is. The context is listed because it is
 * on the card and people ask about it: the route history's "% smooth" is
 * derived from the model's own scores for that route and month (an output,
 * not an input), and the weather at both ends only shapes where any low-level
 * bumps are expected and how they are described. Both are marked neutral and
 * described as context. Pure: built from the Flight and the section context
 * only, so the summary card lists the same facts the sections show. Every line
 * is read by anxious flyers: calm, specific, never alarming.
 */

/** Which way a factor moves the score: "up" = smoother, "down" = bumpier, "neutral" = no push either way (or context only). */
export type FactorEffect = "up" | "down" | "neutral";

export interface ScoreFactor {
  id: "history" | "bumps" | "aircraft" | "time" | "weather" | "confidence";
  title: string;
  /** One calm sentence. */
  detail: string;
  effect: FactorEffect;
}

/** Months the generator treats as warm-season heating (afternoon clouds build, evenings can stay bumpy). */
const WARM_MONTHS = new Set(["June", "July", "August"]);

function plural(n: number, word: string, words = `${word}s`): string {
  return `${n} ${n === 1 ? word : words}`;
}

/** "about 12 minutes" */
function aboutMinutes(min: number): string {
  const rounded = Math.max(1, Math.round(min));
  return `about ${plural(rounded, "minute")}`;
}

function bumpsFactor(windows: readonly BumpWindow[], smoothMinutesPct: number): ScoreFactor {
  if (windows.length === 0) {
    return {
      id: "bumps",
      title: "Expected bumpy stretches",
      detail: "None expected — the forecast has the whole flight smooth, so nothing is taken off.",
      effect: "up",
    };
  }
  const moderate = windows.filter((w) => w.intensity === "moderate").length;
  const total = windows.reduce((sum, w) => sum + w.durationMin, 0);
  const phases = [...new Set(windows.map((w) => w.phase))];
  const where =
    phases.length === 1 ? PHASE_WHEN[phases[0]] : `${PHASE_WHEN[phases[0]]} and ${PHASE_WHEN[phases[phases.length - 1]]}`;
  const kind = moderate === 0 ? "light" : moderate === windows.length ? "moderate" : "light to moderate";
  return {
    id: "bumps",
    title: "Expected bumpy stretches",
    detail: `${plural(windows.length, "stretch", "stretches")} of ${kind} bumps, ${aboutMinutes(total)} in all, ${where}. Each one takes a little off the score; about ${smoothMinutesPct}% of the time in the air should be smooth.`,
    effect: "down",
  };
}

function timeFactor(flight: Flight): ScoreFactor {
  const window = departWindowOf(flight.departTime);
  const warm = WARM_MONTHS.has(flight.turbulence.history.month);
  const best = flight.turbulence.history.bestDepartureWindow;
  if (window === "morning") {
    return {
      id: "time",
      title: "Time of day",
      detail: `Morning departure — before the day’s heating builds clouds along the route. ${best}`,
      effect: "up",
    };
  }
  if (window === "afternoon") {
    return {
      id: "time",
      title: "Time of day",
      detail: `Afternoon departure — the day’s heating can build clouds along the route, so the model allows a little more movement. ${best}`,
      effect: "down",
    };
  }
  return {
    id: "time",
    title: "Time of day",
    detail: warm
      ? `Evening departure — in ${flight.turbulence.history.month} the afternoon’s clouds can linger into the evening, so the model allows a little more movement. ${best}`
      : `Evening departure — the day’s heating has eased by then. ${best}`,
    effect: warm ? "down" : "neutral",
  };
}

function weatherLine(report: WeatherReport, moment: "departure" | "arrival"): string {
  return `${report.label.toLowerCase()} at ${report.airportCode} for ${moment}`;
}

/**
 * Context, not an input: the weather never moves the score. In the model it only decides which
 * cause a low-level bump is given (clouds, showers, a breeze) and how the phase notes are worded.
 */
function weatherFactor(flight: Flight): ScoreFactor {
  const { origin, destination } = flight.weather;
  const minor = [origin, destination].filter((w) => w.impact === "minor");
  const ends = `${weatherLine(origin, "departure")}, ${weatherLine(destination, "arrival")}`;
  const sentence = `${ends[0].toUpperCase()}${ends.slice(1)}.`;
  if (minor.length === 0) {
    return {
      id: "weather",
      title: "Weather at both ends",
      detail: `${sentence} Shown for context: the weather doesn’t move the score. It only shapes how any low-level bumps are described, and with this weather there is nothing to add.`,
      effect: "neutral",
    };
  }
  const which = minor.length === 2 ? "both ends" : minor[0].moment === "departure" ? "the departure end" : "the arrival end";
  return {
    id: "weather",
    title: "Weather at both ends",
    detail: `${sentence} Shown for context: the weather doesn’t move the score. It shapes where any light bumps low down are expected — here, near ${which} — and how they are described.`,
    effect: "neutral",
  };
}

/**
 * The factors behind this flight's score, in the order the card shows them.
 * The stretches, the aircraft and the time of day move the number; the route's history for
 * the month and the weather at both ends are context (the history is itself a summary of the
 * model's scores on this route, so it can't be an input); confidence says how firm it all is.
 */
export function scoreFactors(flight: Flight, ctx: SectionContext): ScoreFactor[] {
  const { history, windows, smoothMinutesPct } = flight.turbulence;
  const wide = flight.aircraft.bodyType === "wide";
  return [
    {
      id: "history",
      title: `How this route usually flies in ${history.month}`,
      detail: `${typicalSmoothLine(history)}, ${historyBasis(history)}. Shown for context: the score comes from this flight’s own forecast, not from the history. ${typicalBumpyPhaseLine(history.typicalBumpyPhase)}`,
      effect: "neutral",
    },
    bumpsFactor(windows, smoothMinutesPct),
    {
      id: "aircraft",
      title: "Aircraft size",
      detail: wide
        ? `${flight.aircraft.fullName} is a wide-body jet. Larger, heavier planes feel the same air a little less, so the model softens the bumps for it.`
        : `${flight.aircraft.fullName} is a narrow-body jet, the usual size on routes like this. The bumps are modelled as forecast, with no softening.`,
      effect: wide ? "up" : "neutral",
    },
    timeFactor(flight),
    weatherFactor(flight),
    {
      id: "confidence",
      title: "Forecast confidence",
      detail: `${ctx.forecast.confidenceLabel}. ${ctx.forecast.note} Confidence doesn’t move the score; it says how settled the number is.`,
      effect: "neutral",
    },
  ];
}
