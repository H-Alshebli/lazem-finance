import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";

function PermissionsView({ showNotif, permissions, setPermissions, authUsers, setAuthUsers }) {
  const [activeRole, setActiveRole] = useState("staff");
  const [activeTab, setActiveTab] = useState("actions");
  // Use live authUsers so newly registered accounts appear immediately
  const allUsers = Object.values(authUsers || {});

  const togglePerm = (role, perm) => {
    if (role === "admin") return; // admin always has all
    setPermissions(prev => ({ ...prev, [role]: { ...prev[role], [perm]: !prev[role][perm] } }));
  };

  const togglePage = (role, pageId) => {
    if (role === "admin") return; // admin always sees all
    setPermissions(prev => {
      const pages = prev[role]?.pages || [];
      const next = pages.includes(pageId) ? pages.filter(p => p !== pageId) : [...pages, pageId];
      return { ...prev, [role]: { ...prev[role], pages: next } };
    });
  };

  const saveRole = () => { showNotif(`${ROLE_CONFIG[activeRole].label} permissions saved — nav updated live!`); };

  const roles = Object.keys(ROLE_CONFIG);
  const rc = ROLE_CONFIG[activeRole];
  const perms = permissions[activeRole] || {};
  const isAdmin = activeRole === "admin";

  const pageSections = [...new Set(ALL_PAGES.map(p => p.section))];

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>ADMIN</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Permissions & Access Control</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Configure what each role can do · Set page visibility · Assign users to roles</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
        {/* ── Role list ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 10, padding: "0 6px" }}>ROLES</div>
          {roles.map(r => {
            const rrc = ROLE_CONFIG[r];
            const actionCount = Object.entries(PERM_LABELS).filter(([k]) => permissions[r]?.[k]).length;
            const pageCount = (permissions[r]?.pages || []).length;
            const isAdminRole = r === "admin";
            return (
              <button key={r} onClick={() => setActiveRole(r)} style={{ width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:9, marginBottom:3, border: activeRole===r ? `1px solid ${rrc.color}55` : "1px solid transparent", background: activeRole===r ? rrc.color+"18" : "transparent", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:rrc.color+"22", border:`2px solid ${rrc.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:rrc.color, position:"relative" }}>
                    {rrc.label[0]}
                    {isAdminRole && <span style={{ position:"absolute", top:-4, right:-4, fontSize:9, background:"#EF4444", color:"#fff", borderRadius:4, padding:"0 3px", fontWeight:800 }}>ALL</span>}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:activeRole===r?700:500, color:activeRole===r?rrc.color:C.text }}>{rrc.label}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{isAdminRole ? "All access" : `${actionCount} actions · ${pageCount} pages`}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel ── */}
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:rc.color+"22", border:`2px solid ${rc.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:rc.color }}>{rc.label[0]}</div>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:rc.color }}>{rc.label}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{rc.desc}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {isAdmin && <span style={{ fontSize:11, background:"#EF444422", color:"#EF4444", border:"1px solid #EF444433", borderRadius:6, padding:"3px 10px", fontWeight:700 }}>🔑 Full System Access</span>}
                <button className="btn-primary" onClick={saveRole}>Save Changes</button>
              </div>
            </div>

            {/* Tab switcher */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              {[["actions","⚡ Actions & Permissions"],["pages","📄 Page Visibility"]].map(([t,l]) => (
                <button key={t} className={`tab-btn${activeTab===t?" active":""}`} onClick={() => setActiveTab(t)}>{l}</button>
              ))}
            </div>

            {/* Actions tab */}
            {activeTab === "actions" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {Object.entries(PERM_LABELS).map(([key, meta]) => {
                  const on = isAdmin ? true : !!perms[key];
                  return (
                    <div key={key} onClick={() => togglePerm(activeRole, key)}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10,
                        border:`1px solid ${on ? C.accent+"55" : C.border}`,
                        background: on ? C.accentGlow : C.subtle,
                        cursor: isAdmin ? "not-allowed" : "pointer",
                        opacity: isAdmin ? 0.8 : 1, transition:"all .2s" }}>
                      <div style={{ fontSize:18 }}>{meta.icon}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color: on ? C.accent : C.text }}>{meta.label}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{meta.desc}</div>
                      </div>
                      <div style={{ width:38, height:20, borderRadius:10, background: on ? C.accent : C.border, position:"relative", transition:"background .2s", flexShrink:0 }}>
                        <div style={{ position:"absolute", top:2, left: on ? 20 : 2, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pages tab */}
            {activeTab === "pages" && (
              <div>
                {isAdmin && <div style={{ marginBottom:12, padding:"10px 14px", background:"#EF444412", border:"1px solid #EF444433", borderRadius:8, fontSize:12, color:"#EF4444", fontWeight:600 }}>🔑 Admin has access to ALL pages — cannot be restricted</div>}
                {pageSections.map(sec => (
                  <div key={sec} style={{ marginBottom:16 }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:C.muted, marginBottom:8 }}>{sec}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {ALL_PAGES.filter(p => p.section === sec).map(page => {
                        const on = isAdmin ? true : (perms.pages || []).includes(page.id);
                        return (
                          <div key={page.id} onClick={() => togglePage(activeRole, page.id)}
                            style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10,
                              border:`1px solid ${on ? C.accent+"55" : C.border}`,
                              background: on ? C.accentGlow : C.subtle,
                              cursor: isAdmin ? "not-allowed" : "pointer",
                              opacity: isAdmin ? 0.8 : 1, transition:"all .2s" }}>
                            <span style={{ fontSize:16 }}>{page.icon}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:600, color: on ? C.accent : C.text }}>{page.label}</div>
                            </div>
                            <div style={{ width:34, height:18, borderRadius:9, background: on ? C.accent : C.border, position:"relative", flexShrink:0 }}>
                              <div style={{ position:"absolute", top:2, left: on ? 16 : 2, width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Users table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:14 }}>
              USERS WITH ROLE — {rc.label.toUpperCase()}
              <span style={{ fontWeight:400, color:C.muted, marginLeft:8 }}>({allUsers.filter(u=>u.role===activeRole).length} users)</span>
            </div>
            {allUsers.filter(u => u.role === activeRole).length === 0
              ? <div style={{ color:C.muted, fontSize:13, padding:"12px 0" }}>No users assigned to this role</div>
              : allUsers.filter(u => u.role === activeRole).map(u => {
                const roleColor = ROLE_CONFIG[u.role]?.color || C.muted;
                return (
                  <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:roleColor+"22", border:`2px solid ${roleColor}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:roleColor }}>
                      {u.name[0]}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{u.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{u.email}</div>
                    </div>
                    <select className="inp" style={{ width:140, fontSize:12 }} value={u.role}
                      onChange={e => {
                        const newRole = e.target.value;
                        setAuthUsers(prev => ({ ...prev, [u.email]: { ...prev[u.email], role: newRole } }));
                        showNotif(`${u.name} moved to ${ROLE_CONFIG[newRole]?.label || newRole}`);
                      }}>
                      {roles.map(r => <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>)}
                    </select>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PermissionsView;
