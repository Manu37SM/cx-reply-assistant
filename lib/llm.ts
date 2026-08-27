import type { KbRow, OrderFacts } from "./retrieval";

export type GenerateReplyInput = {
  brandName: string;
  brandTone: string;
  customerName: string;
  order: OrderFacts;
  history: { sender: string; content: string }[];
  customerMessage: string;
  context: KbRow[];
  groundingNotes: string[];
  lowConfidence: boolean;
};

const SYSTEM_PROMPT = `You are a customer support reply assistant embedded in a CX agent's tool.
You draft a reply for the AGENT to review — you never send anything directly.

Hard rules:
1. Only state policy facts that appear in the CONTEXT block below. Never invent a return window, refund amount, timeline, or exception that isn't written there.
2. If the CONTEXT does not clearly cover what the customer is asking, or the GROUNDING NOTES show the order falls OUTSIDE an eligibility window, do NOT promise the outcome the customer wants. Say plainly what you can offer instead (e.g. escalate to a human agent, or explain the applicable policy) rather than guessing or being evasive.
3. Never say "yes" to a refund/return/cancellation unless the CONTEXT + GROUNDING NOTES clearly support it for this specific order.
4. Keep the reply short (3-6 sentences), warm, and specific to the customer's situation. Sign off per the brand tone.
5. Do not apologize excessively or repeat the customer's message back verbatim.`;

export async function generateReply(input: GenerateReplyInput): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }

  const contextBlock = input.context
    .map((c) => `[${c.category.toUpperCase()}] ${c.title}: ${c.content}`)
    .join("\n");

  const historyBlock = input.history
    .map((m) => `${m.sender.toUpperCase()}: ${m.content}`)
    .join("\n");

  const userPrompt = `BRAND: ${input.brandName}
BRAND TONE: ${input.brandTone}

CUSTOMER: ${input.customerName}
ORDER: ${input.order.orderNumber} — ${input.order.productName} (status: ${input.order.status}, delivered: ${input.order.deliveredAt ?? "unknown"})

CONVERSATION HISTORY:
${historyBlock}

LATEST CUSTOMER MESSAGE:
"${input.customerMessage}"

CONTEXT (brand knowledge base — the only source of policy facts you may use):
${contextBlock || "(no matching knowledge base entries were found)"}

GROUNDING NOTES (computed facts about this order vs. policy windows — treat as ground truth):
${input.groundingNotes.join("\n") || "(none)"}

${input.lowConfidence ? "NOTE: Retrieval confidence is LOW for this request — either no KB topic matched, or the order falls outside a stated policy window. Be conservative: do not confidently promise an outcome the CONTEXT doesn't clearly support." : ""}

Draft the agent's reply now.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5",
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenRouter returned no reply content.");
  }
  return text.trim();
}
