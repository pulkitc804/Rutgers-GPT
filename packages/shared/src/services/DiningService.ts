/**
 * Dining: FoodPro menu portals (menuportal23) + food.rutgers.edu link discovery.
 */

export const MENU_PORTAL_BASE = "https://menuportal23.dining.rutgers.edu";
export const FOOD_RUTGERS_RETAIL_MENUS = "https://food.rutgers.edu/places-eat/retail-dining-menus";

export type DiningLocationPreset = {
  id: string;
  /** Human label shown to students and the agent */
  label: string;
  menuUrl: string;
  /** Canonical campus assignment — do not infer from LLM memory */
  campus: "Cook/Douglass" | "Livingston" | "Busch" | "College Avenue";
  locationNum: string;
  primarySourceUrl: string;
};

export const DEFAULT_DINING_LOCATIONS: DiningLocationPreset[] = [
  {
    id: "atrium",
    label: "The Atrium",
    campus: "College Avenue",
    locationNum: "13",
    menuUrl: `${MENU_PORTAL_BASE}/FoodPronet/pickmenu.aspx?sName=Rutgers+University+Dining&locationNum=13&locationName=The+Atrium&naFlag=1`,
    primarySourceUrl: `${MENU_PORTAL_BASE}/FoodPronet/pickmenu.aspx?sName=Rutgers+University+Dining&locationNum=13&locationName=The+Atrium&naFlag=1`,
  },
  {
    id: "livingston-dining",
    label: "Livingston Dining Commons",
    campus: "Livingston",
    locationNum: "04",
    menuUrl: `${MENU_PORTAL_BASE}/FoodPronet/pickmenu.aspx?sName=Rutgers+University+Dining&locationNum=04&locationName=Livingston+Dining+Commons&naFlag=1`,
    primarySourceUrl: `${MENU_PORTAL_BASE}/FoodPronet/pickmenu.aspx?sName=Rutgers+University+Dining&locationNum=04&locationName=Livingston+Dining+Commons&naFlag=1`,
  },
];

/** Agent-safe dining summary: canonical campus from preset, menu from live HTML only */
export function buildVerifiedDiningSnapshot(
  preset: DiningLocationPreset,
  parsed: ParsedDayMenu,
  summary: { headline: string; detail: string },
): {
  hallName: string;
  campus: string;
  primarySourceUrl: string;
  mealPeriod: string | null;
  menuDate: string | undefined;
  highlights: string;
  stationCount: number;
  dataSource: string;
} {
  return {
    hallName: preset.label,
    campus: preset.campus,
    primarySourceUrl: preset.primarySourceUrl,
    mealPeriod: parsed.meal,
    menuDate: parsed.dateLabel,
    highlights: summary.headline ? `${summary.headline}. ${summary.detail}` : summary.detail,
    stationCount: parsed.stations.filter((s) => s.items.length).length,
    dataSource: "Rutgers Dining FoodPro (live HTML fetch via official menu URL)",
  };
}

export type MealPeriod = string;

export type ParsedMenuStation = {
  title: string;
  items: string[];
};

export type ParsedDayMenu = {
  locationLabel: string;
  dateLabel?: string;
  meal: MealPeriod | null;
  stations: ParsedMenuStation[];
};

function extractMealFromForm(html: string): MealPeriod | null {
  const m = html.match(/mealName=([^&"'<>]+)/i);
  if (!m) return null;
  return decodeURIComponent(m[1].replace(/\+/g, " "));
}

function extractLocationName(html: string): string | undefined {
  const m = html.match(/locationName=([^&"'<>]+)/i);
  if (!m) return undefined;
  return decodeURIComponent(m[1].replace(/\+/g, " "));
}

function extractSelectedDateLabel(html: string): string | undefined {
  const m = html.match(/<option[^>]+selected[^>]*>([^<]+)<\/option>/i);
  return m?.[1]?.trim();
}

/** Regex-only parser (React Native / Node safe). */
export function parseMenuHtmlRegex(html: string, fallbackLabel?: string): ParsedDayMenu {
  const stations: ParsedMenuStation[] = [];
  const h3Matches: { index: number; title: string }[] = [];
  const h3Re = /<h3[^>]*>([^<]*)<\/h3>/gi;
  let hm: RegExpExecArray | null;
  while ((hm = h3Re.exec(html)) !== null) {
    h3Matches.push({
      index: hm.index,
      title: (hm[1] ?? "").replace(/^[-\s]+|[-\s]+$/g, "").trim() || "Menu",
    });
  }

  const recipeSource =
    '<input[^>]*name=["\']recipe["\'][^>]*id=["\']([^"\']+)["\'][^>]*\\/?>\\s*(?:&nbsp;|\\s)*<label[^>]*>([^<]+)<\\/label>';
  const recipeRe = new RegExp(recipeSource, "gi");

  if (!h3Matches.length) {
    const items: string[] = [];
    let rm: RegExpExecArray | null;
    while ((rm = recipeRe.exec(html)) !== null) {
      const name = (rm[2] ?? "").trim();
      if (name) items.push(name);
    }
    stations.push({ title: "Menu", items });
  } else {
    for (let i = 0; i < h3Matches.length; i++) {
      const start = h3Matches[i].index;
      const end = i + 1 < h3Matches.length ? h3Matches[i + 1].index : html.length;
      const slice = html.slice(start, end);
      const items: string[] = [];
      const localRe = new RegExp(recipeSource, "gi");
      let rm: RegExpExecArray | null;
      while ((rm = localRe.exec(slice)) !== null) {
        const name = (rm[2] ?? "").trim();
        if (name) items.push(name);
      }
      stations.push({ title: h3Matches[i].title, items });
    }
  }

  return {
    locationLabel: extractLocationName(html) ?? fallbackLabel ?? "Rutgers Dining",
    dateLabel: extractSelectedDateLabel(html),
    meal: extractMealFromForm(html),
    stations,
  };
}

function parseMenuHtmlDom(html: string, fallbackLabel?: string): ParsedDayMenu {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const stations: ParsedMenuStation[] = [];
  let current: ParsedMenuStation = { title: "Menu", items: [] };

  const pushCurrent = () => {
    if (current.items.length || current.title !== "Menu") stations.push(current);
  };

  const walker = doc.body;
  if (!walker) {
    return {
      locationLabel: fallbackLabel ?? "Unknown",
      meal: extractMealFromForm(html),
      stations: [],
    };
  }

  for (const el of Array.from(walker.querySelectorAll("h3, label"))) {
    if (el.tagName === "H3") {
      pushCurrent();
      const title = el.textContent?.trim() || "Menu";
      current = { title, items: [] };
      continue;
    }
    const label = el as HTMLLabelElement;
    const forId = label.getAttribute("for");
    if (!forId || !doc.getElementById(forId)) continue;
    const input = doc.getElementById(forId) as HTMLInputElement | null;
    if (!input || input.name !== "recipe") continue;
    const name = label.textContent?.trim();
    if (name) current.items.push(name);
  }
  pushCurrent();

  return {
    locationLabel: extractLocationName(html) ?? fallbackLabel ?? "Rutgers Dining",
    dateLabel: extractSelectedDateLabel(html),
    meal: extractMealFromForm(html),
    stations,
  };
}

export function parseMenuHtml(html: string, fallbackLabel?: string): ParsedDayMenu {
  if (typeof DOMParser !== "undefined") {
    try {
      return parseMenuHtmlDom(html, fallbackLabel);
    } catch {
      return parseMenuHtmlRegex(html, fallbackLabel);
    }
  }
  return parseMenuHtmlRegex(html, fallbackLabel);
}

export type RetailMenuLink = {
  href: string;
  label: string;
};

export const DiningService = {
  async fetchMenuDocument(url: string): Promise<string> {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`Dining menu HTTP ${res.status}`);
    return res.text();
  },

  /** Scrape food.rutgers.edu retail menus page for external menu URLs. */
  async fetchRetailMenuLinksFromFoodSite(): Promise<RetailMenuLink[]> {
    const res = await fetch(FOOD_RUTGERS_RETAIL_MENUS, { credentials: "omit" });
    if (!res.ok) throw new Error(`food.rutgers.edu HTTP ${res.status}`);
    const html = await res.text();
    const out: RetailMenuLink[] = [];
    const a = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = a.exec(html)) !== null) {
      const href = m[1];
      const label = (m[2] ?? "").trim().replace(/\s+/g, " ");
      if (!href || !label) continue;
      if (/pickmenu\.aspx|nutrislice\.com|menuportal|go\.rutgers\.edu/i.test(href)) {
        out.push({ href: href.startsWith("http") ? href : `https://food.rutgers.edu${href}`, label });
      }
    }
    return out;
  },

  async loadParsedMenu(presetOrUrl: DiningLocationPreset | string): Promise<ParsedDayMenu> {
    const url = typeof presetOrUrl === "string" ? presetOrUrl : presetOrUrl.menuUrl;
    const label = typeof presetOrUrl === "string" ? undefined : presetOrUrl.label;
    const html = await this.fetchMenuDocument(url);
    return parseMenuHtml(html, label);
  },

  summarizeNextMeal(parsed: ParsedDayMenu, maxItems = 6): { headline: string; detail: string } {
    const station = parsed.stations.find((s) => s.items.length);
    const items = station?.items.slice(0, maxItems) ?? [];
    const meal = parsed.meal ? `${parsed.meal}` : "Menu";
    const where = parsed.locationLabel;
    const headline = `${meal} · ${where}`;
    const detail = items.length ? items.join(" · ") : "No parsed items (page layout may have changed).";
    return { headline, detail };
  },
};
