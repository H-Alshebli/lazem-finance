import { C, ROLE_CONFIG, ALL_NAV } from "../utils/constants";

export default function Sidebar({ view, setView, userRole, activePages, currentUser, logout, unreadCount, pendingCount }) {
  const role = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const visibleNav = ALL_NAV.filter(n => (activePages || role.pages || []).includes(n.id));

  const navSections = [
    { key: "main",    label: "MAIN"     },
    { key: "insights",label: "INSIGHTS" },
    { key: "admin",   label: "ADMIN"    },
  ];

  return (
    <div style={{
      width: 200, minWidth: 200, flexShrink: 0, background: C.surface,
      borderRight: `1px solid ${C.border}`, display: "flex",
      flexDirection: "column", padding: "0 0 16px", height: "100vh",
      position: "sticky", top: 0, overflowY: "auto"
    }}>
      {/* Logo */}
<img
  src="/logo.png"
  alt="Lazem Logo"
  style={{
    width: 70,
    display: "block",
    margin: "14px auto 8px",
    objectFit: "contain",
  }}
/>

      {/* Nav */}
      <div style={{ flex:1, padding:"12px 8px 0" }}>
        {navSections.map(sec => {
          const items = visibleNav.filter(n => n.section === sec.key);
          if (!items.length) return null;
          return (
            <div key={sec.key} style={{ marginBottom:16 }}>
              <div style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:2, padding:"0 8px", marginBottom:4 }}>{sec.label}</div>
              {items.map(n => {
                const active = view === n.id;
                const badge = n.id === "notifications" && unreadCount > 0;
                const approvalBadge = n.id === "approvals" && pendingCount > 0;
                return (
                  <button key={n.id} onClick={() => setView(n.id)}
                    style={{ width:"100%", textAlign:"left", padding:"8px 10px", borderRadius:8, marginBottom:2,
                      border: active ? `1px solid ${C.accent}44` : "1px solid transparent",
                      background: active ? C.accentGlow : "transparent", cursor:"pointer",
                      display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:13 }}>{n.icon}</span>
                    <span style={{ fontSize:12, fontWeight:active?700:400, color:active?C.accent:C.text, flex:1 }}>{n.label}</span>
                    {badge && <span style={{ fontSize:9, background:C.red, color:"#fff", borderRadius:10, padding:"1px 5px", fontWeight:800 }}>{unreadCount}</span>}
                    {approvalBadge && <span style={{ fontSize:9, background:C.orange, color:"#fff", borderRadius:10, padding:"1px 5px", fontWeight:800 }}>{pendingCount}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div style={{ margin:"0 8px 10px", padding:"10px 12px", background:C.card, border:`1px solid ${C.border}`, borderRadius:10 }}>
        <div style={{ fontSize:9, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:8 }}>QUICK STATS</div>
        {[["Subscriptions","—","#3B82F6"],["Overdue","—","#EF4444"],["Due This Week","—","#F59E0B"],["Pending","—","#F97316"]].map(([l,v,c])=>(
          <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
            <span style={{ color:C.muted }}>{l}</span>
            <span style={{ fontWeight:700, color:c }}>{v}</span>
          </div>
        ))}
      </div>

      {/* User + Logout */}
      <div style={{ padding:"0 8px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
          background:role.color+"12", border:`1px solid ${role.color}33`, borderRadius:10, marginBottom:8 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:role.color+"22",
            border:`2px solid ${role.color}55`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:11, fontWeight:700, color:role.color, flexShrink:0 }}>
            {currentUser?.avatar || currentUser?.name?.[0] || "?"}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:11, fontWeight:700, color:role.color, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser?.name}</div>
            <div style={{ fontSize:10, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser?.email}</div>
          </div>
        </div>
        <button onClick={logout} style={{ width:"100%", padding:"8px", background:"#EF444418",
          border:"1px solid #EF444433", borderRadius:8, color:"#EF4444",
          fontSize:12, fontWeight:600, cursor:"pointer" }}>
          ← Sign Out
        </button>
      </div>
    </div>
  );
}