import { useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { C, DEPARTMENTS, CATEGORIES_RECURRING, CATEGORIES_ONETIME, ROLE_CONFIG,
  statusConfig, priorityConfig, GENERAL_STEPS, ENTITLEMENT_STEPS, RECURRING_STEPS,
  SAR_RATES, DEFAULT_PERMISSIONS, ALL_PAGES } from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";

import InvoiceUpload, { PayInvoiceUpload } from "../components/InvoiceUpload";
import WorkflowTimeline from "../components/WorkflowTimeline";
function parseExcelToEntitlements(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const mapped = rows.map((r, i) => {
        const get = (...keys) => { for (const k of keys) { const found = Object.keys(r).find(rk => rk.toLowerCase().trim() === k.toLowerCase()); if (found && r[found] !== "") return String(r[found]).trim(); } return ""; };
        const rawAmt = get("Amount","Total","Cost","amount");
        const amount = parseFloat(rawAmt.replace(/[^0-9.]/g,"")) || 0;
        return {
          id: Date.now() + i,
          title:           get("Title","Request","title") || "Untitled",
          employeeName:    get("Employee Name","Employee","Name","name"),
          entitlementType: get("Type","Entitlement Type","EntitlementType") || "Overtime",
          department:      get("Department","Dept") || "All Company",
          period:          get("Period","Month","period"),
          amount,
          currency:        get("Currency","currency") || "SAR",
          priority:        get("Priority","priority") || "medium",
          notes:           get("Notes","Details","notes"),
          documents:       get("Documents","Docs","Attachments") || "",
          hoursWorked:     get("Hours","Hours Worked","hoursWorked") || "",
          ratePerHour:     get("Rate","Rate per Hour","ratePerHour") || "",
        };
      }).filter(r => r.employeeName);
      onDone(mapped);
    } catch (err) { onError(err.message); }
  };
  reader.readAsBinaryString(file);
}

