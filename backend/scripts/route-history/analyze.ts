/*
 * Version D's route history (docs/REAL_DATA.md, "Status: route history from MADIS"): one month of
 * airliner turbulence readings (NOAA MADIS ACARS, the eddy dissipation rate that many US airliners
 * report automatically, several times a minute at cruise) → flights → counts per US route pair.
 *
 * Pure: no I/O, no clock. madis-month.ts feeds it; backend/scripts/test.ts drives it on made-up readings.
 *
 * The method (checked on January 2026 against 132 routes' own trips: within about 3 points on average):
 *  - A flight: readings with the same encrypted tail and the same (truncated) airport codes, split
 *    where they stop for more than 90 minutes. Its cruise: readings within 15% of its own highest
 *    altitude and above 3,000 m (so short hops, which cruise low, count too); at least 3 of them.
 *  - A flight's route: the public archive truncates the airport codes to three letters ("KLA" is LAX or
 *    LAS), so of the catalogue airports each code could be, the pair whose great circle the track
 *    follows (mean cross-track distance under 60 nm, running from origin to destination).
 *  - The flights counted for a route pair, both directions: its own identified trips (their whole
 *    cruise), plus any other flight that cruised along at least half of its great circle within 50 nm
 *    (their cruise on that stretch). Smooth: nothing above EDR 0.10 (ICAO's "nil" for a medium jet);
 *    calm: nothing at 0.20 or above (below ICAO's "moderate").
 *  - The time of day: an own trip's first reading (its departure) in the origin's local time; another
 *    flight's first reading over the route, in the local time of the end it came from.
 *  - Where bumps come: for flights that were not smooth, where along the route (A → B, thirds) the
 *    strongest reading was.
 */

import { C, CELLS, pairKey, windowOf } from "@preflight/shared/routeHistory";

export { C, CELLS, pairKey };

export const SMOOTH_MAX_EDR = 0.1;
export const CALM_BELOW_EDR = 0.2;
const GAP_S = 90 * 60;
const CRUISE_FRACTION = 0.85;
const CRUISE_FLOOR_M = 3000;
const MIN_CRUISE_POINTS = 3;
const ROUTE_FIT_NM = 60;
const CORRIDOR_NM = 50;
const MIN_COVER = 0.5;
const EARTH_NM = 3440;

// The time-of-day windows and the counts' layout (CELLS, C) are shared/src/routeHistory.ts's.

export interface Readings {
  length: number;
  /** Dictionary ids: tail into `tails`, origin and destination into `codes`. */
  tail: Int32Array;
  o3: Int32Array;
  d3: Int32Array;
  /** Seconds since 1970 (UTC). */
  t: Float64Array;
  /** Metres. */
  alt: Float32Array;
  lat: Float32Array;
  lon: Float32Array;
  /** The reading's peak EDR (MADIS maxEDR). */
  edr: Float32Array;
  codes: readonly string[];
}

/** Collects readings file by file into growing typed arrays. */
export class ReadingsBuilder {
  private n = 0;
  private cap = 1 << 16;
  private cols = this.alloc(this.cap);
  private tailIds = new Map<string, number>();
  private codeIds = new Map<string, number>();
  private codeList: string[] = [];

  private alloc(cap: number) {
    return {
      tail: new Int32Array(cap),
      o3: new Int32Array(cap),
      d3: new Int32Array(cap),
      t: new Float64Array(cap),
      alt: new Float32Array(cap),
      lat: new Float32Array(cap),
      lon: new Float32Array(cap),
      edr: new Float32Array(cap),
    };
  }

  private code(s: string): number {
    let id = this.codeIds.get(s);
    if (id === undefined) {
      id = this.codeList.length;
      this.codeIds.set(s, id);
      this.codeList.push(s);
    }
    return id;
  }

  get length(): number {
    return this.n;
  }

