import type { Flight, FlightSummary, ForecastStatus, RouteHistory } from "./types";

/** Days before departure when a detailed (not historical) forecast starts. */
export const FORECAST_HORIZON_DAYS = 10;
/** Days before departure when a seasonal outlook replaces pure route history. */
export const OUTLOOK_HORIZON_DAYS = 30;

/**
 * How sure we can be about the turbulence forecast, given how far away the
 * flight is. Far-out flights fall back to route history (this covers the
 * "months before" part of the risky assumption).
 */
export function getForecastStatus(daysUntil: number, history: RouteHistory): ForecastStatus {
  const flights = history.flightsAnalyzed.toLocaleString("en-US");

  if (daysUntil > OUTLOOK_HORIZON_DAYS) {
    return {
      mode: "history",
      confidence: "low",
      confidenceLevel: 2,
      confidenceLabel: "Early estimate",
      basis: `Based on ${flights} past flights on this route in ${history.month}`,
      note: `Your forecast sharpens as the date gets closer. Detailed forecasts start about ${FORECAST_HORIZON_DAYS} days before departure.`,
    };
  }

  if (daysUntil > FORECAST_HORIZON_DAYS) {
    return {
      mode: "outlook",
      confidence: "moderate",
      confidenceLevel: 3,
      confidenceLabel: "Moderate confidence",
      basis: `Seasonal outlook plus ${flights} past flights on this route`,
      note: `Detailed forecasts start about ${FORECAST_HORIZON_DAYS} days before departure and update daily after that.`,
    };
  }

  if (daysUntil > 2) {
    return {
      mode: "forecast",
      confidence: "moderate",
      confidenceLevel: 4,
      confidenceLabel: "Moderate confidence",
      basis: "Latest forecast models for your route and departure time",
      note: "Updated every 6 hours. Timing usually firms up within 48 hours of departure.",
    };
  }

  return {
    mode: "forecast",
    confidence: "high",
    confidenceLevel: 5,
    confidenceLabel: "High confidence",
    basis: "Latest forecast models, pilot reports and your planned flight path",
    note: "Updated every hour until departure.",
  };
}

/** Compact flight description stored with each session record. */
export function summarizeFlight(flight: Flight, daysUntil: number): FlightSummary {
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    airline: flight.airline.name,
    route: `${flight.origin.code} → ${flight.destination.code}`,
    aircraft: flight.aircraft.fullName,
    bodyType: flight.aircraft.bodyType,
    airborneMin: flight.airborneMin,
    smoothnessScore: flight.smoothness.score,
    maxIntensity: flight.turbulence.maxIntensity,
    daysUntil,
    forecastMode: getForecastStatus(daysUntil, flight.turbulence.history).mode,
  };
}
