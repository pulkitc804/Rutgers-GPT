import type { PlannerCourseTarget } from "./planner-types";

/**
 * Advisory first-year CS (SAS, New Brunswick) course targets — optional preset only.
 * Students must confirm requirements in Degree Navigator — not official degree audit.
 */

/** Typical Fall semester targets for a first-year CS major on NB (≈15–17 cr). */
export const CS_FIRST_YEAR_FALL_NB: PlannerCourseTarget[] = [
  {
    subject: "198",
    courseNumber: "111",
    title: "Introduction to Computer Science",
    credits: 4,
    priority: "required",
    notes: "Core CS start; placement may allow 112 in spring if AP/bridge credit.",
  },
  {
    subject: "640",
    courseNumber: "151",
    title: "Calculus I for Mathematical and Physical Sciences",
    credits: 4,
    priority: "required",
    notes: "If MATH placement is higher, 152 or 291 may apply instead — check placement.",
  },
  {
    subject: "355",
    courseNumber: "101",
    title: "Expository Writing I",
    credits: 3,
    priority: "required",
  },
  {
    subject: "730",
    courseNumber: "101",
    title: "Logic, Reasoning, and Persuasion (SAS humanities/social alternative)",
    credits: 3,
    priority: "recommended",
    notes: "Common SAS elective slot; swap for another approved SAS core if already planned.",
  },
];

export const CS_FIRST_YEAR_SPRING_NB: PlannerCourseTarget[] = [
  {
    subject: "198",
    courseNumber: "112",
    title: "Data Structures",
    credits: 4,
    priority: "required",
    notes: "Usually after 111; requires 111 or equivalent credit.",
  },
  {
    subject: "640",
    courseNumber: "152",
    title: "Calculus II for Mathematical and Physical Sciences",
    credits: 4,
    priority: "required",
  },
  {
    subject: "355",
    courseNumber: "102",
    title: "Research in the Disciplines",
    credits: 3,
    priority: "recommended",
  },
];
