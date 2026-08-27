// Lightweight keyword-based retrieval + a deterministic guardrail check.
//
// Why keyword matching instead of embeddings at this scale: one brand, four
// KB categories, near-zero corpus size. A vector store (Qdrant, per the
// assessment's stack) buys nothing here and adds infra to run. Part 2 of the
// architecture doc explains exactly when/why this gets swapped for real
// semantic retrieval as brand/document count grows.

export type KbRow = {
  id: string;
  category: "return" | "refund" | "shipping" | "cancellation";
  title: string;
  content: string;
};

const CATEGORY_KEYWORDS: Record<KbRow["category"], string[]> = {
  refund: ["refund", "money back", "reimburse"],
  return: ["return", "send back", "exchange"],
  shipping: ["ship", "delivery time", "when will", "tracking", "arrive"],
  cancellation: ["cancel", "cancellation"],
};

export function retrieveRelevantKb(
  customerMessage: string,
  kb: KbRow[]
): { context: KbRow[]; matchedByTopic: boolean } {
  const msg = customerMessage.toLowerCase();
  const matched = kb.filter((row) =>
    CATEGORY_KEYWORDS[row.category].some((kw) => msg.includes(kw))
  );

  // "Broken/damaged/defective" implicates both refund and return policy —
  // the two are usually read together for a damaged-item request.
  if (/broken|damaged|defective|faulty|crack|leak/i.test(customerMessage)) {
    for (const row of kb) {
      if (
        (row.category === "refund" || row.category === "return") &&
        !matched.find((m) => m.id === row.id)
      ) {
        matched.push(row);
      }
    }
  }

  // Fallback: if nothing matched a known topic, hand over the whole KB rather
  // than generating with zero context — but flag that this was a fallback so
  // the guardrail can mark the reply low-confidence instead of pretending we
  // confidently identified the topic.
  if (matched.length > 0) {
    return { context: matched, matchedByTopic: true };
  }
  return { context: kb, matchedByTopic: false };
}

export type OrderFacts = {
  productName: string;
  orderNumber: string;
  status: string;
  deliveredAt: string | null;
};

// Extracts "within N days" style windows from policy text and checks them
// against the actual order. This is the deterministic half of the guardrail:
// instead of hoping the model reasons about dates correctly, we compute the
// fact and hand it over pre-chewed, and flag a mismatch for the UI/prompt.
export function buildGroundingNotes(kb: KbRow[], order: OrderFacts): string[] {
  const notes: string[] = [];
  if (!order.deliveredAt) return notes;

  const deliveredAt = new Date(order.deliveredAt);
  const daysSinceDelivery = Math.floor(
    (Date.now() - deliveredAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  notes.push(`This order was delivered ${daysSinceDelivery} day(s) ago.`);

  for (const row of kb) {
    const match = row.content.match(/within (\d+)\s*days?/i);
    if (match) {
      const windowDays = parseInt(match[1], 10);
      const withinWindow = daysSinceDelivery <= windowDays;
      notes.push(
        `Policy "${row.title}" allows action within ${windowDays} day(s) of delivery. ` +
          `This order is ${withinWindow ? "WITHIN" : "OUTSIDE"} that window ` +
          `(${daysSinceDelivery} day(s) elapsed).`
      );
    }
  }

  return notes;
}

// Second guardrail layer: a cheap heuristic confidence flag, independent of
// what the model claims about itself. If retrieval had to fall back to
// "hand over the whole KB" because no topic matched, or a date-window check
// came back OUTSIDE policy, confidence is low and the UI nudges the agent to
// double-check before sending.
export function isLowConfidence(matchedByTopic: boolean, groundingNotes: string[]): boolean {
  const outsideWindow = groundingNotes.some((n) => n.includes("OUTSIDE"));
  return !matchedByTopic || outsideWindow;
}
