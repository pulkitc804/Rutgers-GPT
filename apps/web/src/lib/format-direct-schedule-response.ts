/** Render SOC planner output directly — avoids small LLMs mangling precomputed plans. */
export function formatDirectScheduleResponse(params: {
  brief: string;
  socFound: number;
  totalCourses: number;
  year: number;
  termLabel: string;
}): string {
  const { brief, socFound, totalCourses, year, termLabel } = params;
  const termName = termLabel === "Fall" ? "Fall" : termLabel === "Spring" ? "Spring" : termLabel;

  const lead =
    socFound > 0
      ? `Here is your **${termName} ${year}** Rutgers–New Brunswick plan from **live SOC** (${socFound}/${totalCourses} courses with sections). Section examples and the sample weekly grid are below.`
      : `I pulled your **${termName} ${year}** course list, but **SOC returned no sections** for every course (catalog may not be open or the fetch failed). Use the SOC links below — do not treat meeting times as known.`;

  const truth =
    socFound > 0
      ? "Truth confidence: High — section data from SOC in this session."
      : "Truth confidence: Low — no live SOC sections; verify on sis.rutgers.edu before registering.";

  return `${lead}\n\n${brief}\n\n${truth}`;
}