function downloadEntitlementsTemplate() {
  const headers = ["Employee Name","Title","Type","Department","Period","Hours","Rate per Hour","Amount","Currency","Priority","Documents","Notes"];
  const sample = [
    ["Ahmed Al-Zahrani","Software Engineer","Overtime","IT","March 2026",20,75,1500,"SAR","medium","","Weekend work"],
    ["Sara Al-Otaibi","Manager","Travel Allowance","Sales","March 2026","","",800,"SAR","low","","Business trip to Jeddah"],
    ["Khalid Al-Rashidi","VP","Medical Reimbursement","HR","","","",2200,"SAR","high","receipt.pdf",""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Entitlements");
  XLSX.writeFile(wb, "entitlements_template.xlsx");
}

function EntitlementsView({ entitlements, setEntitlements, showNotif, userRole, username, logAction, addNotif }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const fileRef = useRef(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [payModal, setPayModal] = useState(null);
  const [payRef, setPayRef] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [payDoc, setPayDoc] = useState("");
  const [form, setForm] = useState({ title:"", employeeName:"", department:"All Company", amount:"", currency:"SAR", priority:"medium", entitlementType:"Overtime", period:"", hoursWorked:"", ratePerHour:"", documents:"", notes:"" });

  const ENTITLEMENT_TYPES = ["Overtime", "Part-Time Work", "Allowance", "Bonus", "Commission", "Other"];
  const role = ROLE_CONFIG[userRole];

  const myEntitlements = role.canViewAll
    ? entitlements
    : entitlements.filter(e => e.submittedBy === username);

  const statusTabs = [
    ["all","All"],["pending_manager","Manager"],["pending_vp","VP"],["pending_hr","HR"],
    ["pending_ceo_1","CEO Review"],["pending_finance","Finance"],["pending_ceo_2","CEO Release"],
    ["pending_pay","Pay & Docs"],["paid_onetime","Paid"],["rejected","Rejected"],
  ];

  const filtered = filterStatus === "all" ? myEntitlements : myEntitlements.filter(e => e.status === filterStatus);

  const makeRecord = (f, sub) => ({
    ...f, id: Date.now() + Math.random(), amount: +f.amount,
    submittedBy: sub || username,
    requestDate: new Date().toISOString().split("T")[0],
    requestType: "entitlement",
    status: "pending_manager",
    managerApproval:null, vpApproval:null, hrApproval:null,
    ceo1Approval:null, financeApproval:null, ceo2Approval:null,
  });

  const addItem = () => {
    if (!form.title || !form.amount || !form.employeeName) return showNotif("Title, Employee and Amount required", "error");
    const newRec = makeRecord(form);
    setEntitlements(p => [newRec, ...p]);
    setShowAdd(false);
    setForm({ title:"", employeeName:"", department:"All Company", amount:"", currency:"SAR", priority:"medium", entitlementType:"Overtime", period:"", hoursWorked:"", ratePerHour:"", documents:"", notes:"" });
    logAction && logAction("create","entitlement",newRec.id,form.title,`${form.entitlementType} · ${form.employeeName}`,+form.amount);
    addNotif && addNotif("new_submission",`Entitlement: ${form.title}`,`By ${form.employeeName} — awaiting Manager approval`);
    showNotif("Entitlement submitted for Manager approval!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setImportRows([]);
    parseExcelToEntitlements(file, setImportRows, setImportError);
    e.target.value = "";
  };
  const confirmImport = () => {
    const records = importRows.map(r => makeRecord(r));
    setEntitlements(p => [...records, ...p]);
    setShowImport(false); setImportRows([]);
    showNotif(`${records.length} entitlements imported!`);
  };

  const markPaid = (id) => {
    if (!payRef.trim()) return showNotif("Payment reference required", "error");
    const item = entitlements.find(e => e.id === id);
    setEntitlements(p => p.map(e => e.id===id ? {...e, status:"paid_onetime", paymentInfo:{ ref:payRef, method:payMethod, doc:payDoc, date:new Date().toISOString().split("T")[0] }} : e));
    setPayModal(null); setPayRef(""); setPayMethod("Bank Transfer"); setPayDoc("");
    logAction && logAction("pay","entitlement",id,item?.title,`Ref: ${payRef}`,item?.amount);
    showNotif("Entitlement payment recorded!");
  };

  const trailSteps = [
    { key:"managerApproval", label:"Manager" }, { key:"vpApproval", label:"VP" },
    { key:"hrApproval", label:"HR" }, { key:"ceo1Approval", label:"CEO" },
    { key:"financeApproval", label:"Finance" }, { key:"ceo2Approval", label:"CEO Release" },
  ];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, color:C.muted, letterSpacing:2, marginBottom:3 }}>EMPLOYEE</div>
          <div style={{ fontSize:22, fontWeight:700 }}>Entitlements</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>
            {role.canViewAll ? `Showing all ${entitlements.length} requests` : `Showing your ${myEntitlements.length} request${myEntitlements.length!==1?"s":""} · submitted as ${username}`}
          </div>
        </div>
        {role.canSubmit && (
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn-ghost" onClick={() => setShowImport(true)} style={{ fontSize:13 }}>⬆ Import Excel</button>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New Entitlement</button>
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {statusTabs.map(([v,l]) => (
          <button key={v} className={`tab-btn${filterStatus===v?" active":""}`} onClick={() => setFilterStatus(v)}>{l}
            {v!=="all" && myEntitlements.filter(e=>e.status===v).length > 0 &&
              <span style={{ marginLeft:5, background:"#14B8A644", color:"#14B8A6", borderRadius:8, padding:"0 5px", fontSize:10 }}>
                {myEntitlements.filter(e=>e.status===v).length}
              </span>}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gap:12 }}>
        {filtered.length === 0 && <div style={{ color:C.muted, textAlign:"center", padding:40 }}>
          {role.canViewAll ? "No entitlement requests found" : "You haven't submitted any entitlements yet"}
        </div>}
        {filtered.map(e => {
          const sc = statusConfig[e.status];
          return (
            <div key={e.id} style={{ background:C.card, border:`1px solid ${sc?.color+"33"||C.border}`, borderRadius:14, padding:"18px 20px", borderLeft:`4px solid ${sc?.color||C.border}` }}>
              <WorkflowTimeline status={e.status} steps={ENTITLEMENT_STEPS} />
              <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:15, fontWeight:700 }}>{e.title}</span>
                    <Badge label={e.entitlementType} color="#14B8A6" />
                    <Badge label={sc?.label||e.status} color={sc?.color||C.muted} />
                    <Badge label={priorityConfig[e.priority]?.label} color={priorityConfig[e.priority]?.color} />
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:8, display:"flex", gap:10, flexWrap:"wrap" }}>
                    <span>👤 <strong style={{ color:C.text }}>{e.employeeName}</strong></span><span>·</span>
                    <span>{e.department}</span><span>·</span>
                    <span>By: {e.submittedBy}</span><span>·</span>
                    <span>{fmtDate(e.requestDate)}</span>
                    {e.period && <><span>·</span><span style={{ color:C.gold }}>Period: {e.period}</span></>}
                    {e.hoursWorked && <><span>·</span><span style={{ color:C.accent }}>⏱ {e.hoursWorked} hrs</span></>}
                  </div>
                  {e.notes && <div style={{ fontSize:12, color:C.text+"99", background:C.subtle, padding:"7px 12px", borderRadius:8, marginBottom:8 }}>{e.notes}</div>}
                  {e.documents && <div style={{ fontSize:11, color:C.accent, marginBottom:6 }}>📎 {e.documents}</div>}
                  {e.rejectionReason && <div style={{ fontSize:12, color:C.red, background:C.red+"11", border:`1px solid ${C.red}33`, padding:"7px 12px", borderRadius:8, marginBottom:8 }}>❌ Rejected: {e.rejectionReason}</div>}
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:11 }}>
                    {trailSteps.map(s => (
                      <span key={s.key} style={{ color:e[s.key]?C.green:C.muted }}>
                        {e[s.key] ? `✓ ${s.label}: ${e[s.key].by}` : `○ ${s.label}`}
                      </span>
                    ))}
                    {e.paymentInfo && <span style={{ color:C.green }}>✓ Paid {fmtDate(e.paymentInfo.date)} · {e.paymentInfo.ref}</span>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", marginBottom:10 }}>{e.currency||"SAR"} {fmtAmt(e.amount)}</div>
                  {e.ratePerHour && <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Rate: {e.currency} {e.ratePerHour}/hr</div>}
                  {e.status==="pending_pay" && userRole==="finance" && (
                    <button className="btn-green" onClick={() => setPayModal(e.id)} style={{ fontSize:12, padding:"8px 14px" }}>💳 Pay & Upload</button>
                  )}
                  {e.status==="pending_pay" && userRole!=="finance" && (
                    <div style={{ fontSize:11, color:C.purple, fontWeight:600 }}>⏳ Awaiting finance</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>New Entitlement Request</div>
            <div style={{ fontSize:12, color:"#14B8A6", marginBottom:18 }}>Flow: Manager → VP → HR → CEO → Finance → CEO Release</div>
            <div style={{ display:"grid", gap:12 }}>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>TITLE *</label><input className="inp" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Overtime – March 2026" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>EMPLOYEE NAME *</label><input className="inp" value={form.employeeName} onChange={e=>setForm({...form,employeeName:e.target.value})} placeholder="Full name" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>ENTITLEMENT TYPE</label><select className="inp" value={form.entitlementType} onChange={e=>setForm({...form,entitlementType:e.target.value})}>{ENTITLEMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DEPARTMENT</label><select className="inp" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PERIOD</label><input className="inp" value={form.period} onChange={e=>setForm({...form,period:e.target.value})} placeholder="e.g. 01–31 March 2026" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>HOURS WORKED</label><input className="inp" type="number" value={form.hoursWorked} onChange={e=>setForm({...form,hoursWorked:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>RATE PER HOUR</label><input className="inp" type="number" value={form.ratePerHour} onChange={e=>setForm({...form,ratePerHour:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CURRENCY</label><select className="inp" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["SAR","USD","EUR"].map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>TOTAL AMOUNT *</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PRIORITY</label><select className="inp" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DOCUMENTS / ATTACHMENTS</label><input className="inp" value={form.documents} onChange={e=>setForm({...form,documents:e.target.value})} placeholder="e.g. Timesheet_March2026.pdf, Approval_Form.pdf" /></div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NOTES / JUSTIFICATION</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Hours breakdown, project details, justification..." /></div>
              <InvoiceUpload invoices={form.invoices||[]} onChange={invs=>setForm(f=>({...f,invoices:invs}))} />
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex:1 }}>Submit Entitlement</button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="overlay" onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); }}>
          <div className="modal" style={{ maxWidth:660 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ fontSize:17, fontWeight:700 }}>⬆ Import Entitlements from Excel</div>
              <button onClick={downloadEntitlementsTemplate} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#10B98118", border:"1px solid #10B98144", borderRadius:8, color:"#10B981", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇ Download Template
              </button>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Expected columns:</div>
            <div style={{ fontSize:11, color:C.accent, background:C.subtle, padding:"8px 12px", borderRadius:8, marginBottom:16, lineHeight:1.8 }}>
              <strong>Employee Name</strong> · <strong>Title</strong> · <strong>Type</strong> · <strong>Department</strong> · <strong>Period</strong> · <strong>Hours</strong> · <strong>Rate per Hour</strong> · <strong>Amount</strong> · <strong>Currency</strong> · <strong>Priority</strong> · <strong>Documents</strong> · <strong>Notes</strong>
            </div>
            <div className="import-zone" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleFileChange} />
              <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Click to upload .xlsx, .xls or .csv</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>All rows will be submitted as pending_manager</div>
            </div>
            {importError && <div style={{ color:C.red, fontSize:12, marginTop:10, padding:"8px 12px", background:C.red+"11", borderRadius:6 }}>⚠ {importError}</div>}
            {importRows.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, color:C.green, fontWeight:600, marginBottom:10 }}>✓ {importRows.length} rows detected — preview (first 8):</div>
                <div style={{ maxHeight:240, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:8 }}>
                  {importRows.slice(0,8).map((r,i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:8, padding:"8px 12px", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
                      <span style={{ fontWeight:600 }}>{r.employeeName}</span>
                      <span style={{ color:"#14B8A6" }}>{r.entitlementType}</span>
                      <span style={{ color:C.muted }}>{r.period||"—"}</span>
                      <span style={{ color:r.hoursWorked?C.accent:C.muted }}>{r.hoursWorked ? `${r.hoursWorked}h` : "—"}</span>
                      <span style={{ color:C.gold, fontFamily:"monospace" }}>{r.currency} {fmtAmt(r.amount)}</span>
                    </div>
                  ))}
                  {importRows.length > 8 && <div style={{ padding:"8px 12px", fontSize:11, color:C.muted }}>...and {importRows.length-8} more</div>}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:12 }}>
                  <button className="btn-green" onClick={confirmImport} style={{ flex:1 }}>Import All {importRows.length} Entitlements</button>
                  <button className="btn-ghost" onClick={() => setImportRows([])}>Clear</button>
                </div>
              </div>
            )}
            <button className="btn-ghost" onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); }} style={{ marginTop:12, width:"100%", textAlign:"center" }}>Close</button>
          </div>
        </div>
      )}

      {payModal && (
        <div className="overlay" onClick={() => setPayModal(null)}>
          <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4, color:C.green }}>💳 Record Entitlement Payment</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:18 }}>{entitlements.find(e=>e.id===payModal)?.title} — {entitlements.find(e=>e.id===payModal)?.employeeName}</div>
            <div style={{ display:"grid", gap:12 }}>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT METHOD</label><select className="inp" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{["Bank Transfer","Cheque","Cash","Online Payment"].map(m=><option key={m}>{m}</option>)}</select></div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>REFERENCE *</label><input className="inp" value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="e.g. TRX-2026-00456" /></div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DOCUMENT / RECEIPT</label><input className="inp" value={payDoc} onChange={e=>setPayDoc(e.target.value)} placeholder="e.g. Payslip_March2026.pdf" /></div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-green" onClick={() => markPaid(payModal)} style={{ flex:1 }}>Confirm & Save</button>
              <button className="btn-ghost" onClick={() => setPayModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default EntitlementsView;