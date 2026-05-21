/**
 * Rutgers GPT agent tools — shared schemas for Anthropic and Ollama function calling.
 */

import { NB_SUBCAMPUSES, RUTGERS_AGENT_SCOPE } from "./nb-scope";

const NB_SUBCAMPUS_ENUM = [...NB_SUBCAMPUSES];

export const RUTGERS_AGENT_TOOL_NAMES = [
  "get_live_transit",
  "get_dining_menu",
  "get_course_schedule",
  "plan_term_schedule",
  "plan_multi_course_schedule",
  "search_rutgers_knowledge",
  "get_canvas_guidance",
  "get_campus_events",
  "get_campus_info",
  "list_campus_resources",
] as const;

export type RutgersAgentToolName = (typeof RUTGERS_AGENT_TOOL_NAMES)[number];

export type RutgersAgentToolSpec = {
  name: RutgersAgentToolName;
  description: string;
  parameters: Record<string, unknown>;
};

export const RUTGERS_AGENT_TOOLS: RutgersAgentToolSpec[] = [
  {
    name: "search_rutgers_knowledge",
    description:
      "Search the Rutgers–New Brunswick knowledge base (College Ave, Busch, Livingston, Cook/Douglass, building hours, CS, Canvas, policies). Newark/Camden are out of scope.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query" },
        nbSubcampus: {
          type: "string",
          enum: NB_SUBCAMPUS_ENUM,
          description: "Optional NB sub-campus filter",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_live_transit",
    description:
      "Fetch live Passio GO bus ETAs. Use favorite stop and secondary stops from student profile when stopId omitted.",
    parameters: {
      type: "object",
      properties: {
        stopId: { type: "string", description: "Passio stop ID" },
        routeId: { type: "string", description: "Optional route filter" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_dining_menu",
    description:
      "Fetch today's menu from Rutgers Dining FoodPro (official menuportal23 HTML). Returns verified.campus from the preset registry — use that for location, not model memory. Presets: atrium (College Avenue / College Ave Student Center), livingston-dining (Livingston).",
    parameters: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "atrium = The Atrium in College Ave Student Center (College Avenue campus); livingston-dining = Livingston Dining Commons",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_course_schedule",
    description: "Fetch SOC sections for one course. Include year/term when planning ahead.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string" },
        courseNumber: { type: "string" },
        year: { type: "number" },
        term: { type: "string", enum: ["fall", "spring", "summer"] },
      },
      required: ["subject", "courseNumber"],
      additionalProperties: false,
    },
  },
  {
    name: "plan_term_schedule",
    description:
      "Universal term schedule planner for ANY major and ANY year. Fetches live SOC for each course, builds conflict-aware weekly grid. Uses student profile course list + optional courses arg. Optional track=cs-first-year only when user wants the CS freshman template and listed no courses. Double/triple major: pass ALL courses in one list.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        term: { type: "string", enum: ["fall", "spring", "summer"] },
        track: { type: "string", enum: ["cs-first-year"], description: "Optional CS FY template only" },
        courses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              courseNumber: { type: "string" },
            },
            required: ["subject", "courseNumber"],
          },
          description: "Courses to plan; merges with profile list",
        },
      },
      required: ["year", "term"],
      additionalProperties: false,
    },
  },
  {
    name: "plan_multi_course_schedule",
    description: "Alias of plan_term_schedule — same universal planner for any major/year/course list.",
    parameters: {
      type: "object",
      properties: {
        year: { type: "number" },
        term: { type: "string", enum: ["fall", "spring", "summer"] },
        courses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              courseNumber: { type: "string" },
            },
            required: ["subject", "courseNumber"],
          },
        },
      },
      required: ["year", "term"],
      additionalProperties: false,
    },
  },
  {
    name: "get_canvas_guidance",
    description:
      "Canvas and academic tool guidance for Rutgers (no login). Use when student asks about assignments portal, calendar sync, or NetID access.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["overview", "calendar", "assignments", "grades"],
          description: "What aspect of Canvas to explain",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_campus_events",
    description: "Fetch upcoming Rutgers–New Brunswick events (best-effort).",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "How many days ahead (default 14)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_campus_info",
    description:
      "New Brunswick orientation: College Avenue, Busch, Livingston, Cook/Douglass. Combines knowledge base + official links.",
    parameters: {
      type: "object",
      properties: {
        nbSubcampus: {
          type: "string",
          enum: NB_SUBCAMPUS_ENUM,
          description: "Which NB sub-campus to emphasize",
        },
        topic: {
          type: "string",
          enum: ["overview", "transit", "dining", "registration"],
          description: "Focus area",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_campus_resources",
    description: `Official link list for ${RUTGERS_AGENT_SCOPE} by category. Supplement with search_rutgers_knowledge for detail.`,
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["transit", "dining", "academics", "wellness", "involvement", "all"],
        },
      },
      required: ["category"],
      additionalProperties: false,
    },
  },
];

export function toAnthropicTools() {
  return RUTGERS_AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as { type: "object"; properties?: Record<string, unknown>; required?: string[] },
  }));
}

export function toOllamaTools() {
  return RUTGERS_AGENT_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
