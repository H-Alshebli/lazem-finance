import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "./Badge";

function WorkflowTimeline({ status, steps }) {
  const activeIdx  = steps.findIndex(s => s.key === status);
  const lastKey    = steps[steps.length - 1].key;
  const isPaid     = status === lastKey;
  const isRejected = status === "rejected";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:10, flexWrap:"wrap", rowGap:6 }}>
      {steps.map((step, i) => {
        const done    = isPaid || (activeIdx > i && activeIdx >= 0);
        const active  = !isRejected && activeIdx === i;
        const col     = done ? C.green : active ? step.color : C.muted+"44";
        const textCol = done ? C.green : active ? step.color : C.muted;
        return (
          <div key={step.key + i} style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:done||active?col+"22":"transparent", border:`2px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:col, fontWeight:700 }}>
                {done ? "✓" : i+1}
              </div>
              <div style={{ fontSize:9, color:textCol, fontWeight:active?700:400, whiteSpace:"nowrap" }}>{step.label}</div>
            </div>
            {i < steps.length-1 && <div style={{ width:18, height:2, background:done?C.green+"66":C.border, marginBottom:14, flexShrink:0 }} />}
          </div>
        );
      })}
      {isRejected && <Badge label="Rejected" color={C.red} />}
    </div>
  );
}

export default WorkflowTimeline;