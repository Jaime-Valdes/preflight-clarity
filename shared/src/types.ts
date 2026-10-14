/* ────────────────────────────────────────────────────────────────────────────
 * Shared contract for the whole app.
 *
 * The fake-flight generator, the dashboard sections, the study flow, the API
 * route and the results page all code against these types. Change them only
 * deliberately — every layer depends on them.
 * ──────────────────────────────────────────────────────────────────────────── */

// ── Study design ────────────────────────────────────────────────────────────

/** A = full dashboard, B = minimal (summary card + turbulence timeline only). */
export type Variant = "A" | "B";
export type VariantSource = "random" | "forced";

export type Step = "welcome" | "pre" | "setup" | "dashboard" | "post" | "debrief";

export type DeviceType = "mobile" | "tablet" | "desktop";

export type SectionId =
  | "turbulence"
  | "pilot"
  | "aircraft"
  | "airline"
  | "weather"
  | "seat"
  | "sounds"
  | "compare"
  | "alerts";

/** Anything a participant can credit or blame in the post-survey. */
export type DashboardPart = "summary" | SectionId;

// ── Surveys ─────────────────────────────────────────────────────────────────

export type Timeframe = "lt1w" | "1to4w" | "1to3m" | "3mplus";
export type FlightsPerYear = "0to1" | "2to3" | "4to6" | "7to12" | "13plus";
export type CheckFrequency = "never" | "once" | "weekly" | "daily" | "multiple_daily";
export type ReplaceOption =
  | "medication"
  | "videos"
  | "turbulence_apps"
  | "choosing_flights"
  | "nothing";

/**
 * 0–10 integer ratings. `null` = not answered yet. Sliders deliberately start
 * unset so no default value anchors the answer.
 */
export interface Ratings {
  anxiety: number | null;
  control: number | null;
  predictability: number | null;
}

export interface PreSurvey extends Ratings {
  /** Optional. IATA code if picked from the list, otherwise free text; "" if skipped. */
  routeOrigin: string;
  routeDestination: string;
  timeframe: Timeframe | null;
  flightsPerYear: FlightsPerYear | null;
}

export interface PostSurvey extends Ratings {
  /** "Which part of the dashboard, if any, made you feel better?" `"none"` = picked "None of these". */
  feltBetter: Array<DashboardPart | "none">;
  /** "Did anything make you feel more anxious?" `"none"` = picked "Nothing". */
  feltWorse: Array<DashboardPart | "none">;
  feltWorseText: string;
  checkFrequency: CheckFrequency | null;
  wouldReplace: ReplaceOption[];
  wouldReplaceText: string;
  stillScaredOf: string;
  /** Variant A only: "If you could, would you switch to one of the other flights you looked at?" */
  wouldSwitch?: WouldSwitch | null;
}

// ── Flight (generated — every value is fake but must look credible) ────────

export interface FlightInput {
  /** IATA code (uppercase) for known airports, otherwise trimmed free text. */
  origin: string;
  destination: string;
  /** Local departure date, "YYYY-MM-DD". */
  date: string;
}

export interface Airport {
  /** "JFK". Free-text entries get a synthetic 3-letter code. */
  code: string;
  /** "New York" */
  city: string;
  /** "John F. Kennedy International" */
  name: string;
  /** ISO 3166-1 alpha-2, e.g. "US" */
  country: string;
  lat: number;
  lon: number;
  /** IANA time zone, e.g. "America/New_York" */
  tz: string;
  /** false when synthesized from free text that matched no known airport. */
  known: boolean;
}

export interface Airline {
  /** IATA designator, e.g. "DL" */
  code: string;
  /** "Delta Air Lines" */
  name: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
}

export type BodyType = "narrow" | "wide";

