import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const model = process.env.OPENAI_MODEL ?? "gpt-5";
// gpt-5 models reason before answering; minimal keeps an alert under ~4 s at about the price of gpt-4.1
const reasoning = model.startsWith("gpt-5") ? { reasoning_effort: "minimal" as const } : {};

type Kind = "alert" | "tip" | "fertiliser";

const SYSTEM =
  "You are Wai, the water and soil expert for a New Zealand farm. Wai's probes sit in the troughs, dams, bores and paddocks and measure " +
  "turbidity, pH, TDS, temperature, water level, soil moisture and position around the clock. The probe is the test: the farmer never needs " +
  "a testing kit, a sample, a lab, or to go and check a number the probe already reports. Your job is to read the numbers, name the cause, " +
  "tell the farmer how to fix it, and say what it costs them and by when if they leave it. " +
  "Write for a busy farmer: plain English, short, specific, decisive. Commit to the most likely cause; do not list options or hedge. " +
  "Reply with JSON only.";

const PROMPTS: Record<Kind, (ctx: unknown) => string> = {
  alert: (ctx) =>
    `A probe raised an alert. Data: ${JSON.stringify(ctx)}\n` +
    `Fields: kind is level (water low), soil (soil moisture dry or saturated), quality (turbidity/pH/TDS out of limits), moved (GPS outside its geofence) or offline (stopped reporting). ` +
    `now = current readings. usual = the average before the alert started. trend = each out-of-limit reading at the start of the alert, now, and recent_change over the last "over" (a duration). ` +
    `rain_past_48h_mm and rain_next_48h_mm are measured and forecast rain at the probe. The probe name says what the water is (trough, dam, bore, river). Limits: turbidity 10 NTU, pH 6.5-8.5, TDS 600 ppm, soil dry under 20% and saturated over 90%, level low under 25%.\n` +
    `Return JSON {"wrong": string, "cause": string, "action": string, "risk": string}.\n` +
    `wrong = one sentence with the numbers and the movement: from what, to what, over how long, still rising or settling.\n` +
    `cause = the single most likely cause, stated as fact, with the readings that point to it and the reading that rules out the obvious alternative (1-2 sentences, max 40 words). ` +
    `A physically impossible movement (soil moisture jumping between 0 and 100 within minutes, a usual value near 0, a level moving tens of cm in seconds) is the sensor, not the paddock or the water: say the sensor is out of the ground, unplugged or fouled, and the fix is to reseat it. Use these patterns: ` +
    `Turbidity up with pH and TDS steady is suspended sediment: runoff washing in after rain when rain_past_48h_mm is more than 5, otherwise stock standing in the water, a collapsed bank, or the pump or inlet drawing off the bottom. ` +
    `Turbidity and TDS up together is effluent, fertiliser or a dead animal washing in from upstream or an adjoining paddock. TDS up alone with no rain is salt building up from evaporation, a bore pulling in saline water, or fertiliser wash-in. ` +
    `pH rising with water over 18 C is an algal bloom; pH falling is acid runoff, peat drainage or rotting vegetation. ` +
    `Water level falling faster than usual is demand above supply: a stuck or slow float valve, a leak, or a pump or supply line down; a level that dropped and stopped points to a leak at that height. ` +
    `Soil dry is no rain or irrigation in the past days; soil saturated is heavy rain, irrigation left on or poor drainage. ` +
    `Offline via LoRa (via_lora = 1) is usually the bridge laptop at the house off or without internet, otherwise the probe out of power or range. Moved is stock dragging it or a person moving it.\n` +
    `action = how to fix it: 2 lines separated by newlines, a third only if it is a different job, no numbers or bullets, each starts with a verb, max 14 words. ` +
    `Line 1 is the fix for the cause you named, e.g. fence stock out of the water and give them another supply, shut the intake to the irrigator, dig a settling sump on the inflow, swap the float valve, irrigate this paddock. ` +
    `Fold what to take into the fix line (a spare float valve, a spade, fencing gear); never a line that only says what to carry. Say when: now, by a time today (use local_time and empty_in_h), or when a reading changes. ` +
    `Put anything that can be done from the house first. Quality and level alerts where stock could drink dirty water or run out come first, stock before everything. ` +
    `Soil alerts are paddock decisions (irrigation, grazing, fertiliser, effluent) and need no trip. Moved alerts: open the map in Wai, ask whether someone moved it on purpose, go only if nobody did. ` +
    `Wai keeps measuring and clears the alert itself, so no line about waiting, watching or letting Wai measure. Never tell the farmer to test, sample, retest, monitor, keep an eye on, check readings, watch, verify, inspect, consider, or contact a professional, and never mention a testing kit or a lab. ` +
    `Only name places that are in the data (the probe name); do not invent yards, offices or paddock numbers.\n` +
    `risk = the downstream effect if nothing changes, with a deadline: who or what is hurt, how, and in how many hours or days. Project the trend (e.g. at +3.8 NTU per 3 h it passes 20 NTU by tonight) and name the loss (1-2 sentences, use the numbers). ` +
    `Examples of effects: stock cut their water intake and scour, milkers drop yield, young stock lose condition, trough and irrigation filters and drippers block, pasture growth stops, nitrogen leaches, a council limit is breached. ` +
    `If the cause clears on its own (rain sediment settles in 1-2 days once the inflow stops), say so and say what changes that.`,
  tip: (ctx) =>
    `The farmer has just opened Wai. Every probe on the farm right now (online, water level, % full, hours until empty, soil moisture, open alert titles): ${JSON.stringify(ctx)}\n` +
    `Return JSON {"title": string, "body": string}. title = 2-5 words: the one thing to do today, starting with a verb and naming the probe, or "All good" style if nothing is needed. ` +
    `body = one or two sentences with the numbers: the cause and the fix, and what it costs by when if left, e.g. "UC River 1 is 18% full and empties in 5 h: swap the float valve before 6 pm or the herd is dry overnight." ` +
    `Pick the probe that hurts first: stock without water or on dirty water beats everything, then a probe about to run dry, then soil, then a probe offline. ` +
    `Wai keeps measuring and alerts on changes, so never tell the farmer to test, sample, monitor, keep an eye on, check readings, watch, verify, inspect, consider, or contact a professional, and never mention a testing kit or a lab. ` +
    `Limits: level low under 25% full, soil dry under 20% and saturated over 90%, turbidity over 10 NTU. A reading inside its limits with no alert is fine: do not invent a problem for it, and use only numbers that are in the data. ` +
    `If nothing needs doing, say so in one sentence and name the reading that would change it.`,
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
    default: {
      const tu = n(now.turbidity_ntu), rain = n(c.rain_past_48h_mm);
      const tds = n(now.tds_ppm), usualTds = n((c.usual as Ctx | undefined)?.tds);
      const effluent = tds != null && usualTds != null && tds > usualTds * 1.3;
      const wet = rain != null && rain > 5;
      return {
        wrong: tu != null ? `Turbidity at ${p} is ${tu.toFixed(0)} NTU, above the 10 NTU limit, and has been since ${c.started ?? "the alert started"}.` : `Water quality at ${p} is outside its limits (${c.detail ?? "see the readings above"}).`,
        cause: effluent
          ? `Turbidity and TDS have risen together, so something is washing in from upstream or the paddock beside it: effluent, fertiliser or a dead animal, not just mud.`
          : wet
            ? `${rain} mm of rain in the last 48 h has washed sediment in from the catchment. TDS and pH are steady, so it is mud, not effluent or fertiliser.`
            : `No rain in the last 48 h and TDS steady, so the sediment is being stirred up in place: stock standing in the water, a slumped bank, or the inlet drawing off the bottom.`,
        action: effluent
          ? `Fence stock off ${p} now and run them on another water source.\nWalk the inflow upstream and remove or divert the source.\nHold effluent and fertiliser off the paddocks that drain into it.`
          : wet
            ? `Shut any intake from ${p} to troughs or irrigation until it is under 10 NTU.\nRun stock on another water source today.\nDig a settling sump on the inflow drain before the next rain.`
            : `Fence stock off ${p} today and run them on another water source.\nRaise the inlet or float off the bottom and fix any slumped bank.`,
        risk: effluent
          ? `Stock drinking this scour within 2-3 days and can pick up infection; TDS rising with turbidity is what the council fines for. It will not clear on its own.`
          : `At ${tu?.toFixed(0) ?? "this"} NTU stock cut their intake and scour within 2-3 days, and any trough or irrigation filter on this line blocks in about a week. Rain sediment settles in 1-2 days once the inflow stops${wet ? "" : ", but this one will not while stock are in the water"}.`,
      };
    }
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

// Rain at the probe from Open-Meteo (free, no key): past 48 h measured and next 48 h forecast, cached per ~1 km for an hour
const forecasts = new Map<string, { at: number; past: number | null; rain: number | null; chance: number | null }>();
async function forecast(lat: number, lng: number) {
  const k = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = forecasts.get(k);
  if (hit && Date.now() - hit.at < 3_600_000) return hit;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=precipitation,precipitation_probability&past_hours=48&forecast_hours=48&timeformat=unixtime`,
      { signal: AbortSignal.timeout(5000) },
    );
    const j = (await r.json()) as { hourly?: { time?: number[]; precipitation?: (number | null)[]; precipitation_probability?: (number | null)[] } };
    const p = j.hourly?.precipitation, time = j.hourly?.time;
    if (!p || !time) throw new Error("no forecast");
    const now = Date.now() / 1000;
    const sum = (xs: (number | null)[]) => +xs.reduce((a, b) => a! + (b ?? 0), 0)!.toFixed(1);
    const out = {
      at: Date.now(),
      past: sum(p.filter((_, i) => time[i] < now)),
      rain: sum(p.filter((_, i) => time[i] >= now)),
      chance: Math.max(0, ...(j.hourly?.precipitation_probability ?? []).filter((_, i) => time[i] >= now).map((x) => x ?? 0)),
    };
    forecasts.set(k, out);
    return out;
  } catch {
    return { at: Date.now(), past: null, rain: null, chance: null };
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
    ...reasoning,
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
  } else if (kind === "alert") {
    const lat = n(context?.lat), lng = n(context?.lng);
    const f = lat != null && lng != null ? await forecast(lat, lng) : { past: null, rain: null };
    ctx = {
      ...context,
      rain_past_48h_mm: f.past,
      rain_next_48h_mm: f.rain,
      local_time: new Date().toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", hour: "numeric", minute: "2-digit" }),
    };
    fallback = fallbackAlert(ctx as Ctx);
  } else fallback = fallbackTip(context ?? {});

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
