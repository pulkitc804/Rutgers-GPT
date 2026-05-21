/** One course to fetch from SOC for schedule planning (any major, any term). */
export type PlannerCourseTarget = {
  subject: string;
  courseNumber: string;
  title: string;
  credits: number;
  priority?: "required" | "recommended";
  notes?: string;
};
