/** Rutgers GPT scope: New Brunswick only (for now). */

export const RUTGERS_AGENT_SCOPE = "Rutgers University–New Brunswick" as const;

export const NB_SUBCAMPUSES = [
  "College Avenue",
  "Busch",
  "Livingston",
  "Cook/Douglass",
] as const;

export type NbSubcampus = (typeof NB_SUBCAMPUSES)[number];

/** SOC / Schedule of Classes campus code for all NB sub-campuses */
export const NB_SOC_CAMPUS_CODE = "NB" as const;

export type RutgersSocCampus = typeof NB_SOC_CAMPUS_CODE;

export function normalizeNbSubcampus(value: string | undefined): NbSubcampus {
  const v = value?.trim();
  if (v === "Busch" || v === "Livingston" || v === "Cook/Douglass") return v;
  if (/cook|douglass|c-d/i.test(v ?? "")) return "Cook/Douglass";
  if (/livi|livingston/i.test(v ?? "")) return "Livingston";
  if (/busch/i.test(v ?? "")) return "Busch";
  return "College Avenue";
}
