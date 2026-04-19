import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

import Badge from "./Badge";
import WorkflowTimeline from "./WorkflowTimeline";
function ApprovalCard({ r, steps, canApprove, onApprove, btnLabel, next, onReject, onOpenReject, isPay, onPay }) {
  const [expanded, setExpanded] = useState(false);
  const trailKeys = r.requestType === "entitlement"
    ? [["managerApproval","Manager"],["vpApproval","VP"],["hrApproval","HR"],["ceo1Approval","CEO"],["financeApproval","Finance"],["ceo2Approval","CEO Release"]]
    : [["managerApproval","Manager"],["ceo1Approval","CEO Review"],["financeApproval","Finance"],["ceo2Approval","CEO Release"]];
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:10, overflow:"hidden" }}>
      <div style={{ padding:"16px 20px" }}>
        <WorkflowTimeline status={r.status} steps={steps} />
        <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:14, fontWeight:700 }}>{r.title}</span>
              {r.entitlementType && <Badge label={r.entitlementType} color="#14B8A6" />}
              {r.employeeName && <span style={{ fontSize:12, color:C.text }}>👤 <strong>{r.employeeName}</strong></span>}
              <Badge label={priorityConfig[r.priority]?.label} color={priorityConfig[r.priority]?.color} />
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:4, display:"flex", gap:10, flexWrap:"wrap" }}>
              <span>{r.department}{r.category ? ` · ${r.category}` : ""}</span>
              <span>·</span><span>By: <strong style={{ color:C.text }}>{r.submittedBy || "System"}</strong></span>
              <span>·</span><span>{fmtDate(r.requestDate)}</span>
              {r.period && <><span>·</span><span style={{ color:C.gold }}>Period: {r.period}</span></>}
              {r.frequency && <><span>·</span><span style={{ color:C.accent }}>{r.frequency}</span></>}
            </div>
            {r.notes && <div style={{ fontSize:12, color:C.text+"88", background:C.subtle, padding:"6px 10px", borderRadius:6, marginBottom:6 }}>{r.notes}</div>}
            {r.documents && <div style={{ fontSize:11, color:C.accent, marginBottom:4 }}>📎 {r.documents}</div>}
            <button onClick={() => setExpanded(x => !x)} style={{ marginTop:6, background:"none", border:`1px solid ${C.border}`, color:C.muted, fontSize:11, padding:"3px 10px", borderRadius:6, cursor:"pointer" }}>
              {expanded ? "▲ Less details" : "▼ Full details"}
            </button>
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace", marginBottom:8 }}>{r.currency||"SAR"} {fmtAmt(r.amount)}</div>
            {r.hoursWorked && <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>⏱ {r.hoursWorked}h{r.ratePerHour ? ` @ ${r.currency} ${r.ratePerHour}/h` : ""}</div>}
            {canApprove ? (
              <div style={{ display:"flex", gap:6, flexDirection:"column" }}>
                {isPay ? (
                  <button className="btn-green" onClick={() => onPay(r.id)} style={{ fontSize:12, padding:"7px 14px", whiteSpace:"nowrap" }}>{btnLabel}</button>
                ) : (
                  <button className="btn-primary" onClick={() => onApprove(r.id)} style={{ fontSize:12, padding:"7px 14px", whiteSpace:"nowrap" }}>{btnLabel}</button>
                )}
                <div style={{ fontSize:10, color:C.muted, textAlign:"center" }}>{next}</div>
                {!isPay && <button onClick={() => onOpenReject(r.id, onReject)} style={{ background:C.red+"22", color:C.red, border:`1px solid ${C.red}44`, padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>✗ Reject</button>}
              </div>
            ) : <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>View only</div>}
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:C.subtle, padding:"16px 20px", display:"grid", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12 }}>
            {[
              ["Request Date",  fmtDate(r.requestDate)],
              ["Department",    r.department],
              ["Category",      r.category || r.entitlementType || "—"],
              ["Period",        r.period || "—"],
              ["Priority",      r.priority],
              ["Amount",        `${r.currency||"SAR"} ${fmtAmt(r.amount)}`],
              r.hoursWorked   && ["Hours Worked",    r.hoursWorked + " hrs"],
              r.ratePerHour   && ["Rate / Hour",     `${r.currency||"SAR"} ${r.ratePerHour}`],
              r.frequency     && ["Billing Cycle",   r.frequency],
              r.licenses      && ["Seats",           r.licenses],
              r.paymentMethod && ["Payment Method",  r.paymentMethod],
              r.dueDate       && ["Due Date",        fmtDate(r.dueDate)],
              r.renewalDate   && ["Renewal Date",    fmtDate(r.renewalDate)],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ background:C.card, padding:"10px 12px", borderRadius:8, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{val}</div>
              </div>
            ))}
          </div>
          {r.notes && (
            <div>
              <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:6 }}>NOTES / JUSTIFICATION</div>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", fontSize:13, color:C.text, lineHeight:1.6 }}>{r.notes}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:6 }}>ATTACHED DOCUMENTS</div>
            {r.documents ? (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {r.documents.split(",").map(d=>d.trim()).filter(Boolean).map((doc,i) => (
                  <div key={i} style={{ background:C.card, border:`1px solid ${C.accent}44`, borderRadius:8, padding:"7px 12px", fontSize:12, color:C.accent }}>📎 {doc}</div>
                ))}
              </div>
            ) : <div style={{ fontSize:12, color:C.muted, fontStyle:"italic" }}>No documents attached</div>}
          </div>
          <div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:8 }}>APPROVAL TRAIL</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {trailKeys.map(([key, label]) => (
                <div key={key} style={{ background:r[key]?C.green+"15":C.card, border:`1px solid ${r[key]?C.green+"44":C.border}`, borderRadius:8, padding:"8px 12px", fontSize:11, minWidth:100 }}>
                  <div style={{ color:r[key]?C.green:C.muted, fontWeight:700, marginBottom:2 }}>{r[key]?"✓":"○"} {label}</div>
                  {r[key] ? <><div style={{ color:C.text }}>{r[key].by}</div><div style={{ color:C.muted }}>{fmtDate(r[key].date)}</div></> : <div style={{ color:C.muted, fontStyle:"italic" }}>Pending</div>}
                </div>
              ))}
            </div>
          </div>
          {r.paymentInfo && (
            <div style={{ background:C.green+"10", border:`1px solid ${C.green}33`, borderRadius:8, padding:"10px 14px" }}>
              <div style={{ fontSize:10, color:C.green, letterSpacing:1, marginBottom:6, fontWeight:700 }}>PAYMENT RECORDED</div>
              <div style={{ display:"flex", gap:16, fontSize:12, flexWrap:"wrap" }}>
                <span>💳 {r.paymentInfo.method}</span>
                <span>Ref: <strong>{r.paymentInfo.ref}</strong></span>
                <span>Date: {fmtDate(r.paymentInfo.date)}</span>
                {r.paymentInfo.doc && <span>📎 {r.paymentInfo.doc}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ApprovalCard;
