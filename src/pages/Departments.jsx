import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function DepartmentsView({ deptConfig, setDeptConfig, showNotif, authUsers }) {
  const [selected, setSelected] = useState(deptConfig[0]?.id || null);
  const [edited, setEdited] = useState({});   // tracks unsaved changes per dept

  const userList = Object.values(authUsers || {});

  const dept = deptConfig.find(d => d.id === selected);
  const changes = edited[selected] || {};
  const current = dept ? { ...dept, ...changes } : null;

  const setField = (field, val) => {
    setEdited(prev => ({ ...prev, [selected]: { ...(prev[selected] || {}), [field]: val } }));
  };

  const save = () => {
    setDeptConfig(prev => prev.map(d =>
      d.id === selected ? { ...d, ...(edited[selected] || {}) } : d
    ));
    setEdited(prev => { const n = { ...prev }; delete n[selected]; return n; });
    showNotif(`${selected} department saved!`);
  };

  const hasChanges = Object.keys(edited[selected] || {}).length > 0;

  const ROLES_IN_FLOW = [
    { key: "manager",  label: "Manager",          icon: "👔", color: "#F97316", desc: "Approves L1 — first reviewer for all requests from this department" },
    { key: "vp",       label: "VP",               icon: "⭐", color: "#14B8A6", desc: "Approves entitlement requests at VP level" },
    { key: "hr",       label: "HR",               icon: "👤", color: "#A78BFA", desc: "Approves entitlement requests at HR level" },
    { key: "finance",  label: "Finance Approver", icon: "💰", color: "#F59E0B", desc: "Reviews budget and releases payments for this department" },
  ];

  const completeness = deptConfig.map(d => {
    const filled = ["manager","finance"].filter(k => d[k]).length;
    return { id: d.id, filled, total: 2 };
  });

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>ADMIN</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Department Configuration</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Assign approvers to each department · Controls who reviews requests in the approval flow</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 16 }}>

        {/* ── Department list ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 10, padding: "0 4px" }}>DEPARTMENTS</div>
          {deptConfig.map(d => {
            const comp = completeness.find(c => c.id === d.id);
            const pct = comp ? comp.filled / comp.total : 0;
            const isActive = selected === d.id;
            const hasEdit = !!edited[d.id];
            return (
              <button key={d.id} onClick={() => setSelected(d.id)}
                style={{ width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:9, marginBottom:3,
                  border: isActive ? `1px solid ${C.accent}55` : "1px solid transparent",
                  background: isActive ? C.accentGlow : "transparent", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                  <div style={{ width:32, height:32, borderRadius:9, background: pct===1 ? "#10B98122" : C.subtle, border:`1.5px solid ${pct===1 ? "#10B98155" : C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🏢</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize:12, fontWeight: isActive?700:500, color: isActive?C.accent:C.text }}>{d.name}</span>
                      {hasEdit && <span style={{ fontSize:9, background:"#F59E0B22", color:"#F59E0B", border:"1px solid #F59E0B44", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>UNSAVED</span>}
                    </div>
                    {/* mini progress bar */}
                    <div style={{ marginTop:4, height:3, borderRadius:2, background:C.border, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct*100}%`, background: pct===1 ? "#10B981" : C.accent, borderRadius:2, transition:"width .3s" }} />
                    </div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{comp?.filled}/{comp?.total} key roles assigned</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel ── */}
        {current ? (
          <div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>

              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 22 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:C.subtle, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🏢</div>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700 }}>{current.name}</div>
                    <div style={{ fontSize:12, color:C.muted }}>Assign who handles each approval stage for this department</div>
                  </div>
                </div>
                <button className="btn-primary" onClick={save} disabled={!hasChanges}
                  style={{ opacity: hasChanges ? 1 : 0.4, cursor: hasChanges ? "pointer" : "default" }}>
                  Save Changes
                </button>
              </div>

              {/* Role assignment cards */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                {ROLES_IN_FLOW.map(({ key, label, icon, color, desc }) => {
                  const assigned = current[key];
                  const assignedUser = userList.find(u => u.id === assigned || u.email === assigned);
                  return (
                    <div key={key} style={{ padding:"16px 18px", borderRadius:12, border:`1px solid ${assigned ? color+"44" : C.border}`, background: assigned ? color+"0C" : C.subtle }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                        <span style={{ fontSize:18 }}>{icon}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color: assigned ? color : C.text }}>{label}</div>
                          <div style={{ fontSize:10, color:C.muted }}>{desc}</div>
                        </div>
                      </div>

                      {/* User picker */}
                      <select
                        value={current[key] || ""}
                        onChange={e => setField(key, e.target.value)}
                        style={{ width:"100%", background:C.card, border:`1px solid ${assigned ? color+"55" : C.border}`, color: assigned ? C.text : C.muted, padding:"9px 12px", borderRadius:8, fontSize:12, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
                        <option value="">— Not assigned —</option>
                        {userList.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({ROLE_CONFIG[u.role]?.label || u.role})
                          </option>
                        ))}
                      </select>

                      {/* Assigned user badge */}
                      {assignedUser && (
                        <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:7, padding:"6px 10px", background:color+"15", border:`1px solid ${color}33`, borderRadius:7 }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", background:color+"33", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color, flexShrink:0 }}>
                            {assignedUser.name[0]}
                          </div>
                          <div>
                            <div style={{ fontSize:11, fontWeight:600, color }}>{assignedUser.name}</div>
                            <div style={{ fontSize:10, color:C.muted }}>{assignedUser.email}</div>
                          </div>
                          <div style={{ marginLeft:"auto", fontSize:9, background:color+"22", color, border:`1px solid ${color}33`, borderRadius:4, padding:"2px 6px", fontWeight:700 }}>
                            {ROLE_CONFIG[assignedUser.role]?.label}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div style={{ marginTop:16 }}>
                <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:6, fontWeight:600, letterSpacing:1 }}>NOTES (optional)</label>
                <textarea
                  value={current.notes || ""}
                  onChange={e => setField("notes", e.target.value)}
                  placeholder="Any special notes about this department's approval process..."
                  rows={2}
                  style={{ width:"100%", background:C.subtle, border:`1px solid ${C.border}`, color:C.text, padding:"10px 14px", borderRadius:9, fontSize:12, outline:"none", fontFamily:"inherit", resize:"vertical" }} />
              </div>

              {/* Staff members */}
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:10 }}>STAFF MEMBERS</div>
                <div style={{ padding:"14px 16px", borderRadius:12, border:`1px solid #6B7A9944`, background:"#6B7A9908" }}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>👥 Select users who belong to this department</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                    {(current.staff || []).map(uid => {
                      const u = userList.find(x => x.id === uid);
                      if (!u) return null;
                      return (
                        <div key={uid} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#6B7A9922", border:"1px solid #6B7A9944", borderRadius:20 }}>
                          <span style={{ fontSize:11, fontWeight:600, color:C.text }}>{u.name}</span>
                          <span style={{ fontSize:10, color:C.muted }}>·</span>
                          <span style={{ fontSize:10, color:C.muted }}>{ROLE_CONFIG[u.role]?.label || u.role}</span>
                          <button onClick={() => setField("staff", (current.staff||[]).filter(id=>id!==uid))}
                            style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13, lineHeight:1, padding:"0 0 0 2px" }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                  <select
                    value=""
                    onChange={e => {
                      if (!e.target.value) return;
                      const curr = current.staff || [];
                      if (!curr.includes(e.target.value)) setField("staff", [...curr, e.target.value]);
                    }}
                    style={{ background:C.card, border:`1px solid ${C.border}`, color:C.muted, padding:"9px 12px", borderRadius:8, fontSize:12, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
                    <option value="">+ Add staff member...</option>
                    {userList.filter(u => !(current.staff||[]).includes(u.id)).map(u => (
                      <option key={u.id} value={u.id}>{u.name} — {ROLE_CONFIG[u.role]?.label || u.role}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Flow preview */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:14 }}>APPROVAL FLOW PREVIEW — {current.name.toUpperCase()}</div>
              <div style={{ display:"flex", alignItems:"center", gap:0, flexWrap:"wrap" }}>
                {[
                  { label:"Submit", person: "Staff", color:"#6B7A99" },
                  { label:"Manager", person: userList.find(u => u.id === current.manager || u.email === current.manager)?.name || "Not set", color:"#F97316" },
                  { label:"CEO", person:"Mohammed Al-Saud", color:"#EC4899" },
                  { label:"Finance", person: userList.find(u => u.id === current.finance || u.email === current.finance)?.name || "Not set", color:"#F59E0B" },
                  { label:"CEO Release", person:"Mohammed Al-Saud", color:"#EC4899" },
                  { label:"Pay", person:"Finance Team", color:"#10B981" },
                ].map((step, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center" }}>
                    <div style={{ textAlign:"center", padding:"8px 12px", borderRadius:9, background:step.color+"15", border:`1px solid ${step.color}33`, minWidth:90 }}>
                      <div style={{ fontSize:10, color:step.color, fontWeight:700 }}>{step.label}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2, maxWidth:90, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{step.person}</div>
                    </div>
                    {i < 5 && <div style={{ color:C.muted, fontSize:14, padding:"0 4px" }}>→</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:14 }}>
            Select a department to configure
          </div>
        )}
      </div>
    </div>
  );
}

export default DepartmentsView;
