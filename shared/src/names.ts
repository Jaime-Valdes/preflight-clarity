/*
 * Fake crew names from many cultural backgrounds, mixed genders, no
 * celebrities. Pools are weighted by the airline's home country so a
 * Lufthansa crew and a Japan Airlines crew read as such, with a share of
 * international names everywhere (airlines hire globally).
 */
import type { Rng } from "./random";

export interface NamePool {
  given: readonly string[];
  family: readonly string[];
}

export type PoolId =
  | "english"
  | "spanish"
  | "portuguese"
  | "french"
  | "german"
  | "italian"
  | "dutch"
  | "nordic"
  | "slavic"
  | "greek"
  | "turkish"
  | "arabic"
  | "persian"
  | "hebrew"
  | "indian"
  | "chinese"
  | "cantonese"
  | "japanese"
  | "korean"
  | "vietnamese"
  | "thai"
  | "filipino"
  | "malay"
  | "westAfrican"
  | "eastAfrican"
  | "southernAfrican"
  | "oceania";

export const NAME_POOLS: Record<PoolId, NamePool> = {
  english: {
    given: ["James", "Daniel", "Thomas", "Matthew", "Andrew", "Benjamin", "Samuel", "Nathan", "Owen", "Liam", "Ethan", "Caleb", "Marcus", "Andre", "Jamal", "Malik", "Terrell", "Grace", "Emily", "Hannah", "Olivia", "Charlotte", "Rebecca", "Sarah", "Laura", "Megan", "Claire", "Natalie", "Rachel", "Jasmine", "Aaliyah", "Monique", "Imani", "Nia", "Jordan", "Taylor", "Morgan"],
    family: ["Carter", "Mitchell", "Brooks", "Hayes", "Sullivan", "Walker", "Bennett", "Cooper", "Foster", "Hughes", "Reynolds", "Marshall", "Fletcher", "Dawson", "Griffin", "Harper", "Whitaker", "Barnes", "Palmer", "Lawson", "Richardson", "Holloway", "Parker", "Wallace", "Jenkins", "Murphy", "O'Neill", "Fitzgerald", "Doyle", "Gallagher", "MacLeod", "Campbell", "Fraser", "Reid", "Evans", "Thompson", "Robinson", "Coleman", "Freeman", "Washington", "Booker", "Jackson", "Simmons"],
  },
  spanish: {
    given: ["Carlos", "Mateo", "Alejandro", "Diego", "Javier", "Andrés", "Rafael", "Santiago", "Luis", "Tomás", "Sofía", "Lucía", "Valentina", "Gabriela", "Camila", "Mariana", "Isabel", "Elena", "Paula", "Daniela"],
    family: ["Rodríguez", "Morales", "Herrera", "Castillo", "Vargas", "Delgado", "Navarro", "Ortega", "Ramírez", "Salazar", "Mendoza", "Cordero", "Aguilar", "Fuentes", "Ibáñez", "Serrano", "Reyes", "Peña", "Medina", "Flores", "Torres", "Guzmán", "Rojas", "Molina"],
  },
  portuguese: {
    given: ["João", "Tiago", "Rafael", "Bruno", "Gustavo", "Felipe", "Pedro", "Beatriz", "Mariana", "Ana", "Inês", "Carolina", "Juliana", "Larissa"],
    family: ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Almeida", "Carvalho", "Ribeiro", "Ferreira", "Costa", "Martins", "Rocha", "Barbosa", "Moreira"],
  },
  french: {
    given: ["Antoine", "Julien", "Nicolas", "Mathieu", "Olivier", "Étienne", "Hugo", "Camille", "Chloé", "Manon", "Léa", "Céline", "Amélie", "Élodie", "Margaux", "Sophie"],
    family: ["Lefebvre", "Moreau", "Girard", "Rousseau", "Fontaine", "Garnier", "Chevalier", "Marchand", "Dubois", "Lambert", "Perrin", "Mercier", "Renaud", "Blanchard", "Bouchard", "Tremblay", "Gagnon"],
  },
  german: {
    given: ["Stefan", "Lukas", "Jonas", "Markus", "Tobias", "Florian", "Sebastian", "Matthias", "Anna", "Katharina", "Lena", "Julia", "Sabine", "Nadine", "Franziska", "Hanna"],
    family: ["Brandt", "Schäfer", "Weber", "Fischer", "Hoffmann", "Krüger", "Richter", "Lehmann", "Vogel", "Winkler", "Keller", "Zimmermann", "Berger", "Huber", "Baumann", "Wagner", "Neumann"],
  },
  italian: {
    given: ["Marco", "Luca", "Alessandro", "Matteo", "Davide", "Andrea", "Giulia", "Francesca", "Chiara", "Elena", "Sara", "Valentina"],
    family: ["Ricci", "Conti", "Esposito", "Romano", "Greco", "Marino", "Ferrari", "Bianchi", "Colombo", "Gallo", "De Luca", "Moretti", "Rinaldi"],
  },
  dutch: {
    given: ["Daan", "Bram", "Sven", "Jeroen", "Pieter", "Thijs", "Joost", "Lotte", "Sanne", "Femke", "Anouk", "Maaike"],
    family: ["de Vries", "Jansen", "Bakker", "Visser", "van Dijk", "Smit", "de Boer", "Mulder", "van den Berg", "Meijer", "Vos", "Brouwer", "Dekker", "Hendriks"],
  },
  nordic: {
    given: ["Erik", "Lars", "Magnus", "Henrik", "Anders", "Oskar", "Mikael", "Johan", "Astrid", "Ingrid", "Freja", "Maja", "Linnea", "Sofie", "Kristine", "Elin"],
    family: ["Lindqvist", "Andersson", "Johansson", "Nilsson", "Berg", "Hansen", "Larsen", "Jensen", "Nielsen", "Halvorsen", "Dahl", "Haugen", "Strand", "Virtanen", "Korhonen", "Mäkinen", "Laine", "Eriksson", "Bergström"],
  },
  slavic: {
    given: ["Piotr", "Tomasz", "Marek", "Jakub", "Michał", "Jan", "Agnieszka", "Katarzyna", "Zofia", "Petra", "Tereza", "Eva", "Gábor", "Zsófia"],
    family: ["Nowak", "Kowalski", "Wiśniewski", "Zieliński", "Mazur", "Kaczmarek", "Novák", "Dvořák", "Svoboda", "Horváth", "Kovács"],
  },
  greek: {
    given: ["Nikos", "Dimitris", "Giorgos", "Andreas", "Eleni", "Maria", "Katerina", "Sofia"],
    family: ["Papadopoulos", "Nikolaidis", "Georgiou", "Antoniou", "Konstantinou", "Ioannidis"],
  },
  turkish: {
    given: ["Emre", "Mehmet", "Can", "Burak", "Kerem", "Elif", "Zeynep", "Ayşe", "Selin", "Defne"],
    family: ["Yılmaz", "Kaya", "Demir", "Çelik", "Şahin", "Öztürk", "Aydın", "Arslan"],
  },
  arabic: {
    given: ["Omar", "Khalid", "Tariq", "Faisal", "Yusuf", "Hassan", "Rashid", "Sami", "Layla", "Noor", "Amira", "Mariam", "Hana", "Dana", "Lina", "Salma"],
    family: ["Al-Mansouri", "Al-Hashimi", "Haddad", "Al-Farsi", "Nasser", "Khalil", "Saleh", "Al-Amin", "Karim", "Mahmoud", "Darwish", "Al-Sayed", "Abdallah", "Hakim"],
  },
  persian: {
    given: ["Arash", "Darius", "Kian", "Reza", "Navid", "Shirin", "Leila", "Yasmin", "Roya"],
    family: ["Farahani", "Rostami", "Karimi", "Hosseini", "Tehrani"],
  },
  hebrew: {
    given: ["Eitan", "Yonatan", "Amir", "Lior", "Yael", "Noa", "Tamar", "Shira"],
    family: ["Levi", "Cohen", "Peretz", "Mizrahi", "Friedman", "Shapiro", "Katz", "Avraham"],
  },
  indian: {
    given: ["Arjun", "Rohan", "Vikram", "Aditya", "Rahul", "Karan", "Nikhil", "Sanjay", "Priya", "Ananya", "Meera", "Kavya", "Neha", "Divya", "Pooja", "Anjali", "Deepa"],
    family: ["Sharma", "Patel", "Mehta", "Iyer", "Nair", "Reddy", "Menon", "Kapoor", "Bhatt", "Rao", "Desai", "Chopra", "Krishnan", "Banerjee", "Mukherjee", "Singh", "Joshi", "Pillai", "Malhotra"],
  },
  chinese: {
    given: ["Wei", "Jun", "Hao", "Ming", "Yan", "Mei", "Xiu", "Lan", "Jing", "Hui", "Fang", "Ying", "Qiang", "Bo", "Lei", "Xin"],
    family: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou", "Lin", "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "Gao", "Luo"],
  },
  cantonese: {
    given: ["Ka-Ming", "Wai-Kit", "Chun-Ho", "Ho-Yin", "Tsz-Kin", "Siu-Ling", "Wing-Yan", "Mei-Ling", "Hiu-Tung", "Ka-Yan", "Vivian", "Jason", "Alvin", "Carmen"],
    family: ["Cheung", "Wong", "Chan", "Lau", "Leung", "Ng", "Lam", "Ho", "Tang", "Yip", "Tsang", "Kwok", "Lim", "Tan", "Goh", "Koh", "Teo"],
  },
  japanese: {
    given: ["Kenji", "Hiroshi", "Takeshi", "Daisuke", "Yuki", "Haruto", "Ren", "Sota", "Yuto", "Aiko", "Yui", "Sakura", "Hana", "Mio", "Rin", "Emi", "Nanami", "Ayaka"],
    family: ["Takahashi", "Sato", "Suzuki", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki", "Matsumoto", "Inoue", "Kimura", "Hayashi", "Shimizu", "Mori", "Okada"],
  },
  korean: {
    given: ["Ji-ho", "Min-jun", "Seo-jun", "Do-yun", "Hyun-woo", "Joon-ho", "Ha-eun", "Seo-yeon", "Ji-woo", "Soo-ah", "Ye-jin", "Min-seo"],
    family: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim", "Han", "Shin", "Oh", "Seo", "Kwon"],
  },
  vietnamese: {
    given: ["Minh", "Linh", "Anh", "Huy", "Thanh", "Mai", "Phuong", "Tuan", "Quang", "Ngoc"],
    family: ["Nguyen", "Tran", "Le", "Pham", "Hoang", "Vu", "Dang", "Bui"],
  },
  thai: {
    given: ["Somchai", "Anong", "Niran", "Kanya", "Chai", "Malee", "Pim", "Tanawat"],
    family: ["Srisuwan", "Chaiyasit", "Wattana", "Rattanakorn", "Boonmee", "Suwan"],
  },
  filipino: {
    given: ["Jose", "Maria", "Paolo", "Angelo", "Marielle", "Kristine", "Carlo", "Bea", "Miguel", "Andrea"],
    family: ["Santos", "Reyes", "Cruz", "Bautista", "Villanueva", "dela Cruz", "Garcia", "Mendoza", "Ramos", "Aquino"],
  },
  malay: {
    given: ["Adi", "Budi", "Dewi", "Putri", "Rizky", "Siti", "Ahmad", "Farah", "Aisyah", "Hafiz", "Nurul", "Amir"],
    family: ["Wijaya", "Santoso", "Kusuma", "Pratama", "Abdullah", "Rahman", "Ismail", "Hassan", "Yusof", "Ibrahim"],
  },
  westAfrican: {
    given: ["Adebayo", "Chinedu", "Emeka", "Ngozi", "Chiamaka", "Folake", "Tunde", "Ifeoma", "Kwame", "Kofi", "Ama", "Abena"],
    family: ["Okafor", "Adeyemi", "Okonkwo", "Eze", "Balogun", "Afolabi", "Mensah", "Boateng", "Owusu", "Asante"],
  },
  eastAfrican: {
    given: ["Wanjiru", "Kamau", "Amani", "Zawadi", "Baraka", "Tesfaye", "Abebe", "Selam", "Hana", "Dawit", "Mekdes", "Yonas"],
    family: ["Mwangi", "Kamau", "Otieno", "Njoroge", "Wanjiku", "Odhiambo", "Tesfaye", "Bekele", "Haile", "Girma", "Alemu"],
  },
  southernAfrican: {
    given: ["Thabo", "Sipho", "Naledi", "Lerato", "Zanele", "Pieter", "Johan", "Anke", "Ayanda", "Nomvula"],
    family: ["Dlamini", "Nkosi", "Mokoena", "Khumalo", "van der Merwe", "Botha", "Naidoo", "Pillay", "Mthembu", "Ndlovu"],
  },
  oceania: {
    given: ["Lachlan", "Hamish", "Callum", "Jack", "Hayley", "Tegan", "Aroha", "Wiremu", "Rangi", "Manaia"],
    family: ["Walker", "Hughes", "Te Rangi", "Ngata", "Parata", "Williams", "Brown", "Taylor", "Wilson", "Davies"],
  },
};