  add(tail: string, o3: string, d3: string, t: number, alt: number, lat: number, lon: number, edr: number): void {
    if (!tail || !Number.isFinite(t) || !Number.isFinite(alt) || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180) || !(edr >= 0 && edr < 10)) return;
    if (this.n === this.cap) {
      const next = this.alloc(this.cap * 2);
      for (const k of Object.keys(next) as Array<keyof typeof next>) next[k].set(this.cols[k] as never);
      this.cols = next;
      this.cap *= 2;
    }
    let tid = this.tailIds.get(tail);
    if (tid === undefined) this.tailIds.set(tail, (tid = this.tailIds.size));
    const i = this.n++;
    const c = this.cols;
    c.tail[i] = tid;
    c.o3[i] = this.code(o3);
    c.d3[i] = this.code(d3);
    c.t[i] = t;
    c.alt[i] = alt;
    c.lat[i] = lat;
    c.lon[i] = lon;
    c.edr[i] = edr;
  }

  build(): Readings {
    const n = this.n;
    const c = this.cols;
    return {
      length: n,
      tail: c.tail.slice(0, n),
      o3: c.o3.slice(0, n),
      d3: c.d3.slice(0, n),
      t: c.t.slice(0, n),
      alt: c.alt.slice(0, n),
      lat: c.lat.slice(0, n),
      lon: c.lon.slice(0, n),
      edr: c.edr.slice(0, n),
      codes: [...this.codeList],
    };
  }
}

export interface RouteAirport {
  code: string;
  lat: number;
  lon: number;
  tz: string;
  /** The ICAO code ("KJFK", "PHNL"). */
  icao: string;
}

export interface MonthCounts {
  /** Every flight matched to a route pair (its whole cruise): [flights, smooth, calm]. */
  national: [number, number, number];
  flights: number;
  /** Flights matched to a catalogue route pair. */
  identified: number;
  /** "JFK-LAX" (codes in alphabetical order) → CELLS counts; pairs with no flight counted are left out. */
  pairs: Record<string, number[]>;
}

type Vec = [number, number, number];
const RAD = Math.PI / 180;
const vec = (lat: number, lon: number): Vec => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

interface Flight {
  /** Indices into the readings, in time order. */
  all: number[];
  cruise: number[];
  o3: string;
  d3: string;
  lat0: number;
  lat1: number;
  lon0: number;
  lon1: number;
}

interface Geo {
  A: Vec;
  N: Vec;
  /** Unit vector 90° along the great circle from A. */
  Q: Vec;
  T: number;
}

function geoOf(a: RouteAirport, b: RouteAirport): Geo {
  const A = vec(a.lat, a.lon);
  const B = vec(b.lat, b.lon);
  const c = cross(A, B);
  const len = Math.hypot(c[0], c[1], c[2]);
  const N: Vec = [c[0] / len, c[1] / len, c[2] / len];
  return { A, N, Q: cross(N, A), T: Math.acos(Math.max(-1, Math.min(1, dot(A, B)))) };
}