export interface Aircraft {
  /** "Airbus" */
  manufacturer: string;
  /** "A321neo" */
  model: string;
  /** "Airbus A321neo" */
  fullName: string;
  bodyType: BodyType;
  /** Economy seat layout, e.g. "3-3", "3-3-3", "2-4-2", "3-4-3". */
  seatLayout: string;
  typicalSeats: number;
  /** Registration of this specific airframe, e.g. "N523DZ". */
  tailNumber: string;
  /** Age of this specific airframe in years, one decimal (e.g. 6.2). */
  ageYears: number;
  /** Year this specific airframe was delivered. */
  deliveredYear: number;
  /** Year the model entered airline service. */
  modelInServiceSince: number;
  /** Approximate number of this model flying worldwide. */
  modelFleetSize: number;
  /** "Last full inspection: 12 days ago" */
  lastInspectionDaysAgo: number;
  /** Routine check name, e.g. "A-check". */
  lastCheckType: string;
  nextCheckDueDays: number;
  /** Calm status line, e.g. "All scheduled checks up to date". */
  maintenanceStatus: string;
  /** Calm, factual statements about the model's record. Never crash statistics. */
  safetyRecord: string[];
  /** Typical cabin noise at cruise, dB. */
  cabinNoiseDb: number;
  cruiseAltitudeFt: number;
  cruiseSpeedMph: number;
}

export interface Pilot {
  role: "Captain" | "First Officer";
  /** Fake, diverse names. */
  name: string;
  initials: string;
  /** 4.6–5.0, one decimal. */
  rating: number;
  /** Number of passenger ratings, e.g. 1284. */
  ratingCount: number;
  totalHours: number;
  hoursOnType: number;
  yearsFlying: number;
  /** Times this pilot has flown this exact route. */
  timesOnRoute: number;
  /** "Based in New York" */
  base: string;
  /** "Former flight instructor" */
  background: string;
  /** Uber-style compliments, e.g. ["Smooth landings", "Clear announcements"]. */
  badges: string[];
}

export type Intensity = "none" | "light" | "moderate";
export type FlightPhase = "takeoff" | "climb" | "cruise" | "descent" | "landing";

export interface TurbulencePoint {
  /** Minutes after takeoff, 0..airborneMin, every 5 minutes (last point = airborneMin). */
  minute: number;
  /** 0..2 continuous: 0 = none, 1 = light, 2 = moderate. Never above 2. */
  level: number;
  phase: FlightPhase;
}

export interface PhaseForecast {
  phase: FlightPhase;
  /** Minutes after takeoff. */
  startMin: number;
  endMin: number;
  /** Peak expected intensity within the phase. */
  intensity: Intensity;
  /** "Smooth climb expected once above the cloud layer." */
  note: string;
}

export interface BumpWindow {
  phase: FlightPhase;
  /** Minutes after takeoff. */
  startMin: number;
  durationMin: number;
  intensity: "light" | "moderate";
  /** Forecast phrasing: "Light bumps likely about 25 min after takeoff, lasting about 5 min." */
  label: string;
  /** Route-history phrasing: "Light bumps are common about 25 min after takeoff, for about 5 min." */
  typicalLabel: string;
  /** Plain-language cause: "Climbing through a layer of fair-weather clouds." */
  cause: string;
  seatbeltSign: boolean;
}

export interface RouteHistory {
  /** Month of the flight date, e.g. "October". */
  month: string;
  /** % of flights on this route in this month with little or no turbulence (typically 72–96). */
  smoothPct: number;
  /** How many past flights the stat is "based on", e.g. 1240. */
  flightsAnalyzed: number;
  /** Phase where bumps most often happen on this route. */
  typicalBumpyPhase: FlightPhase;
  /** "Morning departures (6–10 AM) are usually the smoothest on this route." */
  bestDepartureWindow: string;
}

export interface TurbulenceForecast {
  points: TurbulencePoint[];
  /** Always 5 entries, in flight order: takeoff, climb, cruise, descent, landing. */
  phases: PhaseForecast[];
  /** 0–3 windows, sorted by startMin. */
  windows: BumpWindow[];
  maxIntensity: Intensity;
  /** Share of airborne time expected to be smooth (level < 0.5), 0–100. */
  smoothMinutesPct: number;
  history: RouteHistory;
}

export interface Smoothness {
  /** 0–100, typically 60–97. */
  score: number;
  /** "Very smooth" | "Mostly smooth" | "Some bumps expected" */
  label: string;
  /** Calm one-liner: "Expect a mostly smooth flight with light bumps during descent." */
  summary: string;
}

