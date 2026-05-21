import { detectSchedulePlanningIntent } from "@/lib/schedule-planning-intent";

export type AgentActionIntent = {
  schedule: ReturnType<typeof detectSchedulePlanningIntent>;
  dining: boolean;
  transit: boolean;
  wellness: boolean;
};

export function detectActionIntent(text: string): AgentActionIntent {
  const t = text.toLowerCase();
  return {
    schedule: detectSchedulePlanningIntent(text),
    dining: /\b(atrium|dining|menu|meal|food|hungry|foodpro)\b/.test(t),
    transit: /\b(bus|passio|shuttle|stop\s*\d|eta|next bus|ru-?screw)\b/.test(t),
    wellness: /\b(caps|wellness|mental|therapy|timelycare|counseling|health\.rutgers)\b/.test(t),
  };
}
