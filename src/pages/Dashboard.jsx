import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function Dashboard({ recurring, onetime, overdueCount, highPriority, dueThisWeek, totalPendingApproval, setView }) {
  const deptTotals = useMemo(() => { const m = {}; recurring.forEach(r => { m[r.department] = (m[r.department]||0)+(r.amount||0); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,7); }, [recurring]);
  const catTotals = useMemo(() => { const m = {}; recurring.forEach(r => { m[r.category] = (m[r.category]||0)+(r.amount||0); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); }, [recurring]);
  const urgentItems = recurring.filter(r => { const d = daysUntil(r.renewalDate); return d >= 0 && d <= 14 && r.status !== "paid"; }).sort((a,b) => daysUntil(a.renewalDate)-daysUntil(b.renewalDate)).slice(0,8);
  const overdueItems = recurring.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0).slice(0,6);
  const maxDept = deptTotals[0]?.[1]||1;
  const barColors = [C.accent,C.green,C.orange,C.gold,C.purple,C.red,"#06B6D4"];

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>OVERVIEW</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Finance Dashboard</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{recurring.length} subscriptions tracked across all departments</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 13, marginBottom: 22 }}>
        {[
          { label: "SUBSCRIPTIONS", val: recurring.length, sub: "Total tracked", color: C.accent, click: () => setView("recurring") },
          { label: "DUE THIS WEEK", val: dueThisWeek, sub: "Within 7 days", color: C.gold, click: () => setView("recurring") },
          { label: "OVERDUE", val: overdueCount, sub: "Act immediately", color: C.red, click: () => setView("recurring") },
          { label: "HIGH PRIORITY", val: highPriority, sub: "Across all items", color: C.orange },
          { label: "PENDING APPROVALS", val: totalPendingApproval, sub: "One-time requests", color: C.purple, click: () => setView("approvals") },
        ].map(k => (
          <div key={k.label} onClick={k.click} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.color}`, borderRadius: 12, padding: "16px 18px", cursor: k.click ? "pointer" : "default" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 600, marginBottom: 5 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 12 }}>DUE IN NEXT 14 DAYS</div>
          {urgentItems.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>✓ Nothing due in the next 14 days</div>
            : urgentItems.map(r => { const d = daysUntil(r.renewalDate); return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div><div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 11, color: C.muted }}>{r.department}</div></div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: C.gold }}>{r.currency} {fmtAmt(r.amount)}</div>
                  <div style={{ fontSize: 10, color: d <= 3 ? C.red : C.gold, fontWeight: 600 }}>{d}d left</div>
                </div>
              </div>
            );})}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.red}33`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: 1, marginBottom: 12 }}>⚠ OVERDUE</div>
          {overdueItems.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>✓ No overdue items</div>
            : overdueItems.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div><div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 11, color: C.muted }}>{r.department} · {fmtDate(r.renewalDate)}</div>{r.notes && <div style={{ fontSize: 10, color: C.gold }}>{r.notes}</div>}</div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: C.red }}>{r.currency} {fmtAmt(r.amount)}</div>
              </div>
            ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>SPEND BY DEPARTMENT</div>
          {deptTotals.map(([dept, amt], i) => (
            <div key={dept} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{dept}</span><span style={{ color: C.muted, fontFamily: "monospace" }}>{fmtAmt(Math.round(amt))}</span>
              </div>
              <div style={{ height: 5, background: C.subtle, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${(amt/maxDept)*100}%`, background: barColors[i%barColors.length], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>SPEND BY CATEGORY</div>
          {catTotals.map(([cat, amt], i) => (
            <div key={cat} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{cat}</span><span style={{ color: C.muted, fontFamily: "monospace" }}>{fmtAmt(Math.round(amt))}</span>
              </div>
              <div style={{ height: 5, background: C.subtle, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${(amt/(catTotals[0]?.[1]||1))*100}%`, background: barColors[i%barColors.length], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
