import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function AnalyticsView({ recurring, onetime, entitlements }) {
  const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };
  const toSAR = (amt, cur) => (amt || 0) * (SAR_RATES[cur] || 1);

  const allItems = [
    ...recurring.map(r => ({ ...r, type: "recurring" })),
    ...onetime.filter(o => ["paid_onetime"].includes(o.status)).map(o => ({ ...o, type: "onetime" })),
    ...entitlements.filter(e => ["paid_onetime"].includes(e.status)).map(e => ({ ...e, type: "entitlement" })),
  ];

  const barColors = [C.accent, C.green, C.orange, C.gold, C.purple, C.red, "#06B6D4", "#14B8A6", "#F59E0B", "#EC4899"];

  const groupBy = (arr, key) => {
    const m = {};
    arr.forEach(item => {
      const k = item[key] || "Unknown";
      m[k] = (m[k] || 0) + toSAR(item.amount, item.currency);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const byDept   = groupBy(allItems, "department");
  const byCat    = groupBy(allItems.filter(i => i.type === "recurring"), "category");
  const byVendor = groupBy(allItems, "title");
  const maxDept  = byDept[0]?.[1] || 1;
  const maxCat   = byCat[0]?.[1] || 1;
  const maxVend  = byVendor[0]?.[1] || 1;

  const totalAll = allItems.reduce((s, i) => s + toSAR(i.amount, i.currency), 0);

  const BarChart = ({ data, max, title, valueLabel = "SAR" }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>{title}</div>
      {data.slice(0, 10).map(([label, amt], i) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: C.text, maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ color: barColors[i % barColors.length], fontFamily: "monospace", fontWeight: 700 }}>SAR {fmtAmt(Math.round(amt))}</span>
          </div>
          <div style={{ height: 6, background: C.subtle, borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${(amt / max) * 100}%`, background: barColors[i % barColors.length], borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{((amt / totalAll) * 100).toFixed(1)}% of total</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>ANALYTICS</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Cost Analytics</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>All amounts in SAR equivalent · Includes recurring + paid one-time + paid entitlements</div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { l: "TOTAL TRACKED", v: `SAR ${fmtAmt(Math.round(totalAll))}`, c: C.accent },
          { l: "DEPARTMENTS",   v: byDept.length,                          c: C.teal || "#14B8A6" },
          { l: "CATEGORIES",    v: byCat.length,                           c: C.gold  },
          { l: "VENDORS",       v: byVendor.length,                        c: C.purple},
        ].map(k => (
          <div key={k.l} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.c}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.c, fontFamily: "monospace" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <BarChart data={byDept} max={maxDept} title="SPEND BY DEPARTMENT" />
        <BarChart data={byCat}  max={maxCat}  title="SPEND BY CATEGORY (RECURRING)" />
      </div>
      <BarChart data={byVendor} max={maxVend} title="SPEND BY VENDOR / ITEM (TOP 10)" />
    </div>
  );
}

export default AnalyticsView;