type Mix = ReadonlyArray<readonly [PoolId, number]>;

/** A broad international mix, used for globally hiring carriers and as a top-up. */
const GLOBAL_MIX: Mix = [
  ["english", 30],
  ["spanish", 10],
  ["indian", 7],
  ["chinese", 5],
  ["arabic", 5],
  ["french", 5],
  ["german", 4],
  ["italian", 3],
  ["portuguese", 3],
  ["nordic", 3],
  ["korean", 3],
  ["japanese", 3],
  ["filipino", 3],
  ["westAfrican", 3],
  ["eastAfrican", 2],
  ["slavic", 2],
  ["greek", 2],
  ["turkish", 2],
  ["persian", 2],
  ["hebrew", 1],
  ["vietnamese", 1],
  ["dutch", 1],
];

const COUNTRY_MIX: Record<string, Mix> = {
  US: [["english", 55], ["spanish", 15], ["indian", 4], ["chinese", 3], ["filipino", 3], ["korean", 2], ["westAfrican", 2], ["arabic", 2], ["italian", 2], ["german", 2], ["french", 1], ["vietnamese", 1], ["persian", 1], ["nordic", 1], ["slavic", 1], ["greek", 1], ["hebrew", 1], ["portuguese", 1], ["japanese", 1], ["eastAfrican", 1]],
  CA: [["english", 45], ["french", 25], ["indian", 8], ["chinese", 6], ["filipino", 4], ["arabic", 3], ["spanish", 2], ["korean", 2], ["italian", 2], ["westAfrican", 1], ["persian", 1], ["nordic", 1]],
  GB: [["english", 65], ["indian", 10], ["westAfrican", 4], ["arabic", 3], ["chinese", 3], ["spanish", 3], ["slavic", 3], ["italian", 2], ["french", 2], ["nordic", 2], ["greek", 1], ["turkish", 1], ["persian", 1]],
  IE: [["english", 85], ["slavic", 5], ["spanish", 3], ["indian", 3], ["french", 2], ["portuguese", 2]],
  FR: [["french", 75], ["arabic", 8], ["portuguese", 4], ["spanish", 3], ["italian", 3], ["english", 3], ["westAfrican", 2], ["vietnamese", 2]],
  DE: [["german", 75], ["turkish", 8], ["slavic", 5], ["italian", 3], ["english", 3], ["greek", 2], ["spanish", 2], ["persian", 2]],
  CH: [["german", 50], ["french", 25], ["italian", 12], ["english", 5], ["spanish", 3], ["portuguese", 3], ["turkish", 2]],
  AT: [["german", 80], ["slavic", 10], ["turkish", 4], ["italian", 3], ["english", 3]],
  NL: [["dutch", 78], ["english", 6], ["indian", 4], ["arabic", 3], ["turkish", 3], ["german", 3], ["spanish", 3]],
  SE: [["nordic", 80], ["english", 6], ["german", 4], ["arabic", 3], ["persian", 3], ["slavic", 2], ["indian", 2]],
  DK: [["nordic", 85], ["english", 6], ["german", 5], ["turkish", 2], ["arabic", 2]],
  NO: [["nordic", 85], ["english", 6], ["german", 3], ["slavic", 3], ["indian", 3]],
  FI: [["nordic", 85], ["english", 6], ["german", 3], ["slavic", 3], ["indian", 3]],
  IS: [["nordic", 90], ["english", 10]],
  ES: [["spanish", 82], ["portuguese", 5], ["english", 5], ["italian", 4], ["french", 4]],
  PT: [["portuguese", 82], ["spanish", 8], ["english", 5], ["french", 5]],
  IT: [["italian", 82], ["spanish", 5], ["english", 5], ["german", 4], ["french", 4]],
  GR: [["greek", 85], ["english", 8], ["italian", 4], ["slavic", 3]],
  PL: [["slavic", 88], ["english", 6], ["german", 6]],
  TR: [["turkish", 85], ["arabic", 5], ["english", 5], ["german", 5]],
  AE: [["arabic", 30], ["english", 20], ["indian", 12], ["french", 5], ["german", 5], ["spanish", 4], ["southernAfrican", 4], ["filipino", 4], ["italian", 3], ["nordic", 3], ["portuguese", 3], ["greek", 2], ["turkish", 2], ["persian", 2], ["korean", 1]],
  QA: [["arabic", 30], ["english", 18], ["indian", 12], ["french", 5], ["german", 5], ["spanish", 4], ["southernAfrican", 4], ["filipino", 4], ["italian", 3], ["nordic", 3], ["portuguese", 3], ["greek", 2], ["turkish", 2], ["persian", 2], ["korean", 1], ["japanese", 1], ["malay", 1]],
  IL: [["hebrew", 88], ["english", 8], ["arabic", 4]],
  IN: [["indian", 95], ["english", 5]],
  CN: [["chinese", 95], ["english", 5]],
  HK: [["cantonese", 55], ["english", 25], ["chinese", 8], ["indian", 4], ["filipino", 3], ["malay", 3], ["japanese", 2]],
  TW: [["chinese", 85], ["cantonese", 8], ["english", 7]],
  JP: [["japanese", 92], ["english", 6], ["korean", 2]],
  KR: [["korean", 92], ["english", 6], ["japanese", 2]],
  SG: [["cantonese", 45], ["malay", 18], ["indian", 15], ["english", 15], ["chinese", 4], ["filipino", 3]],
  MY: [["malay", 55], ["cantonese", 28], ["indian", 12], ["english", 5]],
  TH: [["thai", 78], ["english", 10], ["cantonese", 7], ["malay", 5]],
  PH: [["filipino", 92], ["english", 6], ["spanish", 2]],
  ID: [["malay", 92], ["english", 4], ["cantonese", 4]],
  VN: [["vietnamese", 92], ["english", 5], ["french", 3]],
  MX: [["spanish", 94], ["english", 6]],
  CO: [["spanish", 95], ["english", 5]],
  PE: [["spanish", 92], ["english", 4], ["japanese", 2], ["chinese", 2]],
  CL: [["spanish", 85], ["portuguese", 8], ["english", 4], ["german", 3]],
  AR: [["spanish", 85], ["italian", 10], ["english", 5]],
  BR: [["portuguese", 88], ["spanish", 5], ["italian", 4], ["japanese", 3]],
  PA: [["spanish", 92], ["english", 8]],
  AU: [["oceania", 35], ["english", 40], ["chinese", 5], ["indian", 5], ["italian", 3], ["greek", 3], ["vietnamese", 3], ["filipino", 2], ["arabic", 2], ["korean", 2]],
  NZ: [["oceania", 45], ["english", 40], ["indian", 5], ["chinese", 4], ["filipino", 2], ["korean", 2], ["cantonese", 2]],
  ZA: [["southernAfrican", 55], ["english", 30], ["indian", 10], ["portuguese", 5]],
  EG: [["arabic", 92], ["english", 8]],
  MA: [["arabic", 75], ["french", 20], ["spanish", 5]],
  ET: [["eastAfrican", 92], ["english", 8]],
  KE: [["eastAfrican", 85], ["english", 8], ["indian", 7]],
  NG: [["westAfrican", 92], ["english", 8]],
  GH: [["westAfrican", 92], ["english", 8]],
};

