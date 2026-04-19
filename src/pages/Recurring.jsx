import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";

import InvoiceUpload, { PayInvoiceUpload } from "../components/InvoiceUpload";
import WorkflowTimeline from "../components/WorkflowTimeline";
function parseExcelToRecurring(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const mapped = rows.map((r, i) => {
        const get = (...keys) => { for (const k of keys) { const found = Object.keys(r).find(rk => rk.toLowerCase().trim() === k.toLowerCase()); if (found && r[found] !== "") return String(r[found]).trim(); } return ""; };
        const rawAmt = get("Total Cost", "Cost", "Amount");
        const amount = parseFloat(rawAmt.replace(/[^0-9.]/g, "")) || 0;
        const currency = rawAmt.includes("$") ? "USD" : rawAmt.toLowerCase().includes("dinar") || rawAmt.includes("KWD") ? "KWD" : "SAR";
        const rawDate = get("Renewal Date", "Due Date", "RenewalDate");
        let renewalDate = "";
        if (rawDate) { try { const d = new Date(rawDate); if (!isNaN(d)) renewalDate = d.toISOString().split("T")[0]; else renewalDate = rawDate; } catch { renewalDate = rawDate; } }
        const rawCategory = get("Category", "Type", "Cat");
        const validCategories = ["Subscriptions", "Iqama", "Service", "Utility", "Insurance", "Other"];
        const category = validCategories.find(c => c.toLowerCase() === rawCategory.toLowerCase()) || (rawCategory ? "Other" : "Subscriptions");
        const rawStatus = get("Status");
        const status = ["upcoming","overdue","paid"].find(s => s.toLowerCase() === rawStatus.toLowerCase()) || "upcoming";
        const rawPriority = get("Priority");
        const priority = ["high","medium","low"].find(p => p.toLowerCase() === rawPriority.toLowerCase()) || "medium";
        return {
          id: Date.now() + i,
          title: get("Subscription Name", "Name", "Title"),
          details: get("Details", "Description"),
          purpose: get("Purpose") || "",
          department: get("Department") || "All Company",
          subcategory: get("Sub-Group", "SubGroup", "Subcategory") || "",
          frequency: get("Billing Cycle", "Frequency") || "Monthly",
          licenses: parseInt(get("Number of Users / Licenses", "Licenses", "Users")) || 1,
          amount, currency, renewalDate,
          category, status, priority,
          paymentMethod: get("Payment Method"),
          notes: get("Notes"),
        };
      }).filter(r => r.title);
      onDone(mapped);
    } catch (err) { onError(err.message); }
  };
  reader.readAsBinaryString(file);
}

