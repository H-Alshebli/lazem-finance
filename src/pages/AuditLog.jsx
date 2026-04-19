import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function AuditLogView({ logs }) {
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [search, setSearch] = useState("");

  const actionColors = { create: C.green, edit: C.accent, delete: C.red, approve: C.gold, reject: C.red, pay: C.purple, submit: C.orange };
  const actionLabels = { create: "Created", edit: "Edited", delete: "Deleted", approve: "Approved", reject: "Rejected", pay: "Paid", submit: "Submitted" };
  const entities = ["all", "one-time", "entitlement", "recurring"];
  const actions = ["all", "create", "edit", "delete", "approve", "reject", "pay", "submit"];

  const filtered = logs.filter(l => {
    if (filterAction !== "all" && l.action !== filterAction) return false;
    if (filterEntity !== "all" && l.entity !== filterEntity) return false;
    if (search && !l.title?.toLowerCase().includes(search.toLowerCase()) && !l.userId?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>COMPLIANCE</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Activity & Audit Log</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{logs.length} events recorded · Immutable trail</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="inp" style={{ maxWidth: 240 }} placeholder="🔍 Search by user or item…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {actions.map(a => <button key={a} className={`tab-btn${filterAction===a?" active":""}`} onClick={() => setFilterAction(a)}>{a === "all" ? "All Actions" : actionLabels[a] || a}</button>)}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {entities.map(e => <button key={e} className={`tab-btn${filterEntity===e?" active":""}`} onClick={() => setFilterEntity(e)}>{e === "all" ? "All Types" : e}</button>)}
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 90px 1.5fr 80px", padding: "10px 16px", background: C.subtle, fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>
          {["TIMESTAMP", "ACTION", "TYPE", "USER", "ITEM / DETAILS", "AMOUNT"].map(h => <div key={h}>{h}</div>)}
        </div>
        {filtered.length === 0 && <div style={{ padding: 32, textAlign: "center", color: C.muted }}>No audit events found</div>}
        {filtered.map((l, i) => (
          <div key={l.id} className="card-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 90px 1.5fr 80px", padding: "11px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", alignItems: "start" }}>
            <div style={{ fontSize: 11, color: C.muted }}>{new Date(l.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: actionColors[l.action] || C.muted, background: (actionColors[l.action] || C.muted) + "18", padding: "2px 8px", borderRadius: 5 }}>{actionLabels[l.action] || l.action}</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "capitalize" }}>{l.entity}</div>
            <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{l.userId}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{l.title || l.entityId}</div>
              {l.detail && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{l.detail}</div>}
              {l.oldValue && l.newValue && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}><span style={{ color: C.red }}>{l.oldValue}</span> → <span style={{ color: C.green }}>{l.newValue}</span></div>}
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: l.amount ? C.gold : C.muted }}>{l.amount ? `SAR ${fmtAmt(l.amount)}` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AuditLogView;
