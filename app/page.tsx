import ConversationView from "./ConversationView";

export default function Page() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">HB</div>
          <div>
            <div className="topbar-title">HydroBloom · CX Console</div>
            <div className="topbar-sub">AI Reply Assistant</div>
          </div>
        </div>
        <div className="topbar-sub">Agent: Rhea Kapoor</div>
      </header>
      <ConversationView />
    </div>
  );
}