export type WeatherCondition =
  | "clear"
  | "mostly_clear"
  | "partly_cloudy"
  | "cloudy"
  | "light_rain"
  | "showers"
  | "fog"
  | "light_snow"
  | "breezy";

export interface WeatherReport {
  airportCode: string;
  city: string;
  moment: "departure" | "arrival";
  /** "HH:MM" 24h local time at that airport. */
  localTime: string;
  condition: WeatherCondition;
  /** "Partly cloudy" */
  label: string;
  tempC: number;
  tempF: number;
  windKts: number;
  /** Compass point, e.g. "NW". */
  windDir: string;
  gustKts: number | null;
  visibilityMi: number;
  precipPct: number;
  impact: "none" | "minor";
  /** Calm, plain-language note: "Light winds — ideal conditions for takeoff." */
  impactNote: string;
}

export interface AirlineStats {
  /** 90–99 out of 100. Always high — never single out a real airline negatively. */
  safetyScore: number;
  /** "Top-tier safety rating" */
  safetyLabel: string;
  /** Network-wide on-time arrival rate, 0–100. */
  onTimePct: number;
  /** On-time rate for this specific route, 0–100. */
  onTimeRoutePct: number;
  /** 0–10, one decimal. */
  comfortScore: number;
  seatPitchIn: number;
  seatWidthIn: number;
  cabinNoise: "Very quiet" | "Quiet" | "Average";
  cabinNoiseDb: number;
  /** ["Free Wi-Fi", "Seat-back screens", "Power at every seat"] */
  amenities: string[];
  /** Cabin crew rating, 4.5–4.9. */
  crewRating: number;
}

/** smoothest = over the wing, smooth = forward cabin, more_motion = rear cabin. */
export type SeatZone = "smoothest" | "smooth" | "more_motion";

export interface SeatRow {
  row: number;
  zone: SeatZone;
  exit: boolean;
}

export interface SeatMap {
  /** Seat letters grouped by aisle, e.g. [["A","B","C"],["D","E","F"]]. */
  columnGroups: string[][];
  /** Economy rows shown on the map, in order. */
  rows: SeatRow[];
  wingStartRow: number;
  wingEndRow: number;
  /** Seat ids already taken, e.g. "14C". */
  occupied: string[];
  /** Best available seats, smoothest first, e.g. ["15A", "15F", "14D"]. Never occupied. */
  recommended: string[];
  /** Plain-language "Why?" explanation. */
  why: string;
}

export type SoundMoment =
  | "boarding"
  | "taxi"
  | "takeoff"
  | "climb"
  | "cruise"
  | "descent"
  | "landing";

export interface SoundCue {
  id: string;
  moment: SoundMoment;
  /** "Right after liftoff", "About 25 min before landing" */
  when: string;
  /** Minutes after takeoff when it happens (negative = before takeoff); null if not tied to a time. */
  minute: number | null;
  sense: "hear" | "feel" | "both";
  /** "A thunk and a whir under the floor" */
  title: string;
  /** What you'll notice. */
  detail: string;
  /** Plain-language reason it's normal. */
  why: string;
}

export interface AlternativeFlight {
  /** Id of the flight it opens (= generateFlight(input, prefs).id); unique within the list. */
  id: string;
  airline: Airline;
  flightNumber: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" local at origin */
  departTime: string;
  /** "HH:MM" local at destination */
  arriveTime: string;
  arriveDayOffset: number;
  blockMin: number;
  /** "Airbus A350-900" */
  aircraft: string;
  bodyType: BodyType;
  smoothnessScore: number;
  /** Difference vs. the participant's flight (+ = smoother). */
  scoreDelta: number;
  /** "Departs before afternoon heating builds clouds." */
  reason: string;
  /** Fare difference vs. the participant's flight in USD (can be negative). */
  fareDiffUsd: number;
  /** What opens this option as a full flight: generateFlight(input, prefs). */
  input?: FlightInput;
  prefs?: FlightPrefs;
}

