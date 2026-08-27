import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/conversation?id=<uuid>   — returns full conversation view.
// GET /api/conversation             — returns the most recently seeded demo conversation.
export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");

    const [conversation] = id
      ? await sql`select * from conversations where id = ${id}`
      : await sql`select * from conversations order by created_at desc limit 1`;

    if (!conversation) {
      return NextResponse.json(
        { error: "No conversation found. Run `npm run seed` first." },
        { status: 404 }
      );
    }

    const [brand] = await sql`select * from brands where id = ${conversation.brand_id}`;
    const [customer] = await sql`select * from customers where id = ${conversation.customer_id}`;
    const [order] = conversation.order_id
      ? await sql`select * from orders where id = ${conversation.order_id}`
      : [null];
    const messages = await sql`
      select * from messages where conversation_id = ${conversation.id} order by created_at asc
    `;
    const logs = await sql`
      select * from ai_reply_logs where conversation_id = ${conversation.id} order by created_at desc
    `;

    return NextResponse.json({ conversation, brand, customer, order, messages, logs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