/** Local hour at `tz` for a UTC instant, cached by the hour (time zones change on the hour in the US). */
const hourCache = new Map<string, number>();
const formatters = new Map<string, Intl.DateTimeFormat>();
function localHour(t: number, tz: string): number {
  const h = Math.floor(t / 3600);
  const key = `${tz}|${h}`;
  let v = hourCache.get(key);
  if (v === undefined) {
    let f = formatters.get(tz);
    if (!f) formatters.set(tz, (f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" })));
    v = Number(f.format(new Date(h * 3600 * 1000))) % 24;
    hourCache.set(key, v);
  }
  return v;
}

export function analyzeMonth(r: Readings, airports: readonly RouteAirport[], pairs: readonly string[]): MonthCounts {
  const flights = buildFlights(r);
  const byCode = new Map(airports.map((a) => [a.code, a]));
  const candidates = new Map<string, RouteAirport[]>();
  const cands = (code3: string): RouteAirport[] => {
    let hit = candidates.get(code3);
    if (!hit) candidates.set(code3, (hit = code3.length === 3 ? airports.filter((a) => a.icao.startsWith(code3)) : []));
    return hit;
  };
  const pairSet = new Set(pairs);
  const counts: Record<string, number[]> = {};
  const cell = (pk: string) => (counts[pk] ??= new Array<number>(CELLS).fill(0));
  const national: [number, number, number] = [0, 0, 0];
  const ownPair: Array<string | null> = new Array(flights.length).fill(null);
  let identified = 0;

  const peakOf = (idx: readonly number[]) => {
    let best = idx[0];
    for (const i of idx) if (r.edr[i] > r.edr[best]) best = i;
    return best;
  };
  const record = (pk: string, peakIdx: number, along: number, T: number, dirAB: boolean, hour: number, own: boolean) => {
    const c = cell(pk);
    const e = r.edr[peakIdx];
    const smooth = e <= SMOOTH_MAX_EDR;
    c[C.n]++;
    if (smooth) c[C.smooth]++;
    if (e < CALM_BELOW_EDR) c[C.calm]++;
    if (own) c[C.own]++;
    if (!smooth) c[C.where + Math.min(2, Math.max(0, Math.floor((3 * along) / T)))]++;
    const w = (dirAB ? C.ab : C.ba) + 2 * windowOf(hour);
    c[w]++;
    if (smooth) c[w + 1]++;
  };

  // Each flight's own route, where it can be told.
  for (let fi = 0; fi < flights.length; fi++) {
    const f = flights[fi];
    const route = routeFor(r, f, cands);
    if (!route) continue;
    const pk = pairKey(route.o.code, route.d.code);
    if (!pairSet.has(pk)) continue;
    const peak = peakOf(f.cruise);
    identified++;
    national[0]++;
    if (r.edr[peak] <= SMOOTH_MAX_EDR) national[1]++;
    if (r.edr[peak] < CALM_BELOW_EDR) national[2]++;
    ownPair[fi] = pk;
    const [aCode] = pk.split("-");
    const dirAB = route.o.code === aCode;
    const a = dirAB ? route.o : route.d;
    const b = dirAB ? route.d : route.o;
    const g = geoOf(a, b);
    const P = vec(r.lat[peak], r.lon[peak]);
    const along = Math.max(0, Math.min(g.T, Math.atan2(dot(P, g.Q), dot(P, g.A))));
    record(pk, peak, along, g.T, dirAB, localHour(r.t[f.all[0]], route.o.tz), true);
  }

  // Every other flight that cruised along a pair's great circle.
  const cruiseVecs = flights.map((f) => f.cruise.map((i) => vec(r.lat[i], r.lon[i])));
  for (const pk of pairs) {
    const [ac, bc] = pk.split("-");
    const a = byCode.get(ac);
    const b = byCode.get(bc);
    if (!a || !b) continue;
    const g = geoOf(a, b);
    const lat0 = Math.min(a.lat, b.lat) - 1;
    const lat1 = Math.max(a.lat, b.lat) + 1;
    const lon0 = Math.min(a.lon, b.lon) - 1.3;
    const lon1 = Math.max(a.lon, b.lon) + 1.3;
    for (let fi = 0; fi < flights.length; fi++) {
      const f = flights[fi];
      if (ownPair[fi] === pk) continue;
      if (f.lat1 < lat0 || f.lat0 > lat1 || f.lon1 < lon0 || f.lon0 > lon1) continue;
      const vs = cruiseVecs[fi];
      let lo = Infinity;
      let hi = -Infinity;
      let k = 0;
      let firstAlong = 0;
      let lastAlong = 0;
      let firstT = 0;
      let peak = -1;
      let peakAlong = 0;
      for (let j = 0; j < vs.length; j++) {
        const P = vs[j];
        if (Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(P, g.N))))) * EARTH_NM > CORRIDOR_NM) continue;
        const along = Math.atan2(dot(P, g.Q), dot(P, g.A));
        if (along < 0 || along > g.T) continue;
        const i = f.cruise[j];
        if (k === 0) {
          firstAlong = along;
          firstT = r.t[i];
        }
        lastAlong = along;
        if (peak < 0 || r.edr[i] > r.edr[peak]) {
          peak = i;
          peakAlong = along;
        }
        lo = Math.min(lo, along);
        hi = Math.max(hi, along);
        k++;
      }
      if (k < MIN_CRUISE_POINTS || hi - lo < MIN_COVER * g.T) continue;
      const dirAB = lastAlong >= firstAlong;
      record(pk, peak, peakAlong, g.T, dirAB, localHour(firstT, (dirAB ? a : b).tz), false);
    }
  }
  return { national, flights: flights.length, identified, pairs: counts };
}