export interface Flight {
  /** Stable hash of the normalized input. */
  id: string;
  input: FlightInput;
  origin: Airport;
  destination: Airport;
  airline: Airline;
  /** "DL 1423" */
  flightNumber: string;
  distanceMi: number;
  /** Takeoff → landing. The turbulence timeline uses this. */
  airborneMin: number;
  /** Gate → gate (airborne + taxi). Departure/arrival times use this. */
  blockMin: number;
  /** "HH:MM" 24h local at origin */
  departTime: string;
  /** "HH:MM" 24h local at destination */
  arriveTime: string;
  /** Calendar-day offset of arrival vs. departure date in local time (-1, 0, +1, +2). */
  arriveDayOffset: number;
  terminal: string;
  gate: string;
  aircraft: Aircraft;
  crew: { captain: Pilot; firstOfficer: Pilot };
  turbulence: TurbulenceForecast;
  smoothness: Smoothness;
  weather: { origin: WeatherReport; destination: WeatherReport };
  airlineStats: AirlineStats;
  seatMap: SeatMap;
  /** In chronological order. */
  sounds: SoundCue[];
  /** 2–3 options. */
  alternatives: AlternativeFlight[];
  /** The prefs that produced this flight ({} for a plain setup flight). */
  prefs?: FlightPrefs;
}

// ── Forecast status (depends on days until departure, not on the flight) ──

export type ForecastMode = "history" | "outlook" | "forecast";

export interface ForecastStatus {
  mode: ForecastMode;
  confidence: "low" | "moderate" | "high";
  /** 1–5, for a small confidence meter. */
  confidenceLevel: number;
  /** "Early estimate" | "Moderate confidence" | "High confidence" */
  confidenceLabel: string;
  /** "Based on 1,240 past flights on this route in October" */
  basis: string;
  /** "Your forecast sharpens as the date gets closer…" */
  note: string;
}

// ── Dashboard sections ──────────────────────────────────────────────────────

export interface SectionContext {
  /** Whole calendar days from today to the departure date (0 = today). */
  daysUntil: number;
  forecast: ForecastStatus;
  variant: Variant;
}

/** Props every dashboard section body receives. */
export interface SectionProps {
  flight: Flight;
  ctx: SectionContext;
}

// ── Tracking ────────────────────────────────────────────────────────────────

export interface SectionStats {
  /** Times the participant expanded the section (not counting it coming back into view on a flight switch). */
  opens: number;
  /** Total time expanded while the page was visible, ms (paused while the compare view or the what-if sheet covers it). */
  openMs: number;
  /** ms after the dashboard started when the section was first expanded. */
  firstOpenAtMs: number | null;
}

export interface DashboardEvent {
  /** ms after the dashboard started. */
  t: number;
  /** e.g. "section_open", "section_close", "seat_selected", "alert_toggle". */
  type: string;
  section?: SectionId;
  detail?: string;
}

export interface DashboardMetrics {
  /** ISO timestamp when the dashboard was first shown. */
  startedAt: string;
  /** ISO timestamp when the participant pressed "Done"; null while in progress. */
  endedAt: string | null;
  /** Wall-clock time on the dashboard, ms. */
  totalMs: number;
  /** Time on the dashboard while the page was visible, ms. */
  activeMs: number;
  /** Sections shown, in display order. */
  sectionOrder: SectionId[];
  /** One entry per section shown. */
  sections: Partial<Record<SectionId, SectionStats>>;
  alert: { tapped: boolean; taps: number; finalOn: boolean };
  /** Capped at MAX_EVENTS (see lib/tracking.ts). */
  events: DashboardEvent[];
  /**
   * Deepest scroll position reached, as a share of the scrollable height of
   * the page as last laid out: 0 = never scrolled (or nothing to scroll),
   * 100 = reached the bottom.
   */
  maxScrollPct: number;
  /** True if the dashboard was resumed after a page reload. */
  resumed: boolean;
  /** Free exploration (variant A). Absent/null in variant B and in records from before the feature. */
  exploration?: ExplorationMetrics | null;
}

