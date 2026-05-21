/**
 * Rutgers campus events — best-effort fetch from public events site.
 */

export type CampusEvent = {
  title: string;
  start?: string;
  url?: string;
  location?: string;
  campus?: string;
};

const EVENT_SOURCES = [
  "https://events.rutgers.edu/api/2/events?days=14&pp=20",
  "https://events.rutgers.edu/events.json",
];

function parseEventsPayload(json: unknown): CampusEvent[] {
  const out: CampusEvent[] = [];
  if (!json || typeof json !== "object") return out;

  const arr =
    Array.isArray(json)
      ? json
      : Array.isArray((json as { events?: unknown }).events)
        ? (json as { events: unknown[] }).events
        : Array.isArray((json as { data?: unknown }).data)
          ? (json as { data: unknown[] }).data
          : [];

  for (const item of arr.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? o.event_title ?? o.name ?? "").trim();
    if (!title) continue;
    out.push({
      title,
      start: String(o.start ?? o.starts_on ?? o.date ?? ""),
      url: String(o.url ?? o.link ?? o.event_url ?? ""),
      location: String(o.location ?? o.location_name ?? ""),
      campus: String(o.campus ?? ""),
    });
  }
  return out;
}

export const EventsService = {
  async fetchUpcomingEvents(campus: "NB" = "NB"): Promise<{
    events: CampusEvent[];
    source: string;
    fetchedAt: string;
    note?: string;
  }> {
    const fetchedAt = new Date().toISOString();
    for (const url of EVENT_SOURCES) {
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/json", "User-Agent": "RutgersGPT/1.0" },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const json = await res.json();
        let events = parseEventsPayload(json);
        if (campus) {
          const c = campus.toLowerCase();
          events = events.filter(
            (e) =>
              !e.campus ||
              e.campus.toLowerCase().includes(c) ||
              (c === "nb" && /new brunswick|busch|livi|college ave/i.test(`${e.title} ${e.location}`)),
          );
        }
        if (events.length) {
          return { events, source: url, fetchedAt };
        }
      } catch {
        /* try next */
      }
    }

    return {
      events: [
        {
          title: "Browse Rutgers Events (live feed unavailable)",
          url: "https://events.rutgers.edu/",
          start: "",
          location: "New Brunswick",
        },
      ],
      source: "fallback",
      fetchedAt,
      note: "Could not parse events API — use the official calendar link.",
    };
  },
};
