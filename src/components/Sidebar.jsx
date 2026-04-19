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
      <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
        <svg viewBox="0 0 157.94 163.96" style={{ width: 52, display: "block", margin: "0 auto 6px" }} xmlns="http://www.w3.org/2000/svg">
          <defs><style>{".la1{fill:#43748e}.la2{fill:url(#lalg)}.la3{fill:#eb0045}.la4{fill:#fff}"}</style><linearGradient id="lalg" x1="75.67" y1="16.4" x2="75.67" y2="80.74" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#5ec8da"/><stop offset="1" stopColor="#284d5a"/></linearGradient></defs>
          <path className="la1" d="M19.15,144.55H11.24v-17.8c0-2.83,3.91-2.48,3.91-2.48v16.85h6.58S22.25,144.55,19.15,144.55Z"/><path className="la1" d="M32,142s-2.58,2.83-4.8,2.83a4,4,0,0,1-4.27-4.27c0-3.54,3.39-5.19,8.62-5.19v-.55c0-1.8-.69-2.61-2.67-2.61a10.27,10.27,0,0,0-2.23.29,13,13,0,0,0-2.28.73,2.65,2.65,0,0,1,2.11-3.7h0a16.57,16.57,0,0,1,2.91-.26c4.63,0,6,1.92,6,5.25v6.16c0,1.2,0,2.62.12,3.85C35.49,144.55,32,145.39,32,142Zm-.45-4.11c-3.87,0-4.92,1-4.92,2.25a1.7,1.7,0,0,0,1.8,1.74,3.41,3.41,0,0,0,3.12-3.6Z"/><path className="la1" d="M40,129.62H50.47l-7.76,11.44c.63,0,3.47,0,4.58,0h2.62s.41,3.52-2.72,3.52h-11L44,133H36.84C36.84,129.09,40,129.62,40,129.62Z"/><path className="la1" d="M61.11,144.56a11.55,11.55,0,0,1-3.07.38c-4.71,0-7.27-2.47-7.27-7.72,0-4.48,2.64-7.9,7.09-7.9s6.19,2.79,6.19,6.33a13.82,13.82,0,0,1-.15,2.17H54.68c0,2.64,1.23,4,4.11,4a11.74,11.74,0,0,0,4.33-.87A2.8,2.8,0,0,1,61.11,144.56Zm-3.46-12.42c-1.59,0-2.73,1.17-2.94,3.13h5.52C60.29,133.22,59.27,132.14,57.65,132.14Z"/><path className="la1" d="M69.57,129.62c0,.43-.06,1.7,0,2.67l0,0a5.37,5.37,0,0,1,4.93-3,3.84,3.84,0,0,1,4.12,3,5.32,5.32,0,0,1,4.86-3c2.89,0,4.48,1.59,4.48,5v8s0,2.52-3.84,2.52v-9.66c0-1.6-.37-2.59-1.78-2.59-1.68,0-3.42,2-3.42,4.87v5s.41,2.42-3.79,2.42v-9.7c0-1.47-.3-2.55-1.77-2.55-1.77,0-3.42,2.08-3.42,4.87v4.76s.44,2.62-3.85,2.62V132C66.11,129.38,69.57,129.62,69.57,129.62Z"/><path className="la2" d="M125.72,16.82a38.45,38.45,0,0,0-50,1.64,38.44,38.44,0,0,0-55.95,52.4c8.13,9.57,22.22,16,41.66,8.87,9.82-3.63,15-4.87,26.33,1.41l1.83,1c1.35.6,3.25,1.4,4.83,2,3,1.12,6.47,2.4,3.34,4.57-1.47,1-4.27,2.81-11.58.22,4.28,1.63,5.34,1.91,5.34,1.91a28.13,28.13,0,0,0,11.2.59c6.93-1.07,17.93-8,25.66-16.48.18-.19.36-.39.53-.59l.92-1a40.88,40.88,0,0,0,4.28-5.78A38.45,38.45,0,0,0,125.72,16.82Z"/><path className="la3" d="M75.67,86.14a15.66,15.66,0,0,0-6.37,1.72c-5.59,2.68-10.21,5.83-18.07,8.77-3,1.12-6.47,2.4-3.34,4.58,1.61,1.11,4.33,3.3,13.31-.5C69.32,97.28,75,95.4,82.7,99.33c0,0,2.32,1.15,2.56,3.27.15,1.24-1,2.37-5.69,2.48a11,11,0,0,0-5.13,2.11c-2.21,1.83-4,1.74-6.16,2.1-2.75.46-4.25,1.67-4.19,3.14,0,.95.39,1.85,2.29,2.8a19.22,19.22,0,0,0,6.69,1.44,31.12,31.12,0,0,0,4.09-.25,44.68,44.68,0,0,0,27.52-13.75C110.74,96.08,130,73.06,130,73.06c-7.75,9.23-19.86,17.17-27.29,18.32a28.13,28.13,0,0,1-11.2-.59s-1.41-.37-7.54-2.76C83.93,88,79.25,86.11,75.67,86.14Z"/>
        </svg>
        <div style={{ textAlign:"center", fontSize:9, color:C.muted, letterSpacing:2, fontWeight:700 }}>FINANCE PORTAL</div>
      </div>

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