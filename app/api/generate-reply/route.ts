import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { retrieveRelevantKb, buildGroundingNotes, isLowConfidence, type KbRow } from "@/lib/retrieval";
import { generateReply } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { conversationId } = await req.json();
    if (!conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const [conversation] = await sql`select * from conversations where id = ${conversationId}`;
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const [brand] = await sql`select * from brands where id = ${conversation.brand_id}`;
    const [customer] = await sql`select * from customers where id = ${conversation.customer_id}`;
    const [order] = conversation.order_id
      ? await sql`select * from orders where id = ${conversation.order_id}`
      : [null];
    const messages = await sql`
      select * from messages where conversation_id = ${conversation.id} order by created_at asc
    `;
    const kb = (await sql`
      select id, category, title, content from knowledge_base where brand_id = ${brand.id}
    `) as unknown as KbRow[];

    const latestCustomerMessage = [...messages].reverse().find((m: any) => m.sender === "customer");
    if (!latestCustomerMessage) {
      return NextResponse.json({ error: "No customer message to reply to" }, { status: 400 });
    }

    // --- Step 1: identify brand (already scoped by conversation.brand_id) ---
    // --- Step 2: retrieve relevant KB context ---
    const { context, matchedByTopic } = retrieveRelevantKb(latestCustomerMessage.content, kb);

    const orderFacts = order
      ? {
          productName: order.product_name,
          orderNumber: order.order_number,
          status: order.status,
          deliveredAt: order.delivered_at,
        }
      : { productName: "unknown", orderNumber: "unknown", status: "unknown", deliveredAt: null };

    const groundingNotes = buildGroundingNotes(context, orderFacts);
    const lowConfidence = isLowConfidence(matchedByTopic, groundingNotes);

    // --- Step 3 & 4: provide context to the LLM, generate suggested response ---
    const aiResponse = await generateReply({
      brandName: brand.name,
      brandTone: brand.tone,
      customerName: customer.name,
      order: orderFacts,
      history: messages.map((m: any) => ({ sender: m.sender, content: m.content })),
      customerMessage: latestCustomerMessage.content,
      context,
      groundingNotes,
      lowConfidence,
    });

    // --- Step 5: log for audit (customer message, retrieved context, AI response) ---
    const [log] = await sql`
      insert into ai_reply_logs
        (conversation_id, customer_message, retrieved_context, ai_response, status, low_confidence, model)
      values
        (${conversationId}, ${latestCustomerMessage.content}, ${JSON.stringify(context)}, ${aiResponse}, 'generated', ${lowConfidence}, ${process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-4.5"})
      returning *
    `;

    return NextResponse.json({ log, context, groundingNotes, lowConfidence });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