// ── Free exploration (variant A; see docs/EXPLORATION.md) ───────────────────

export type DepartWindow = "morning" | "afternoon" | "evening";

/** Knobs the participant can turn. Part of the seed, so the same prefs always give the same flight. */
export interface FlightPrefs {
  departWindow?: DepartWindow;
  /** Ask for a wide-body. */
  bodyType?: "wide";
  /** IATA code — fixes the carrier (used when opening an alternative). */
  airline?: string;
}

export type AddedVia =
  | "setup"
  | "alternative"
  | "whatif_day"
  | "whatif_time"
  | "whatif_wide"
  | "whatif_route";

export interface ExploredFlight {
  /** Flight.id */
  id: string;
  input: FlightInput;
  /** {} for the reference flight. */
  prefs: FlightPrefs;
  summary: FlightSummary;
  addedVia: AddedVia;
  /** ms after the dashboard started. */
  addedAtMs: number;
}

export interface ExplorationMetrics {
  /** First = the reference flight (the one set up before the dashboard). */
  flights: ExploredFlight[];
  /** Chip taps that changed the active flight. */
  switches: number;
  /** Visible time per flight id, ms (not counting time in the compare view or the what-if sheet). */
  flightMs: Record<string, number>;
  /** Times the compare view was opened. */
  compares: number;
  /** Visible time in the compare view, ms. */
  compareMs: number;
  /** "idA|idB" for each opening of the compare view and each pair change while it is open, in order (≤ 50). */
  comparePairs: string[];
  /**
   * Visible time in the "Try a different flight" sheet, ms. Absent in older
   * records (parsed as 0), when that time went to the flight behind the sheet.
   * sum(flightMs) + compareMs + whatIfMs ≈ activeMs.
   */
  whatIfMs?: number;
  alternativesOpened: number;
  whatIfs: number;
  /** Active flight when "done" was tapped (or at the last snapshot). */
  endedOnFlightId: string;
  /** Last "I'd prefer this one" (null if none). */
  preferredFlightId: string | null;
}

export type WouldSwitch = "yes" | "no" | "not_sure" | "didnt_look";

// ── Session record (one per participant session) ────────────────────────────

export interface FlightSummary {
  flightId: string;
  flightNumber: string;
  airline: string;
  /** "JFK → LAX" */
  route: string;
  aircraft: string;
  bodyType: BodyType;
  airborneMin: number;
  smoothnessScore: number;
  maxIntensity: Intensity;
  daysUntil: number;
  forecastMode: ForecastMode;
}

export interface DeviceInfo {
  type: DeviceType;
  userAgent: string;
  viewportW: number;
  viewportH: number;
  touch: boolean;
}

export interface SessionRecord {
  schemaVersion: 1;
  /** UUID v4. */
  sessionId: string;
  /** Increments on every save. The database ignores writes with a lower seq. */
  seq: number;
  createdAt: string;
  updatedAt: string;
  /** Set when the post-survey is submitted. */
  completedAt: string | null;
  /** Step the participant was on when this copy was saved. */
  step: Step;
  variant: Variant;
  variantSource: VariantSource;
  /** True when the link had ?test=1 (team testing). */
  isTest: boolean;
  /** Optional label from ?p=<label> on the link, to find a specific person's session. "" if none. */
  participant?: string;
  device: DeviceInfo;
  pre: PreSurvey;
  flightInput: FlightInput | null;
  flight: FlightSummary | null;
  dashboard: DashboardMetrics | null;
  post: PostSurvey;
  /** Optional follow-up email from the debrief screen; "" if none. */
  email: string;
}

// ── API ─────────────────────────────────────────────────────────────────────

/** Where the backend keeps records: Supabase, a local JSON file (dev), or nothing configured. */
export type StorageKind = "supabase" | "file" | "none";

/** POST /api/responses → */
export interface SaveResponse {
  ok: boolean;
  storage: StorageKind;
  error?: string;
}

/** GET /api/responses?key=ADMIN_KEY → */
export interface ListResponse {
  ok: boolean;
  storage: StorageKind;
  responses: SessionRecord[];
  error?: string;
}