function downloadRecurringTemplate() {
  const headers = ["Name","Category","Details","Department","Purpose","Billing Cycle","Number of Users / Licenses","Total Cost","Payment Method","Renewal Date","Status","Priority","Notes"];
  const sample = [
    ["Microsoft 365","Subscriptions","Business Basic licenses","IT","Email and productivity","Monthly",50,2500,"Credit Card","2026-05-01","upcoming","high","Renewed annually"],
    ["AWS Hosting","Subscriptions","Production servers","IT","Cloud infrastructure","Monthly",1,"","Bank Transfer","2026-04-15","upcoming","high",""],
    ["Iqama Renewal - Ahmed","Iqama","","HR","Employee Iqama","Yearly",1,400,"","2026-09-01","upcoming","medium",""],
    ["Office Rent","Service","HQ Building","Admin","Monthly rent","Monthly",1,15000,"Bank Transfer","2026-04-01","upcoming","high",""],
    ["Electricity","Utility","Main office","Admin","","Monthly",1,800,"","2026-04-05","upcoming","low",""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recurring Payments");
  XLSX.writeFile(wb, "recurring_payments_template.xlsx");
}

function RecurringView({ recurring, setRecurring, showNotif, userRole, username, logAction, addNotif }) {
  const [showAdd, setShowAdd]       = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab]   = useState("Subscriptions");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const fileRef = useRef();
  const [form, setForm] = useState({
    title:"", details:"", purpose:"", category:"Subscriptions", subcategory:"",
    department:"All Company", frequency:"Monthly", licenses:"", amount:"",
    currency:"SAR", renewalDate:"", priority:"medium", paymentMethod:"", notes:""
  });

  // filter by top-level tab + status + search
  const tabItems = useMemo(() => {
    let list = recurring.filter(r => r.category === activeTab);
    if (filterStatus === "overdue") list = list.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0);
    else if (filterStatus === "due14") list = list.filter(r => { const d = daysUntil(r.renewalDate); return d >= 0 && d <= 14 && r.status !== "paid"; });
    else if (filterStatus !== "all") list = list.filter(r => r.status === filterStatus);
    if (search) list = list.filter(r => [r.title, r.details, r.department, r.purpose, r.notes].join(" ").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [recurring, activeTab, filterStatus, search]);

  // group by subcategory; items without subcategory go into ""
  const groups = useMemo(() => {
    const map = {};
    tabItems.forEach(r => {
      const key = r.subcategory || "";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    // sort each group by renewalDate
    Object.values(map).forEach(g => g.sort((a,b) => new Date(a.renewalDate||"9999") - new Date(b.renewalDate||"9999")));
    return map;
  }, [tabItems]);

  const groupKeys = useMemo(() => {
    const keys = Object.keys(groups);
    // "" (no subcat) first, then alphabetical
    return ["", ...keys.filter(k => k !== "").sort()];
  }, [groups]);

  const markPaid     = (id) => { setRecurring(p => p.map(r => r.id===id ? {...r,status:"paid"}    : r)); showNotif("Marked as paid!"); };
  const markUpcoming = (id) => { setRecurring(p => p.map(r => r.id===id ? {...r,status:"upcoming"}: r)); };
  const deleteItem   = (id) => { if (window.confirm("Remove this item?")) { setRecurring(p => p.filter(r => r.id!==id)); showNotif("Removed."); } };
  const toggleGroup  = (key) => setCollapsedGroups(p => ({...p, [key]: !p[key]}));

  const addItem = () => {
    if (!form.title || !form.renewalDate) return showNotif("Name and Renewal Date required", "error");
    setRecurring(p => [...p, { ...form, id:Date.now(), amount:+form.amount||0, licenses:+form.licenses||1, status:"upcoming" }]);
    setShowAdd(false);
    setForm({ title:"", details:"", purpose:"", category:"Subscriptions", subcategory:"", department:"All Company", frequency:"Monthly", licenses:"", amount:"", currency:"SAR", renewalDate:"", priority:"medium", paymentMethod:"", notes:"" });
    showNotif("Added!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError("");
    parseExcelToRecurring(file, rows => setImportRows(rows), err => setImportError("Error: " + err));
    e.target.value = "";
  };

  const confirmImport = () => {
    setRecurring(p => [...p, ...importRows.map(r => ({...r}))]);
    setImportRows([]); setShowImport(false);
    showNotif(`${importRows.length} items imported!`);
  };

  // tab summary counts
  const tabSummary = useMemo(() => {
    const res = {};
    CATEGORIES_RECURRING.forEach(cat => {
      const items = recurring.filter(r => r.category === cat);
      res[cat] = {
        total: items.length,
        overdue: items.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0).length,
      };
    });
    return res;
  }, [recurring]);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:10, color:C.muted, letterSpacing:2, marginBottom:3 }}>MANAGEMENT</div>
          <div style={{ fontSize:22, fontWeight:700 }}>Recurring Payments</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{tabItems.length} items in <span style={{ color:C.accent }}>{activeTab}</span></div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn-ghost" onClick={() => setShowImport(true)}>⬆ Import Excel</button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Item</button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {CATEGORIES_RECURRING.map(cat => {
          const s = tabSummary[cat] || {};
          const active = activeTab === cat;
          return (
            <button key={cat} onClick={() => { setActiveTab(cat); setFilterStatus("all"); setSearch(""); }}
              style={{
                background: active ? C.accentGlow : C.card,
                border: `1px solid ${active ? C.accent+"66" : C.border}`,
                color: active ? C.accent : C.muted,
                padding:"8px 16px", borderRadius:10, fontSize:13,
                fontWeight: active ? 700 : 400, cursor:"pointer", display:"flex", alignItems:"center", gap:8, transition:"all .2s"
              }}>
              {cat}
              <span style={{ background: active ? C.accent : C.subtle, color: active ? "#fff" : C.muted, borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{s.total||0}</span>
              {s.overdue > 0 && <span style={{ background:C.red+"22", color:C.red, borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>⚠{s.overdue}</span>}
            </button>
          );
        })}
      </div>

      {/* Search + status filters */}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        <input className="inp" placeholder="Search name, account, details..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:270 }} />
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {[["all","All"],["overdue","Overdue"],["due14","Due 14d"],["upcoming","Upcoming"],["paid","Paid"]].map(([v,l]) => (
            <button key={v} className={`tab-btn${filterStatus===v?" active":""}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div style={{ background:C.surface, borderRadius:"8px 8px 0 0", border:`1px solid ${C.border}`, padding:"8px 14px", display:"grid", gridTemplateColumns:"2.8fr 0.9fr 1fr 1.1fr 0.9fr 0.7fr 0.8fr", gap:8, fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1 }}>
        <span>NAME / DETAILS</span><span>DEPT</span><span>PURPOSE</span><span>RENEWAL DATE</span><span>AMOUNT</span><span>STATUS</span><span>ACTIONS</span>
      </div>
      <div style={{ border:`1px solid ${C.border}`, borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden", marginBottom:24 }}>
        {tabItems.length === 0 && <div style={{ padding:36, textAlign:"center", color:C.muted }}>No items found in {activeTab}</div>}

        {groupKeys.map(gKey => {
          const items = groups[gKey];
          if (!items?.length) return null;
          const isCollapsed = collapsedGroups[gKey];
          const subColor = SUBCAT_COLORS[gKey] || C.accent;
          const groupTotal = items.filter(r => r.status !== "paid").reduce((s,r)=>(s+(r.amount||0)),0);
          const groupOverdue = items.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0).length;

          return (
            <div key={gKey}>
              {/* Sub-group header (only if has a name) */}
              {gKey && (
                <div onClick={() => toggleGroup(gKey)} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"10px 14px", background:subColor+"15",
                  borderBottom:`1px solid ${subColor}33`, cursor:"pointer",
                  borderLeft:`4px solid ${subColor}`
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:subColor }}>{gKey}</span>
                    <span style={{ fontSize:11, color:C.muted }}>{items.length} lines</span>
                    {groupOverdue > 0 && <Badge label={`${groupOverdue} overdue`} color={C.red} />}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:12, fontWeight:700, fontFamily:"monospace", color:subColor }}>SAR {fmtAmt(Math.round(groupTotal))} / mo</span>
                    <span style={{ color:C.muted, fontSize:14 }}>{isCollapsed ? "▶" : "▼"}</span>
                  </div>
                </div>
              )}

              {/* Rows */}
              {!isCollapsed && items.map((r, idx) => {
                const days     = r.renewalDate ? daysUntil(r.renewalDate) : null;
                const isOvrd   = r.status !== "paid" && days !== null && days < 0;
                const isUrgent = !isOvrd && days !== null && days <= 7 && r.status !== "paid";
                return (
                  <div key={r.id} className="card-row" style={{
                    display:"grid", gridTemplateColumns:"2.8fr 0.9fr 1fr 1.1fr 0.9fr 0.7fr 0.8fr",
                    gap:8, padding:"10px 14px", alignItems:"center",
                    background: isOvrd ? C.red+"08" : idx%2===0 ? C.card : C.card+"99",
                    borderBottom:`1px solid ${C.border}`,
                    borderLeft: isOvrd ? `3px solid ${C.red}` : isUrgent ? `3px solid ${C.gold}` : gKey ? `3px solid ${subColor}44` : "3px solid transparent",
                  }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{r.title}</div>
                      {r.details && <div style={{ fontSize:11, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:280 }} title={r.details}>{r.details}</div>}
                      {r.notes && <div style={{ fontSize:10, color:C.gold, marginTop:1 }}>⚠ {r.notes}</div>}
                    </div>
                    <div style={{ fontSize:12, color:C.muted }}>{r.department || "—"}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{r.purpose || "—"}</div>
                    <div>
                      {r.renewalDate
                        ? <><div style={{ fontSize:12, fontWeight: isOvrd||isUrgent?700:400, color:isOvrd?C.red:isUrgent?C.gold:C.text }}>{fmtDate(r.renewalDate)}</div>
                            <div style={{ fontSize:10, color:isOvrd?C.red:isUrgent?C.gold:C.muted }}>{isOvrd?`${Math.abs(days)}d overdue`:`${days}d left`} · {r.frequency}</div></>
                        : <div style={{ fontSize:11, color:C.muted }}>— · {r.frequency}</div>
                      }
                    </div>
                    <div>
                      {r.amount > 0
                        ? <><div style={{ fontSize:13, fontWeight:700, fontFamily:"monospace" }}>{r.currency} {fmtAmt(r.amount)}</div>
                            {r.licenses > 0 && <div style={{ fontSize:10, color:C.muted }}>{r.licenses} seat{r.licenses!==1?"s":""}</div>}</>
                        : <div style={{ fontSize:11, color:C.muted }}>TBD</div>
                      }
                    </div>
                    <div>
                      <Badge
                        label={isOvrd ? "Overdue" : statusConfig[r.status]?.label || r.status}
                        color={isOvrd ? C.red : statusConfig[r.status]?.color || C.muted}
                      />
                    </div>
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      {(r.status === "upcoming" || r.status === "overdue") && (
                        <button className="btn-ghost" onClick={()=>{ setRecurring(p=>p.map(x=>x.id===r.id?{...x,status:"pending_approval"}:x)); showNotif("Submitted for approval!"); }} style={{ fontSize:11, padding:"3px 10px", color:C.orange, borderColor:C.orange+"44" }}>→ Submit</button>
                      )}
                      {r.status === "pending_approval" && (
                        <span style={{ fontSize:10, color:C.orange, fontWeight:600 }}>⏳ Pending</span>
                      )}
                      {(r.status === "pending_ceo_1_rec" || r.status === "pending_finance_rec" || r.status === "pending_ceo_2_rec" || r.status === "pending_pay_rec") && (
                        <span style={{ fontSize:10, color:C.accent, fontWeight:600 }}>🔄 In Review</span>
                      )}
                      {r.status === "paid" && (
                        <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>✓ Paid</span>
                      )}
                      <button className="btn-ghost" onClick={()=>deleteItem(r.id)} style={{ fontSize:11, padding:"3px 8px", color:C.red, borderColor:C.red+"33" }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="overlay" onClick={()=>setShowAdd(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:20 }}>Add Recurring Item</div>
            <div style={{ display:"grid", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NAME *</label><input className="inp" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. STC Business" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CATEGORY</label><select className="inp" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES_RECURRING.map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DETAILS (account #, plan, etc.)</label><input className="inp" value={form.details} onChange={e=>setForm({...form,details:e.target.value})} placeholder="Account number, domain name, plan..." /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DEPARTMENT</label><select className="inp" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PURPOSE</label><input className="inp" value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} placeholder="e.g. Tablet SIM card for project" /></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>SUB-GROUP (optional, e.g. "STC Business Medical")</label><input className="inp" value={form.subcategory} onChange={e=>setForm({...form,subcategory:e.target.value})} placeholder="Groups similar items together" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>AMOUNT</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CURRENCY</label><select className="inp" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["SAR","USD","EUR","KWD","AED"].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>SEATS / LINES</label><input className="inp" type="number" value={form.licenses} onChange={e=>setForm({...form,licenses:e.target.value})} placeholder="1" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>BILLING CYCLE</label><select className="inp" value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{["Monthly","Quarterly","Semi-Annual","Yearly"].map(f=><option key={f}>{f}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>RENEWAL DATE *</label><input className="inp" type="date" value={form.renewalDate} onChange={e=>setForm({...form,renewalDate:e.target.value})} /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PRIORITY</label><select className="inp" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT METHOD</label><input className="inp" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})} placeholder="Credit card, bank transfer..." /></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NOTES</label><textarea className="inp" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Any additional notes (Arabic supported)" /></div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex:1 }}>Add Item</button>
              <button className="btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="overlay" onClick={()=>{ setShowImport(false); setImportRows([]); setImportError(""); }}>
          <div className="modal" style={{ maxWidth:640 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ fontSize:17, fontWeight:700 }}>⬆ Import from Excel / CSV</div>
              <button onClick={downloadRecurringTemplate} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#10B98118", border:"1px solid #10B98144", borderRadius:8, color:"#10B981", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇ Download Template
              </button>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:18 }}>
              Expected columns: <span style={{ color:C.accent }}>Name · <strong style={{color:"#10B981"}}>Category</strong> · Details · Department · Purpose · Billing Cycle · Number of Users / Licenses · Total Cost · Payment Method · Renewal Date · Status · Priority · Notes</span>
              <br/><span style={{ color:C.muted, fontSize:11 }}>Category values: Subscriptions · Iqama · Service · Utility · Insurance · Other (defaults to Subscriptions if blank)</span>
            </div>
            <div className="import-zone" onClick={()=>fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleFileChange} />
              <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Click to upload .xlsx, .xls or .csv</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Your existing spreadsheet format is supported</div>
            </div>
            {importError && <div style={{ color:C.red, fontSize:12, marginTop:10, padding:"8px 12px", background:C.red+"11", borderRadius:6 }}>⚠ {importError}</div>}
            {importRows.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, color:C.green, fontWeight:600, marginBottom:10 }}>✓ {importRows.length} rows detected — preview (first 10):</div>
                <div style={{ maxHeight:220, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:8 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:8, padding:"6px 12px", background:"#2A3655", fontSize:10, fontWeight:700, color:"#6B7A99", letterSpacing:1 }}>
                    <span>ITEM</span><span>CATEGORY</span><span>DEPT</span><span>AMOUNT</span><span>RENEWAL</span>
                  </div>
                  {importRows.slice(0,10).map((r,i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:8, padding:"8px 12px", borderBottom:`1px solid #253047`, fontSize:12 }}>
                      <span style={{ fontWeight:600 }}>{r.title}</span>
                      <span style={{ color:"#3B82F6", fontWeight:600 }}>{r.category}</span>
                      <span style={{ color:"#6B7A99" }}>{r.department}</span>
                      <span style={{ color:"#F59E0B", fontFamily:"monospace" }}>{r.currency} {fmtAmt(r.amount)}</span>
                      <span style={{ color:"#6B7A99" }}>{fmtDate(r.renewalDate)}</span>
                    </div>
                  ))}
                  {importRows.length > 10 && <div style={{ padding:"8px 12px", fontSize:11, color:C.muted }}>...and {importRows.length-10} more rows</div>}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:12 }}>
                  <button className="btn-green" onClick={confirmImport} style={{ flex:1 }}>Import All {importRows.length} Items</button>
                  <button className="btn-ghost" onClick={()=>setImportRows([])}>Clear</button>
                </div>
              </div>
            )}
            <button className="btn-ghost" onClick={()=>{ setShowImport(false); setImportRows([]); setImportError(""); }} style={{ marginTop:12, width:"100%", textAlign:"center" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecurringView;