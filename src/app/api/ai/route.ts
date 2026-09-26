import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type Kind = "alert" | "tip" | "fertiliser";

const SYSTEM =
  "You are Wai, an assistant for New Zealand farmers monitoring troughs, dams, bores and paddock soil with sensor probes. " +
  "Write for a busy farmer: plain English, short, specific, practical. No jargon, no hedging. " +
  "Reply with JSON only.";

const PROMPTS: Record<Kind, (ctx: unknown) => string> = {
  alert: (ctx) =>
    `A probe raised an alert. kind is one of level (water low), soil (soil moisture dry or saturated), ` +
    `quality (turbidity/pH/TDS out of limits), moved (GPS outside its geofence), offline (probe stopped reporting). Data: ${JSON.stringify(ctx)}\n` +
    `Return JSON {"wrong": string, "cause": string, "action": string, "risk": string}. ` +
    `wrong = what is wrong (1 sentence, use the numbers). cause = most likely cause given the data (1-2 sentences). ` +
    `action = what to do now (2-3 short steps separated by newlines). risk = what happens in the next 24-48 h if ignored (1-2 sentences).`,
  tip: (ctx) =>
    `Current farm status (water levels, % full, hours until empty, soil moisture, open alerts): ${JSON.stringify(ctx)}\n` +
    `Return JSON {"title": string, "body": string}. title = 2-5 word verdict. ` +
    `body = one or two sentences: the single most useful suggestion or prediction for today.`,
  fertiliser: (ctx) =>
    `Should the farmer apply nitrogen fertiliser to pasture now? Soil moisture and the next 48 h rain forecast: ${JSON.stringify(ctx)}\n` +
    `Return JSON {"verdict": "Apply now" | "Wait for rain" | "Too wet — leaching risk", "reason": string}. ` +
    `reason = 1-2 sentences using the numbers. Light rain (2-25 mm) after applying washes urea in; ` +
    `dry soil with no rain loses it to volatilisation; wet soil or heavy rain leaches it.`,
};

type Ctx = Record<string, unknown>;
const n = (x: unknown) => (typeof x === "number" && isFinite(x) ? x : null);
const hrs = (h: number | null) => (h == null ? null : h < 1 ? `${Math.max(1, Math.round(h * 60))} minutes` : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);

// Rule-based diagnosis per alert kind, used when there is no key or the call fails, so the demo never breaks
function fallbackAlert(c: Ctx) {
  const p = String(c.probe ?? "This probe");
  const now = (c.now ?? {}) as Ctx;
  const soil = n(now.soil_pct);
  switch (c.kind) {
    case "level": {
      const empty = hrs(n(c.empty_in_h));
      return {
        wrong: `${p} is only ${Math.round(n(now.pct_full) ?? 0)}% full (${Math.round(n(now.level_cm) ?? 0)} cm${n(c.depth_cm) ? ` of ${c.depth_cm} cm` : ""}).`,
        cause: empty
          ? `The level is still falling, so stock are drinking faster than it refills. Usually a stuck or slow ball valve, low supply pressure or a leak.`
          : `The level dropped and hasn't recovered, which points to the supply: a stuck ball valve, a blocked inlet or the pump not running.`,
        action: "Check the ball valve and inlet are running.\nWalk the supply line for leaks or a kinked pipe.\nIf stock are in the paddock, open a backup water source.",
        risk: empty
          ? `At this rate it runs dry in about ${empty}. Stock without water lose condition fast, and milkers drop yield within a day.`
          : "If the supply has stopped, the trough will run dry and stock will go without water, which hits condition and yield within a day.",
      };
    }
    case "soil":
      return soil != null && soil > 50
        ? {
            wrong: `Soil at ${p} is saturated at ${Math.round(soil)}% moisture.`,
            cause: "Heavy rain, irrigation left on, or poor drainage in this paddock has filled the soil.",
            action: "Keep heavy stock off or graze on-off to avoid pugging.\nHold off fertiliser and effluent until it drains.\nCheck irrigation isn't running here.",
            risk: "Grazing now pugs the paddock and sets pasture back for weeks, and any nitrogen applied will leach.",
          }
        : {
            wrong: `Soil at ${p} is dry at ${Math.round(soil ?? 0)}% moisture.`,
            cause: "Not enough recent rain or irrigation for this paddock; wind and sun are drying the topsoil.",
            action: "Irrigate this paddock if you can.\nHold off fertiliser until rain is due.\nWatch pasture cover and plan feed if growth stalls.",
            risk: "Pasture growth slows over the next few days, and fertiliser put on now mostly sits on the surface and is lost.",
          };
    case "moved":
      return {
        wrong: `${p} is ${Math.round(n(c.distance_m) ?? 0)} m from its home position (geofence ${c.geofence_m ?? 50} m).`,
        cause: "Stock may have knocked or dragged the trough or probe, someone moved it on purpose, or it has been taken.",
        action: "Open the map to see where it is now.\nIf nobody moved it, go and check it.\nIf it was moved on purpose, set its new home on the Device tab.",
        risk: "Its readings no longer describe the trough you think they do, and a missing probe means no alerts for that water.",
      };
    case "offline":
      return {
        wrong: `${p} hasn't reported since ${c.last_seen ?? "a while ago"} (it usually reports every ${c.interval ?? "few seconds"}).`,
        cause: n(c.via_lora)
          ? "Most often the LoRa bridge laptop is off or lost internet, or the probe is out of radio range or out of power."
          : "Most often the probe has lost power or Wi-Fi, or it is out of range of the router.",
        action: "Check the bridge laptop is running and online.\nCheck the probe has power (LED on the board).\nMove it closer or check the antenna.",
        risk: "Until it's back you get no level, soil or movement alerts for this spot.",
      };
    default:
      return {
        wrong: "Water quality at this probe has dropped sharply in the last few minutes.",
        cause: "A sudden jump in turbidity usually means sediment or runoff has entered the water, often from stock in the water or a damaged trough inlet.",
        action: "Check the water source and inlet now.\nMove stock off this water until it clears.\nFlush or clean the trough if needed.",
        risk: "Stock drinking dirty water can lose condition and get sick within a day or two, and runoff may breach your regional council limits.",
      };
  }
}

// Rule-based tip so the fallback still matches what the probes say
function fallbackTip(c: Ctx) {
  type P = { name: string; alerts?: string[]; pct_full?: number | null; empty_in_h?: number | null; soil_pct?: number | null };
  const probes = (c.probes ?? []) as P[];
  const bad = probes.filter((p) => p.alerts?.length);
  if (bad.length)
    return {
      title: `Check ${bad[0].name} now`,
      body: `${bad[0].alerts![0]} at ${bad[0].name}${bad.length > 1 ? `, and look at ${bad.slice(1).map((p) => p.name).join(", ")} too` : ""}.`,
    };
  const soon = probes.filter((p) => p.empty_in_h != null && p.empty_in_h < 24).sort((a, b) => a.empty_in_h! - b.empty_in_h!)[0];
  if (soon) return { title: `Watch ${soon.name}`, body: `${soon.name} is ${Math.round(soon.pct_full ?? 0)}% full and on track to run dry in ${hrs(soon.empty_in_h!)}. Check the inlet today.` };
  const soils = probes.map((p) => p.soil_pct).filter((x): x is number => x != null);
  const dry = soils.length ? Math.min(...soils) : null;
  if (dry != null && dry < 30)
    return { title: "Water is fine, soil drying", body: `Every trough has water, but soil is down to ${Math.round(dry)}% in places. Hold fertiliser until rain is due.` };
  return { title: "All looks good", body: "Water levels are steady and soil moisture is in range, so no trough checks are needed today." };
}

// Next 48 h rain from Open-Meteo (free, no key), cached per ~1 km for an hour
const forecasts = new Map<string, { at: number; rain: number | null; chance: number | null }>();
async function forecast(lat: number, lng: number) {
  const k = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = forecasts.get(k);
  if (hit && Date.now() - hit.at < 3_600_000) return hit;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,precipitation_probability&forecast_hours=48&timezone=auto`,
      { signal: AbortSignal.timeout(5000) },
    );
    const j = (await r.json()) as { hourly?: { precipitation?: number[]; precipitation_probability?: (number | null)[] } };
    const p = j.hourly?.precipitation;
    if (!p) throw new Error("no forecast");
    const out = {
      at: Date.now(),
      rain: +p.reduce((a, b) => a + (b ?? 0), 0).toFixed(1),
      chance: Math.max(0, ...(j.hourly?.precipitation_probability ?? []).map((x) => x ?? 0)),
    };
    forecasts.set(k, out);
    return out;
  } catch {
    return { at: Date.now(), rain: null, chance: null };
  }
}

const VERDICTS = ["Apply now", "Wait for rain", "Too wet — leaching risk"];
function fallbackFertiliser(soil: number | null, rain: number | null) {
  const s = soil == null ? null : Math.round(soil);
  const mm = rain == null ? "an unknown amount of rain (forecast unavailable)" : `${rain} mm of rain`;
  if (s != null && s >= 80)
    return { verdict: VERDICTS[2], reason: `Soil is already wet at ${s}%, with ${mm} forecast in the next 48 h. Nitrogen put on now is likely to wash below the roots; wait until it drains.` };
  if (rain != null && rain >= 25)
    return { verdict: VERDICTS[2], reason: `${rain} mm of rain is forecast in the next 48 h, enough to wash nitrogen past the roots even with soil at ${s ?? "–"}%. Apply once the heavy rain has passed.` };
  if (s != null && s < 25 && (rain == null || rain < 2))
    return { verdict: VERDICTS[1], reason: `Soil is dry at ${s}% with ${mm} due in 48 h. Urea on dry ground loses nitrogen to the air, so wait for 5-10 mm of rain.` };
  if (rain != null && rain >= 2)
    return { verdict: VERDICTS[0], reason: `Soil is ${s ?? "–"}% and ${mm} is coming in the next 48 h, enough to wash the fertiliser in without leaching.` };
  return { verdict: VERDICTS[0], reason: `Soil is moist at ${s ?? "–"}%, so fertiliser will dissolve and reach the roots even with ${mm} forecast.` };
}

async function ask(kind: Kind, context: unknown) {
  const res = await openai!.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: PROMPTS[kind](context) },
    ],
  });
  return JSON.parse(res.choices[0].message.content ?? "{}");
}

export async function POST(req: Request) {
  const { kind, context } = (await req.json()) as { kind: Kind; context: Ctx };
  if (!(kind in PROMPTS)) return Response.json({ error: "bad kind" }, { status: 400 });

  let ctx: unknown = context;
  let fallback: Record<string, unknown>;
  if (kind === "fertiliser") {
    const lat = n(context?.lat), lng = n(context?.lng), soil = n(context?.soil_pct);
    const f = lat != null && lng != null ? await forecast(lat, lng) : { rain: null, chance: null };
    const extra = { rain_48h_mm: f.rain, rain_chance_pct: f.chance, soil_pct: soil };
    ctx = { ...context, ...extra };
    fallback = { ...fallbackFertiliser(soil, f.rain), ...extra };
  } else fallback = kind === "tip" ? fallbackTip(context ?? {}) : fallbackAlert(context ?? {});

  if (!openai) return Response.json({ ...fallback, source: "fallback" });
  try {
    const json = await ask(kind, ctx);
    // keep the verdict to one of the three the card knows
    if (kind === "fertiliser") {
      const v = VERDICTS.find((x) => String(json.verdict ?? "").startsWith(x.split(" ")[0]));
      if (v) json.verdict = v;
      else {
        delete json.verdict;
        delete json.reason;
      }
    }
    return Response.json({ ...fallback, ...json, source: "openai" });
  } catch (e) {
    console.error("AI call failed:", (e as Error).message);
    return Response.json({ ...fallback, source: "fallback" });
  }
}
