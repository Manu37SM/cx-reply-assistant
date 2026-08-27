"use client";

import { useEffect, useState } from "react";

type Message = { id: string; sender: string; content: string; created_at: string };
type Log = {
  id: string;
  customer_message: string;
  retrieved_context: any[];
  ai_response: string | null;
  agent_edited_response: string | null;
  final_response: string | null;
  status: string;
  low_confidence: boolean;
  created_at: string;
};

type ConversationData = {
  conversation: { id: string; status: string };
  brand: { id: string; name: string; tone: string };
  customer: { id: string; name: string; email: string };
  order: { order_number: string; product_name: string; status: string; delivered_at: string } | null;
  messages: Message[];
  logs: Log[];
};

export default function ConversationView() {
  const [data, setData] = useState<ConversationData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [edited, setEdited] = useState(false);
  const [activeLog, setActiveLog] = useState<Log | null>(null);
  const [context, setContext] = useState<any[]>([]);
  const [groundingNotes, setGroundingNotes] = useState<string[]>([]);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [approving, setApproving] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/conversation");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load conversation");
      setData(json);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGenerate() {
    if (!data) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: data.conversation.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");
      setActiveLog(json.log);
      setDraft(json.log.ai_response || "");
      setEdited(false);
      setContext(json.context || []);
      setGroundingNotes(json.groundingNotes || []);
      setLowConfidence(json.lowConfidence);
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove() {
    if (!data || !activeLog) return;
    setApproving(true);
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: activeLog.id,
          conversationId: data.conversation.id,
          finalResponse: draft,
          wasEdited: edited,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Approve failed");
      setActiveLog(null);
      setDraft("");
      setContext([]);
      setGroundingNotes([]);
      await load();
    } catch (err: any) {
      setGenError(err.message);
    } finally {
      setApproving(false);
    }
  }

  if (loadError) {
    return (
      <div className="pane" style={{ margin: 24 }}>
        <div className="error-banner">
          {loadError}. Run <code>npm run seed</code> against your Neon database, then reload.
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="empty-state">Loading conversation…</div>;
  }

  const { brand, customer, order, messages } = data;
  const daysSinceDelivery = order?.delivered_at
    ? Math.floor((Date.now() - new Date(order.delivered_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className="layout">
      {/* LEFT: Conversation view */}
      <div className="pane pane-left">
        <p className="section-label">Customer</p>
        <div className="customer-card">
          <p className="customer-name">{customer.name}</p>
          <span className="brand-pill">● {brand.name}</span>
          {order && (
            <dl className="order-grid">
              <div className="order-field">
                <dt>Order</dt>
                <dd>{order.order_number}</dd>
              </div>
              <div className="order-field">
                <dt>Item</dt>
                <dd>{order.product_name}</dd>
              </div>
              <div className="order-field">
                <dt>Status</dt>
                <dd style={{ textTransform: "capitalize" }}>{order.status}</dd>
              </div>
              <div className="order-field">
                <dt>Delivered</dt>
                <dd>{daysSinceDelivery !== null ? `${daysSinceDelivery} day(s) ago` : "—"}</dd>
              </div>
            </dl>
          )}
        </div>

        <p className="section-label">Conversation history</p>
        <div className="thread">
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.sender === "customer" ? "bubble-customer" : "bubble-agent"}`}>
              <div>{m.content}</div>
              <div className="bubble-meta">
                {m.sender} · {new Date(m.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: AI assist panel */}
      <div className="pane">
        <div className="assist-panel">
          <div>
            <p className="section-label">Generate reply</p>
            <button className="generate-btn" onClick={handleGenerate} disabled={generating}>
              {generating ? "Generating…" : activeLog ? "Regenerate reply" : "Generate reply"}
            </button>
          </div>

          {genError && <div className="error-banner">{genError}</div>}

          {context.length > 0 && (
            <div>
              <p className="section-label">Retrieved knowledge</p>
              <div className="kb-chip-row">
                {context.map((c: any) => (
                  <span key={c.id} className="kb-chip">
                    {c.category}: {c.title}
                  </span>
                ))}
              </div>
            </div>
          )}

          {lowConfidence && (
            <div className="confidence-banner">
              <span>⚠</span>
              <span>
                Low-confidence draft — either no clear policy topic matched this message, or the order falls
                outside a stated policy window. Review carefully before approving; consider escalating instead
                of sending as-is.
              </span>
            </div>
          )}

          {activeLog && (
            <>
              <div>
                <p className="section-label">Suggested response (editable)</p>
                <div className="reply-card">
                  <textarea
                    className="reply-textarea"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setEdited(true);
                    }}
                  />
                </div>
              </div>
              <div className="reply-actions">
                <button className="btn btn-primary" onClick={handleApprove} disabled={approving || !draft.trim()}>
                  {approving ? "Approving…" : "Approve & send"}
                </button>
                <button className="btn" onClick={handleGenerate} disabled={generating}>
                  Regenerate
                </button>
                {edited && <span className="status-tag">Edited by agent</span>}
              </div>
              {groundingNotes.length > 0 && (
                <details>
                  <summary className="section-label" style={{ cursor: "pointer" }}>
                    Grounding notes (used to constrain the model)
                  </summary>
                  <ul style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
                    {groundingNotes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          <div>
            <p className="section-label">Reply log</p>
            {data.logs.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>No replies generated yet for this conversation.</p>
            ) : (
              <div className="log-list">
                {data.logs.map((log) => (
                  <div key={log.id} className="log-entry">
                    <div className="log-entry-head">
                      <span>{new Date(log.created_at).toLocaleString()}</span>
                      <span className="status-tag">{log.status}</span>
                    </div>
                    <div>
                      <strong>Customer:</strong> {log.customer_message}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <strong>Final:</strong> {log.final_response || log.ai_response}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
