import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function ReportsView({ recurring, onetime, entitlements }) {
  const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };
  const toSAR = (a, c) => (a || 0) * (SAR_RATES[c] || 1);
  const [reportType, setReportType] = useState("monthly");
  const [format, setFormat] = useState("excel");

  const buildMonthlyData = () => {
    const rows = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const total = recurring
        .filter(r => r.frequency === "Monthly" && !["paid","rejected"].includes(r.status))
        .reduce((s, r) => s + toSAR(r.amount, r.currency), 0);
      rows.push({ Month: label, "Recurring (SAR)": Math.round(total), "One-Time (SAR)": 0, "Entitlements (SAR)": 0 });
    }
    return rows;
  };

  const buildDeptData = () => {
    const m = {};
    [...recurring, ...onetime, ...entitlements].forEach(i => {
      const dept = i.department || "Unknown";
      m[dept] = (m[dept] || 0) + toSAR(i.amount, i.currency);
    });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([dept, amt]) => ({ Department: dept, "Total Spend (SAR)": Math.round(amt) }));
  };

  const buildVendorData = () => {
    const m = {};
    [...recurring, ...onetime].forEach(i => {
      const v = i.title || "Unknown";
      if (!m[v]) m[v] = { Vendor: v, "Total (SAR)": 0, Category: i.category || "", Department: i.department || "" };
      m[v]["Total (SAR)"] += Math.round(toSAR(i.amount, i.currency));
    });
    return Object.values(m).sort((a,b) => b["Total (SAR)"] - a["Total (SAR)"]);
  };

  const getData = () => {
    if (reportType === "monthly") return buildMonthlyData();
    if (reportType === "department") return buildDeptData();
    return buildVendorData();
  };

  const exportExcel = () => {
    const data = getData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType);
    XLSX.writeFile(wb, `RequestFlow_${reportType}_report.xlsx`);
  };

  const exportCSV = () => {
    const data = getData();
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `RequestFlow_${reportType}.csv`; a.click();
  };

  const reports = [
    { id: "monthly",    label: "Monthly Spend",    icon: "📅", desc: "Projected spend per month across all categories" },
    { id: "department", label: "Department Spend",  icon: "🏢", desc: "Total spend grouped by department" },
    { id: "vendor",     label: "Vendor Spend",      icon: "🏪", desc: "Total spend per vendor / subscription item" },
  ];

  const data = getData();

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>EXPORTS</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Financial Reports</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Export spend data in Excel or CSV format</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {reports.map(r => (
          <div key={r.id} onClick={() => setReportType(r.id)} style={{ background: reportType===r.id ? C.accentGlow : C.card, border: `1px solid ${reportType===r.id ? C.accent+"66" : C.border}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all .2s" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{r.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: reportType===r.id ? C.accent : C.text }}>{r.label}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{r.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center" }}>
        <div style={{ fontSize: 13, color: C.muted }}>Export as:</div>
        {["excel","csv"].map(f => (
          <button key={f} className={`tab-btn${format===f?" active":""}`} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
        ))}
        <button className="btn-primary" onClick={format === "excel" ? exportExcel : exportCSV} style={{ marginLeft: "auto" }}>
          ⬇ Download {reports.find(r=>r.id===reportType)?.label} ({format.toUpperCase()})
        </button>
      </div>

      {/* Preview Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: C.subtle, fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>
          PREVIEW — {reports.find(r=>r.id===reportType)?.label.toUpperCase()} ({data.length} rows)
        </div>
        {data.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(data[0]).length}, 1fr)`, padding: "8px 16px", background: C.card, fontSize: 10, color: C.muted, fontWeight: 700 }}>
              {Object.keys(data[0]).map(h => <div key={h} style={{ padding: "4px 0" }}>{h}</div>)}
            </div>
            {data.slice(0, 10).map((row, i) => (
              <div key={i} className="card-row" style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(row).length}, 1fr)`, padding: "8px 16px", borderTop: `1px solid ${C.border}` }}>
                {Object.values(row).map((val, j) => <div key={j} style={{ fontSize: 12, color: C.text }}>{val}</div>)}
              </div>
            ))}
            {data.length > 10 && <div style={{ padding: "10px 16px", fontSize: 11, color: C.muted }}>...and {data.length - 10} more rows in export</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportsView;
