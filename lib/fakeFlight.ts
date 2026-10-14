// STUB — owned by the generator agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
import type { Flight, FlightInput } from "./types";

/** Uppercases known IATA codes, trims free text, validates the date. */
export function normalizeInput(input: FlightInput): FlightInput {
  return { origin: input.origin.trim(), destination: input.destination.trim(), date: input.date };
}

/** Deterministic: the same (normalized) input always returns identical data. */
export function generateFlight(input: FlightInput): Flight {
  void input;
  throw new Error("generateFlight is not implemented yet");
}
