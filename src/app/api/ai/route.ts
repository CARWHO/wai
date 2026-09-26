import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAI_APIKEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

const SYSTEM =
  "You are Wai, an assistant for New Zealand farmers monitoring water (troughs, dams, bores) with sensor probes. " +
  "Write for a busy farmer: plain English, short, specific, practical. No jargon, no hedging. " +
  "Reply with JSON only.";

const PROMPTS = {
  alert: (ctx: unknown) =>
    `A probe breached a water threshold. Data: ${JSON.stringify(ctx)}\n` +
    `Return JSON {"wrong": string, "cause": string, "action": string, "risk": string}. ` +
    `wrong = what is wrong (1 sentence). cause = most likely cause given the data (1-2 sentences). ` +
    `action = what to do now (2-3 short steps separated by newlines). risk = what happens in the next 24-48 h if ignored (1-2 sentences).`,
  tip: (ctx: unknown) =>
    `Current farm water status: ${JSON.stringify(ctx)}\n` +
    `Return JSON {"title": string, "body": string}. title = 2-5 word verdict. ` +
    `body = one or two sentences: the single most useful suggestion or prediction for today.`,
};

// Used when there is no key or the call fails, so the demo never breaks
const FALLBACK = {
  alert: {
    wrong: "Water quality at this probe has dropped sharply in the last few minutes.",
    cause: "A sudden jump in turbidity usually means sediment or runoff has entered the water, often from stock in the water or a damaged trough inlet.",
    action: "Check the water source and inlet now.\nMove stock off this water until it clears.\nFlush or clean the trough if needed.",
    risk: "Stock drinking dirty water can lose condition and get sick within a day or two, and runoff may breach your regional council limits.",
  },
  tip: {
    title: "All water looks good",
    body: "Every probe is within safe limits. Levels are steady, so no trough checks are needed today.",
  },
};

// Rule-based tip so the fallback still matches what the probes say
function fallbackTip(context: unknown) {
  const probes = (context as { probes?: { name: string; problems?: string[] }[] })?.probes ?? [];
  const bad = probes.filter((p) => p.problems?.length);
  if (!bad.length) return FALLBACK.tip;
  return {
    title: `Check ${bad[0].name} now`,
    body: `${bad[0].problems![0]}. Keep stock off this water until it's checked${bad.length > 1 ? `, and look at ${bad.slice(1).map((p) => p.name).join(", ")} too` : ""}.`,
  };
}

export async function POST(req: Request) {
  const { kind, context } = (await req.json()) as { kind: "alert" | "tip"; context: unknown };
  if (!(kind in PROMPTS)) return Response.json({ error: "bad kind" }, { status: 400 });
  const fallback = kind === "tip" ? fallbackTip(context) : FALLBACK.alert;

  if (!openai) return Response.json({ ...fallback, source: "fallback" });
  try {
    const res = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: PROMPTS[kind](context) },
      ],
    });
    const json = JSON.parse(res.choices[0].message.content ?? "{}");
    return Response.json({ ...fallback, ...json, source: "openai" });
  } catch (e) {
    console.error("AI call failed:", (e as Error).message);
    return Response.json({ ...fallback, source: "fallback" });
  }
}