export interface PersonName {
  name: string;
  initials: string;
  family: string;
}

function isPoolId(id: string): id is PoolId {
  return id in NAME_POOLS;
}

function pickPoolId(rng: Rng, country: string): PoolId {
  const mix = COUNTRY_MIX[country] ?? GLOBAL_MIX;
  const entries = mix.filter((e): e is readonly [PoolId, number] => isPoolId(e[0]) && e[1] > 0);
  return rng.weighted(entries);
}

export function initialsOf(given: string, family: string): string {
  const first = given.replace(/[^\p{L}]/gu, "")[0] ?? "";
  const lastWord = family.trim().split(" ").pop() ?? "";
  const last = lastWord.replace(/[^\p{L}]/gu, "")[0] ?? "";
  return (first + last).toUpperCase();
}

/** One fake name that fits the airline's home country (with some global mixing). */
export function pickName(rng: Rng, country: string): PersonName {
  const pool = NAME_POOLS[pickPoolId(rng, country)];
  const given = rng.pick(pool.given);
  const family = rng.pick(pool.family);
  return { name: `${given} ${family}`, initials: initialsOf(given, family), family };
}

/** Two crew members with different family names. */
export function pickCrewNames(rng: Rng, country: string): [PersonName, PersonName] {
  const captain = pickName(rng, country);
  let officer = pickName(rng, country);
  for (let i = 0; i < 5 && officer.family === captain.family; i++) officer = pickName(rng, country);
  return [captain, officer];
}

