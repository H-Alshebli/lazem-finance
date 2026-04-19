import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function ForecastDashboard({ recurring, onetime, entitlements }) {
  const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };
  const toSAR = (amt, cur) => (amt || 0) * (SAR_RATES[cur] || 1);

  // Monthly cost: yearly items ÷ 12, monthly items as-is
  const monthlyCommitment = useMemo(() => {
    return recurring
      .filter(r => !["paid","rejected"].includes(r.status))
      .reduce((sum, r) => {
        const sarAmt = toSAR(r.amount, r.currency);
        return sum + (r.frequency === "Yearly" ? sarAmt / 12 : sarAmt);
      }, 0);
  }, [recurring]);

  const yearlyCommitment = useMemo(() => {
    return recurring
      .filter(r => !["paid","rejected"].includes(r.status))
      .reduce((sum, r) => {
        const sarAmt = toSAR(r.amount, r.currency);
        return sum + (r.frequency === "Yearly" ? sarAmt : sarAmt * 12);
      }, 0);
  }, [recurring]);

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const upcoming30 = recurring.filter(r => {
    if (!r.renewalDate || ["paid"].includes(r.status)) return false;
    const d = new Date(r.renewalDate);
    return d >= now && d <= in30;
  }).sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate));

  const upcoming30Total = upcoming30.reduce((s, r) => s + toSAR(r.amount, r.currency), 0);

  // 12-month projection
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), month: d.getMonth(), year: d.getFullYear() };
  });

  const monthlyProjection = months.map(m => {
    let total = 0;
    recurring.filter(r => !["paid","rejected"].includes(r.status)).forEach(r => {
      const sarAmt = toSAR(r.amount, r.currency);
      if (r.frequency === "Monthly") {
        total += sarAmt;
      } else if (r.frequency === "Yearly" && r.renewalDate) {
        const rd = new Date(r.renewalDate);
        if (rd.getMonth() === m.month && rd.getFullYear() === m.year) total += sarAmt;
      }
    });
    return { ...m, total };
  });
  const maxMonth = Math.max(...monthlyProjection.map(m => m.total), 1);

  // By-department monthly
  const deptMonthly = useMemo(() => {
    const m = {};
    recurring.filter(r => !["paid","rejected"].includes(r.status)).forEach(r => {
      const sarAmt = toSAR(r.amount, r.currency);
      const monthly = r.frequency === "Yearly" ? sarAmt / 12 : sarAmt;
      m[r.department] = (m[r.department] || 0) + monthly;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [recurring]);

  const barColors = [C.accent, C.green, C.orange, C.gold, C.purple, C.red, "#06B6D4", "#14B8A6"];

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>FINANCIAL FORECAST</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Commitment Overview</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Based on {recurring.filter(r => r.status !== "paid").length} active recurring items · All amounts in SAR equivalent</div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "MONTHLY COMMITMENT", val: `SAR ${fmtAmt(Math.round(monthlyCommitment))}`, sub: "Average monthly spend", color: C.accent },
          { label: "YEARLY COMMITMENT",  val: `SAR ${fmtAmt(Math.round(yearlyCommitment))}`,  sub: "Annualised total",     color: C.gold   },
          { label: "DUE IN 30 DAYS",     val: `SAR ${fmtAmt(Math.round(upcoming30Total))}`,   sub: `${upcoming30.length} payments`,  color: C.orange },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.color}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* 12-month bar chart */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>12-MONTH PAYMENT PROJECTION</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
            {monthlyProjection.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: C.muted, textAlign: "center", marginBottom: 2 }}>
                  {m.total > 0 ? fmtAmt(Math.round(m.total / 1000)) + "k" : ""}
                </div>
                <div style={{ width: "100%", background: i === 0 ? C.accent : C.subtle, borderRadius: "3px 3px 0 0", height: `${Math.max(4, (m.total / maxMonth) * 110)}px`, transition: "height .3s" }} />
                <div style={{ fontSize: 8, color: C.muted, whiteSpace: "nowrap" }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dept monthly breakdown */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>MONTHLY BY DEPARTMENT</div>
          {deptMonthly.map(([dept, amt], i) => (
            <div key={dept} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: C.text }}>{dept}</span>
                <span style={{ color: barColors[i % barColors.length], fontFamily: "monospace", fontWeight: 600 }}>SAR {fmtAmt(Math.round(amt))}</span>
              </div>
              <div style={{ height: 4, background: C.subtle, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${(amt / (deptMonthly[0]?.[1] || 1)) * 100}%`, background: barColors[i % barColors.length], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming 30 days table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>UPCOMING PAYMENTS — NEXT 30 DAYS ({upcoming30.length})</div>
        {upcoming30.length === 0
          ? <div style={{ color: C.muted, fontSize: 13 }}>✓ No payments due in the next 30 days</div>
          : (
            <div style={{ display: "grid", gap: 1 }}>
              {[["Item", "Department", "Frequency", "Renewal Date", "Amount"]].map(h => (
                <div key="h" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "6px 10px", fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>
                  {h.map(c => <div key={c}>{c}</div>)}
                </div>
              ))}
              {upcoming30.map(r => {
                const d = daysUntil(r.renewalDate);
                return (
                  <div key={r.id} className="card-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "9px 10px", borderRadius: 8, background: C.subtle }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}<span style={{ fontSize: 10, color: C.muted }}> · {r.details}</span></div>
                    <div style={{ fontSize: 11, color: C.muted }}>{r.department}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{r.frequency}</div>
                    <div style={{ fontSize: 11, color: d <= 7 ? C.red : d <= 14 ? C.orange : C.gold, fontWeight: 600 }}>{fmtDate(r.renewalDate)} ({d}d)</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: C.text }}>{r.currency} {fmtAmt(r.amount)}</div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

export default ForecastDashboard;
