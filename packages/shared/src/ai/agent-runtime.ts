/** Server-safe re-exports for Rutgers agent tool execution. */
export { BusService } from "../services/BusService";
export { AcademicService, type SocTermCode } from "../services/AcademicService";
export { SchedulePlannerService } from "../services/SchedulePlannerService";
export { EventsService } from "../services/EventsService";
export {
  DEFAULT_DINING_LOCATIONS,
  DiningService,
  buildVerifiedDiningSnapshot,
  parseMenuHtml,
} from "../services/DiningService";
export {
  PRIMARY_API_SOURCES,
  VERIFIED_CAMPUS_FACTS,
  detectVerifiedTopics,
  formatVerifiedFactsBlock,
} from "./verified-sources";
export {
  NB_SOC_CAMPUS_CODE,
  NB_SUBCAMPUSES,
  RUTGERS_AGENT_SCOPE,
  normalizeNbSubcampus,
  type NbSubcampus,
} from "./nb-scope";
export type { RutgersStudentProfile } from "./student-profile";
export { formatStudentProfileBlock } from "./student-profile";