const US_MARKETS = new Set(["US", "PR"]);

const CAPTAIN_BACKGROUNDS_US = [
  "Air Force veteran",
  "Navy veteran",
  "Former flight instructor",
  "Check pilot — trains other pilots",
  "Started flying gliders at 16",
  "Former regional airline captain",
  "Flew cargo before passengers",
  "Aerospace engineering degree before flying",
  "Mentors new first officers",
  "Volunteer pilot for a medical charity",
  "Former airline simulator instructor",
  "Grew up around a family flying club",
];

const CAPTAIN_BACKGROUNDS_INTL = [
  "Former military pilot",
  "Former flight instructor",
  "Check pilot — trains other pilots",
  "Started flying gliders at 16",
  "Joined through the airline's cadet program",
  "Flew regional turboprops before jets",
  "Aeronautical engineering degree before flying",
  "Mentors new first officers",
  "Former airline simulator instructor",
  "Flew cargo before passengers",
  "Grew up around a family flying club",
];

const FIRST_OFFICER_BACKGROUNDS = [
  "Former flight instructor",
  "Started flying gliders at 15",
  "Joined from a regional airline",
  "Former corporate jet pilot",
  "Aviation university graduate",
  "Flew air ambulance before airlines",
  "Flew survey planes before airlines",
  "Airline cadet program graduate",
  "Former military pilot",
  "Instructs in the simulator between trips",
  "Grew up around a family flying club",
];

export function pickBackground(rng: Rng, role: "Captain" | "First Officer", country: string): string {
  if (role === "First Officer") return rng.pick(FIRST_OFFICER_BACKGROUNDS);
  return rng.pick(US_MARKETS.has(country) ? CAPTAIN_BACKGROUNDS_US : CAPTAIN_BACKGROUNDS_INTL);
}

/** Uber-style compliments passengers leave for pilots. */
export const PILOT_BADGES: ReadonlyArray<readonly [string, number]> = [
  ["Smooth landings", 10],
  ["Clear announcements", 9],
  ["Calm voice", 8],
  ["Keeps you informed", 8],
  ["Friendly welcome", 7],
  ["Gentle turns", 6],
  ["Explains the bumps", 6],
  ["On-time arrivals", 5],
  ["Great with nervous flyers", 5],
  ["Warm goodbye at the door", 4],
];

export function pickBadges(rng: Rng, count: number): string[] {
  const remaining = PILOT_BADGES.slice();
  const out: string[] = [];
  while (out.length < count && remaining.length > 0) {
    const badge = rng.weighted(remaining);
    out.push(badge);
    remaining.splice(
      remaining.findIndex((e) => e[0] === badge),
      1,
    );
  }
  return out;
}