/** Readings → flights with a cruise (see the header). */
function buildFlights(r: Readings): Flight[] {
  const order = new Uint32Array(r.length);
  for (let i = 0; i < r.length; i++) order[i] = i;
  const codes = r.codes.length + 1;
  const key = (i: number) => (r.tail[i] * codes + r.o3[i]) * codes + r.d3[i];
  order.sort((x, y) => key(x) - key(y) || r.t[x] - r.t[y]);
  const flights: Flight[] = [];
  let cur: number[] = [];
  const done = () => {
    if (cur.length === 0) return;
    let top = -Infinity;
    for (const i of cur) top = Math.max(top, r.alt[i]);
    const floor = Math.max(CRUISE_FRACTION * top, CRUISE_FLOOR_M);
    const cruise = cur.filter((i) => r.alt[i] >= floor);
    if (cruise.length >= MIN_CRUISE_POINTS) {
      let lat0 = Infinity;
      let lat1 = -Infinity;
      let lon0 = Infinity;
      let lon1 = -Infinity;
      for (const i of cruise) {
        lat0 = Math.min(lat0, r.lat[i]);
        lat1 = Math.max(lat1, r.lat[i]);
        lon0 = Math.min(lon0, r.lon[i]);
        lon1 = Math.max(lon1, r.lon[i]);
      }
      flights.push({ all: cur, cruise, o3: r.codes[r.o3[cur[0]]], d3: r.codes[r.d3[cur[0]]], lat0, lat1, lon0, lon1 });
    }
    cur = [];
  };
  for (let n = 0; n < order.length; n++) {
    const i = order[n];
    const prev = cur.length > 0 ? cur[cur.length - 1] : -1;
    if (prev >= 0 && (key(prev) !== key(i) || r.t[i] - r.t[prev] > GAP_S)) done();
    cur.push(i);
  }
  done();
  return flights;
}

/** The catalogue pair whose great circle the flight's track follows (see the header), or null. */
function routeFor(r: Readings, f: Flight, cands: (code3: string) => RouteAirport[]): { o: RouteAirport; d: RouteAirport } | null {
  const os = cands(f.o3);
  const ds = cands(f.d3);
  if (os.length === 0 || ds.length === 0) return null;
  const step = Math.max(1, Math.floor(f.all.length / 12));
  const sample: Vec[] = [];
  for (let j = 0; j < f.all.length; j += step) sample.push(vec(r.lat[f.all[j]], r.lon[f.all[j]]));
  let best: { o: RouteAirport; d: RouteAirport; off: number } | null = null;
  for (const o of os) {
    for (const d of ds) {
      if (o === d) continue;
      const g = geoOf(o, d);
      let off = 0;
      const along: number[] = [];
      for (const P of sample) {
        off += Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(P, g.N))))) * EARTH_NM;
        along.push(Math.acos(Math.max(-1, Math.min(1, dot(P, g.A)))));
      }
      off /= sample.length;
      const ordered = along[along.length - 1] >= along[0] - 0.002 && along.every((x) => x <= g.T + 0.03);
      if (ordered && (!best || off < best.off)) best = { o, d, off };
    }
  }
  return best && best.off <= ROUTE_FIT_NM ? { o: best.o, d: best.d } : null;
}
