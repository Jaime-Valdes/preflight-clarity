import type { CrewInfo } from "@preflight/shared/types";

/*
 * "Who flies your plane": what the rules guarantee for every airline pilot,
 * by the rule set the airline flies under (docs/FEASIBILITY.md). Nothing here
 * is about a particular person — airlines don't publish who will fly a given
 * flight, and pilot records are private. Pure, no React.
 */

export type CrewRole = "captain" | "first_officer" | "relief";

export interface RoleFacts {
  role: CrewRole;
  /** "Captain", "First Officer", "Relief pilot", "2 relief pilots" */
  title: string;
  /** One line on what the role does on the flight deck. */
  duty: string;
  /** Rules this role meets beyond what every pilot on board meets. */
  facts: string[];
}

export interface CrewFacts {
  roles: RoleFacts[];
  /** Rules every pilot on board meets. */
  everyPilot: string[];
  /** Paragraphs for the "How pilots are trained and checked" explainer. */
  training: string[];
}

/** "the national aviation authority" stays lower case mid-sentence; "FAA" stays as is. */
function regulatorName(crew: CrewInfo): string {
  return crew.regulator.trim() || "the national aviation authority";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function crewFacts(crew: CrewInfo, model: string): CrewFacts {
  const regulator = regulatorName(crew);
  const relief = crew.pilots - 2;

  const reliefRole = (facts: string[]): RoleFacts => ({
    role: "relief",
    title: relief === 1 ? "Relief pilot" : `${relief} relief pilots`,
    duty:
      relief === 1
        ? "Takes over during the cruise so every pilot gets a proper rest on a long flight."
        : "Take over during the cruise so every pilot gets a proper rest on a long flight.",
    facts,
  });

  if (crew.regime === "faa") {
    const roles: RoleFacts[] = [
      {
        role: "captain",
        title: "Captain",
        duty: "In command of the flight and responsible for every decision on board.",
        facts: [
          "Airline Transport Pilot certificate (1,500+ flight hours)",
          "At least 1,000 hours of airline flying before commanding (14 CFR 121.436)",
        ],
      },
      {
        role: "first_officer",
        title: "First Officer",
        duty: "Shares the flying with the captain and cross-checks every step.",
        facts: ["Airline Transport Pilot certificate (1,500+ flight hours, fewer after approved military or university training)"],
      },
    ];
    if (relief > 0) roles.push(reliefRole(["The same certificate, type rating and checks as the pilots they relieve"]));
    return {
      roles,
      everyPilot: [
        `Type rating for the ${model}`,
        "Simulator checks every 6–12 months",
        "Regular FAA medicals",
        "FAA rest rules (Part 117) limit duty time and require rest before every flight",
      ],
      training: [
        "To fly for a US airline, a pilot earns an Airline Transport Pilot certificate: written, oral and flight tests, after at least 1,500 flight hours (750–1,250 for graduates of approved military or university programs).",
        `Each aircraft model needs its own type rating, earned in full-motion simulators and finished on real flights alongside a training captain. Before anyone commands an airline flight, they also need 1,000 hours of airline flying.`,
        "After that, pilots go back to the simulator every 6–12 months to practise unusual situations and are checked on real flights. A current FAA medical is renewed every 6 or 12 months, depending on age.",
        "FAA Part 117 caps how long pilots can be on duty and sets the rest they get before each flight. On long flights, relief pilots let the crew take turns resting.",
      ],
    };
  }

  if (crew.regime === "easa") {
    const roles: RoleFacts[] = [
      {
        role: "captain",
        title: "Captain",
        duty: "In command of the flight and responsible for every decision on board.",
        facts: [`Airline Transport Pilot Licence (ATPL) under ${regulator} rules`],
      },
      {
        role: "first_officer",
        title: "First Officer",
        duty: "Shares the flying with the captain and cross-checks every step.",
        facts: [`Airline pilot licence under ${regulator} rules, with the ATPL exams passed`],
      },
    ];
    if (relief > 0) roles.push(reliefRole(["The same licence, type rating and checks as the pilots they relieve"]));
    return {
      roles,
      everyPilot: [
        `Type rating for the ${model}`,
        "Operator proficiency checks every 6 months",
        "Regular medicals",
        `${regulator} flight-time limits`,
      ],
      training: [
        `Airline pilots under ${regulator} rules pass a set of airline transport theory exams and a flight test for their licence; captains hold the full Airline Transport Pilot Licence.`,
        "Each aircraft model needs its own type rating, earned in full-motion simulators and finished on real flights alongside a training captain.",
        "Every 6 months, each pilot passes an operator proficiency check in the simulator, and once a year a line check on a real flight. The medical is renewed every year, more often for older pilots.",
        "Flight-time limits cap duty hours and set the rest pilots get before each flight. On long flights, relief pilots let the crew take turns resting.",
      ],
    };
  }

  const roles: RoleFacts[] = [
    {
      role: "captain",
      title: "Captain",
      duty: "In command of the flight and responsible for every decision on board.",
      facts: [`Airline transport pilot licence from ${regulator}, under ICAO standards`],
    },
    {
      role: "first_officer",
      title: "First Officer",
      duty: "Shares the flying with the captain and cross-checks every step.",
      facts: [`Commercial or airline transport pilot licence from ${regulator}, under ICAO standards`],
    },
  ];
  if (relief > 0) roles.push(reliefRole(["The same licence, type rating and checks as the pilots they relieve"]));
  return {
    roles,
    everyPilot: [
      `Type rating for the ${model}`,
      "Recurrent simulator checks",
      "Regular medicals",
      `Rest limits set by ${regulator}`,
    ],
    training: [
      `${capitalize(regulator)} licenses airline pilots under ICAO standards, the international rules every country's aviation authority follows.`,
      "Each aircraft model needs its own type rating, earned in full-motion simulators and finished on real flights alongside a training captain.",
      "Pilots go back to the simulator for recurrent checks, usually twice a year, and renew their medical every 6–12 months.",
      "Rest limits cap duty hours and set the rest pilots get before each flight. On long flights, relief pilots let the crew take turns resting.",
    ],
  };
}

/** "2 pilots · licensed and type-rated on the A321neo" / "3 pilots · relief crew so they can rest" */
export function crewTeaserLine(crew: CrewInfo, model: string): string {
  if (crew.pilots > 2) return `${crew.pilots} pilots · relief crew so they can rest`;
  return `${crew.pilots} pilots · licensed and type-rated on the ${model}`;
}
