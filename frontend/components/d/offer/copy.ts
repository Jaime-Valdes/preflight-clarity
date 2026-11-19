import type { DismissReason, EasierAnswer, PackItem, PlanChoice } from "@preflight/shared/types";

/*
 * Every visible string of version D's Flight Day Pack test (docs/FLIGHT_DAY_PACK.md). The owner's
 * copy is used word for word where the spec gives it; the rest is written in the same calm voice.
 * Never: urgency, scarcity, timers, discounts, framing that plays on nerves, or a claim that it eases anxiety.
 * Typographic apostrophes and quotes, like the rest of D's copy.
 */

export const OFFER_TITLE = "Make flight day easier";
/** "Flight Day Pack · $4.99 per trip" */
export const offerLine = (price: string) => `Flight Day Pack · ${price} per trip`;
/** "Add for $4.99" */
export const addLabel = (price: string) => `Add for ${price}`;
export const NO_THANKS = "No thanks";

/** The three items, as the offer lists them (title, then what it covers). */
export const OFFER_ITEMS: readonly { key: Exclude<PackItem, "none">; title: string; detail: string }[] = [
  { key: "walkthrough", title: "Airport walkthrough for your departure airport", detail: "Security, your terminal, finding your gate" },
  { key: "airline", title: "Your airline, explained", detail: "Boarding, what to expect on board" },
  { key: "landed_text", title: "A “landed safely” text to someone you choose", detail: "" },
];

// ── "Add for $X": the honest fake door ──────────────────────────────────────

export const JOIN_TITLE = "The Flight Day Pack isn’t ready yet.";
export const JOIN_BODY = "Leave your email and you’ll get it free at launch.";
export const EMAIL_LABEL = "Email";
export const EMAIL_HINT = "That email doesn’t look complete yet.";
export const NAME_LABEL = "First name";
export const OPTIONAL = "(optional)";
export const FLIGHT_DATE_LABEL = "Have a real flight coming up? When?";
export const FLIGHT_DATE_HINT = "Pick a day between today and a year from now, or leave it empty.";
export const JOIN_BUTTON = "Get it free at launch";
export const NOT_NOW = "Not now";

export const ITEMS_DONE = "You’re on the list. We’ll email you once, when it’s ready.";
export const ITEMS_QUESTION = "Which of these would you actually use?";
export const ITEMS_HELP = "Tick any that apply.";
export const ITEM_LABELS: Record<PackItem, string> = {
  walkthrough: "Airport walkthrough",
  airline: "Your airline, explained",
  landed_text: "The “landed safely” text",
  none: "None of these",
};
export const WORTH_IT_LABEL = "What would make this worth it for you?";
export const SEND = "Send";
export const SKIP = "Skip";

// ── "No thanks" ─────────────────────────────────────────────────────────────

export const DISMISS_TITLE = "No problem.";
export const DISMISS_BODY = "If you like, tell us why. One tap is plenty.";
export const DISMISS_REASONS: readonly { key: DismissReason; label: string }[] = [
  { key: "too_expensive", label: "Too expensive" },
  { key: "wouldnt_use", label: "I wouldn’t use it" },
  { key: "not_sure", label: "Not sure what it is" },
  { key: "something_else", label: "Something else" },
  { key: "prefer_not", label: "Prefer not to say" },
];
export const ANYTHING_ELSE_LABEL = "Anything else?";
export const DONE = "Done";

// ── The pricing questions (once per visitor) ────────────────────────────────

export const PRICING_TITLE = "A few questions about price";
export const PRICING_BODY = "All optional, and there are no right answers. In US dollars, per trip.";
export const PRICING_LEAD = "At what price would the Flight Day Pack feel…";
export const PRICE_QUESTIONS: readonly { key: "tooCheap" | "bargain" | "gettingExpensive" | "tooExpensive"; label: string }[] = [
  { key: "tooCheap", label: "too cheap to trust?" },
  { key: "bargain", label: "like a bargain?" },
  { key: "gettingExpensive", label: "like it’s getting expensive?" },
  { key: "tooExpensive", label: "too expensive to consider?" },
];
export const PRICE_HINT = "Enter an amount from $0 to $500, or leave it empty.";
export const PLAN_QUESTION = "Per trip, or $29.99 a year for every trip?";
export const PLAN_OPTIONS: readonly { key: PlanChoice; label: string }[] = [
  { key: "per_trip", label: "Per trip" },
  { key: "yearly", label: "Yearly" },
  { key: "neither", label: "Neither" },
  { key: "not_sure", label: "Not sure" },
];

// ── Thank-you ───────────────────────────────────────────────────────────────

export const THANKS_TITLE = "Thank you.";
export const THANKS_JOINED = "You’re on the list for the Flight Day Pack. We’ll email you once, when it’s ready.";
export const THANKS_OTHER = "That helps us build the right thing. Enjoy the rest of your search.";

// ── General feedback (flight and compare pages) ─────────────────────────────

export const FEEDBACK_LINK = "Tell us what you think";
export const FEEDBACK_QUESTION = "Did Cloud9 make choosing a flight feel easier?";
export const EASIER_OPTIONS: readonly { key: EasierAnswer; label: string }[] = [
  { key: "yes", label: "Yes" },
  { key: "a_little", label: "A little" },
  { key: "no", label: "No" },
  { key: "none", label: "None of these" },
];
export const MORE_USEFUL_LABEL = "What would make Cloud9 more useful before your next flight?";
export const FEEDBACK_CLOSE = "Close";
export const FEEDBACK_THANKS = "Thank you. That helps.";
