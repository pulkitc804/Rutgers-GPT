/**
 * Canonical Rutgers facts tied to primary official URLs.
 * Only add entries you can point to on a Rutgers-owned page or live API.
 */

export type VerifiedFact = {
  id: string;
  domain: "dining" | "transit" | "academics" | "campus";
  claim: string;
  primarySourceUrl: string;
  sourceName: string;
};

/** Official endpoints the app proxies or calls directly */
export const PRIMARY_API_SOURCES = {
  passio: {
    name: "Passio GO (Rutgers)",
    url: "https://rutgers.passiogo.com/",
    domains: ["transit"] as const,
  },
  soc: {
    name: "Schedule of Classes (SOC)",
    url: "https://sis.rutgers.edu/soc/",
    domains: ["academics"] as const,
  },
  diningFoodPro: {
    name: "Rutgers Dining FoodPro (menuportal23)",
    url: "https://menuportal23.dining.rutgers.edu/",
    domains: ["dining"] as const,
  },
  diningPortal: {
    name: "Rutgers Dining",
    url: "https://dining.rutgers.edu/",
    domains: ["dining"] as const,
  },
  degreeNavigator: {
    name: "Degree Navigator",
    url: "https://dn.rutgers.edu/",
    domains: ["academics"] as const,
  },
  canvas: {
    name: "Canvas",
    url: "https://canvas.rutgers.edu/",
    domains: ["academics"] as const,
  },
} as const;

export const VERIFIED_CAMPUS_FACTS: VerifiedFact[] = [
  {
    id: "dining-atrium-campus",
    domain: "dining",
    claim:
      "The Atrium is inside the College Avenue Student Center on the College Avenue campus (126 College Ave) — not Livingston or Cook/Douglass.",
    primarySourceUrl: "https://food.rutgers.edu/places-eat",
    sourceName: "Rutgers Dining — Places to Eat (College Avenue section)",
  },
  {
    id: "dining-livi-commons",
    domain: "dining",
    claim: "Livingston Dining Commons is on Livingston campus — a separate facility from The Atrium.",
    primarySourceUrl:
      "https://menuportal23.dining.rutgers.edu/foodpro/legacy/legacyindex.aspx?locationNum=04",
    sourceName: "Rutgers Dining FoodPro (location 04 = Livingston Dining Commons)",
  },
  {
    id: "campus-nb-subcampuses",
    domain: "campus",
    claim:
      "Rutgers GPT covers New Brunswick only: College Avenue, Busch, Livingston, and Cook/Douglass — cross-campus buses are normal.",
    primarySourceUrl: "https://newbrunswick.rutgers.edu/",
    sourceName: "Rutgers New Brunswick",
  },
  {
    id: "transit-passio-nb",
    domain: "transit",
    claim: "Live Rutgers–New Brunswick bus ETAs are published via Passio GO (rutgers.passiogo.com).",
    primarySourceUrl: "https://rutgers.passiogo.com/",
    sourceName: "Passio GO",
  },
];

export function formatVerifiedFactsBlock(topics: ("dining" | "transit" | "academics" | "campus")[]): string {
  const set = new Set(topics);
  const rows = VERIFIED_CAMPUS_FACTS.filter((f) => set.has(f.domain));
  if (!rows.length) return "";
  const lines = [
    "Verified campus facts (canonical — prefer over model memory; cite primarySourceUrl when repeating):",
    ...rows.map(
      (f) => `- ${f.claim} [${f.sourceName}](${f.primarySourceUrl})`,
    ),
  ];
  return lines.join("\n");
}

export function detectVerifiedTopics(text: string): ("dining" | "transit" | "academics" | "campus")[] {
  const t = text.toLowerCase();
  const out = new Set<"dining" | "transit" | "academics" | "campus">();
  if (/\b(atrium|dining|meal|food|hungry|livi|livingston\s+dining|busch\s+dining)\b/.test(t)) out.add("dining");
  if (/\b(bus|passio|shuttle|stop\s*\d|eta|transit)\b/.test(t)) out.add("transit");
  if (/\b(soc|class|course|schedule|section|credit|major)\b/.test(t)) out.add("academics");
  if (/\b(college ave|busch|livi|livingston|cook|douglass|c-d|campus)\b/.test(t)) out.add("campus");
  return [...out];
}
