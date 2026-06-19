import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  datasetId: z.string().uuid(),
  statsJson: z.string().min(2).max(60_000),
});

const SYSTEM = `You are InsightForge, a business analyst.
You will be given a JSON object with computed statistics from a user's dataset.
Write a concise, plain-language summary (3 short paragraphs, no bullet markdown).

Rules:
- ONLY describe numbers that appear in the JSON. Do not invent metrics, forecasts, or causes.
- Reference column names exactly as given.
- Highlight: (1) the headline story (size, time range, target if any), (2) the strongest trend, segment, or correlation, (3) the most important data-quality caveat the user should know.
- Keep it under 180 words. No headings.`;

export const generateNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { narrative: "AI narrative is unavailable (LOVABLE_API_KEY missing)." };
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Computed stats JSON:\n\n${data.statsJson}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Response(`AI gateway error (${res.status}): ${text.slice(0, 200)}`, {
        status: 502,
      });
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const narrative = json.choices?.[0]?.message?.content?.trim() ?? "";

    // Persist narrative to analyses table
    await context.supabase.from("analyses").insert({
      user_id: context.userId,
      dataset_id: data.datasetId,
      kind: "narrative",
      narrative,
      payload: { source: "gemini-2.5-flash" },
    });

    return { narrative };
  });