import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// POST /api/approve
// body: { logId, conversationId, finalResponse, wasEdited }
// Marks the log approved, records the agent-edited text if it differs from
// the AI draft, and appends the final response as a message in the
// conversation (this is the "send" step — no actual WhatsApp/email dispatch,
// per the assessment's scope).
export async function POST(req: NextRequest) {
  try {
    const { logId, conversationId, finalResponse, wasEdited } = await req.json();
    if (!logId || !conversationId || !finalResponse) {
      return NextResponse.json(
        { error: "logId, conversationId, and finalResponse are required" },
        { status: 400 }
      );
    }

    const [log] = await sql`
      update ai_reply_logs
      set
        agent_edited_response = ${wasEdited ? finalResponse : null},
        final_response = ${finalResponse},
        status = 'approved',
        updated_at = now()
      where id = ${logId}
      returning *
    `;

    const [message] = await sql`
      insert into messages (conversation_id, sender, content)
      values (${conversationId}, 'agent', ${finalResponse})
      returning *
    `;

    return NextResponse.json({ log, message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
