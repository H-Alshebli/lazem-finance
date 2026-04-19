import { useState } from "react";
import {
  C,
  ROLE_CONFIG,
  statusConfig,
  priorityConfig,
} from "../utils/constants";
import { fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";
import { PayInvoiceUpload } from "../components/InvoiceUpload";

// ── Correct One-Time Flow ─────────────────────────────────────────
// Submit (with quotations) → Manager → CEO → Finance Approval →
// Schedule Payment → Bank Release → Finance uploads Receipt →
// Employee uploads Invoice → Paid

function ApprovalsView({
  onetime,
  setOnetime,
  entitlements,
  setEntitlements,
  recurring,
  setRecurring,
  userRole,
  showNotif,
  logAction,
  addNotif,
  deptConfig,
  currentUser,
}) {
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [noteModal, setNoteModal] = useState(null);
  const [activeQueue, setActiveQueue] = useState("general");
  const [scheduleModal, setScheduleModal] = useState(null);
  const [bankModal, setBankModal] = useState(null);
  const [receiptModal, setReceiptModal] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    date: "",
    method: "Bank Transfer",
    note: "",
  });
  const [bankForm, setBankForm] = useState({
    ref: "",
    date: today(),
    note: "",
  });
  const [receiptFiles, setReceiptFiles] = useState([]);
  const [recPayModal, setRecPayModal] = useState(null);
  const [recPayRef, setRecPayRef] = useState("");
  const [recPayMethod, setRecPayMethod] = useState("Bank Transfer");

  const role = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const canSeeAll = role.canViewAll;
  const isAdmin = userRole === "admin";
  const canManager = userRole === "manager" || isAdmin;
  const canCEO = userRole === "ceo" || isAdmin;
  const canFinance = userRole === "finance" || isAdmin;
  const canVP = userRole === "vp" || isAdmin;
  const canHR = userRole === "hr" || isAdmin;

  const myManagedDepts = (deptConfig || [])
    .filter(
      (d) =>
        d.manager === currentUser?.id ||
        d.manager === currentUser?.email ||
        d.manager === currentUser?.uid
    )
    .map((d) => d.id);

  const deptFilter = (item) =>
    myManagedDepts.length === 0 ||
    myManagedDepts.includes(item.department) ||
    item.department === "All Company";

  const filterMgr = (items) =>
    canManager
      ? myManagedDepts.length === 0
        ? items
        : items.filter(deptFilter)
      : [];

  const addHistory = (item, status, note) => ({
    ...item,
    status,
    history: [
      ...(item.history || []),
      {
        status,
        by: currentUser?.name || "System",
        date: today(),
        note,
      },
    ],
  });

  const gen = {
    pending_manager: filterMgr(
      (onetime || []).filter((o) => o.status === "pending_manager")
    ),
    pending_ceo_1: (onetime || []).filter((o) => o.status === "pending_ceo_1"),
    pending_finance: (onetime || []).filter(
      (o) => o.status === "pending_finance"
    ),
    pending_schedule: canFinance
      ? (onetime || []).filter((o) => o.status === "pending_schedule")
      : [],
    pending_bank: canFinance
      ? (onetime || []).filter((o) => o.status === "pending_bank")
      : [],
    pending_receipt: canFinance
      ? (onetime || []).filter((o) => o.status === "pending_receipt")
      : [],
    pending_invoice: canFinance
      ? (onetime || []).filter((o) => o.status === "pending_invoice")
      : [],
  };

  const approveManager = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                managerApproval: { by: currentUser?.name, date: today() },
              },
              "pending_ceo_1",
              "Manager approved → CEO"
            )
          : o
      )
    );
    logAction &&
      logAction("approve", "one-time", id, item?.title, "Manager → CEO");
    addNotif &&
      addNotif(
        "approval_required",
        "CEO Approval Needed",
        `"${item?.title}" needs CEO approval`
      );
    showNotif("Approved → CEO!");
  };

  const approveCEO = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                ceo1Approval: { by: currentUser?.name, date: today() },
              },
              "pending_finance",
              "CEO approved → Finance review"
            )
          : o
      )
    );
    addNotif &&
      addNotif(
        "approval_required",
        "Finance Approval Needed",
        `"${item?.title}" approved by CEO — Finance must review`
      );
    showNotif("CEO approved → Finance!");
  };

  const approveFinance = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                financeApproval: { by: currentUser?.name, date: today() },
              },
              "pending_schedule",
              "Finance approved → schedule payment"
            )
          : o
      )
    );
    addNotif &&
      addNotif(
        "payment_due",
        "Payment Scheduling Required",
        `"${item?.title}" fully approved — please schedule payment`
      );
    showNotif("Finance approved → Schedule payment!");
  };

  const saveNote = (id, note) => {
    if (!note?.trim()) return;

    const addComment = (items, setter) => {
      const item = items.find((i) => i.id === id);
      if (!item) return false;

      setter((p) =>
        p.map((i) =>
          i.id === id
            ? {
                ...i,
                history: [
                  ...(i.history || []),
                  {
                    status: i.status,
                    by: currentUser?.name || "Approver",
                    date: today(),
                    note: `💬 ${note}`,
                  },
                ],
              }
            : i
        )
      );
      return true;
    };

    if (!addComment(onetime, setOnetime)) {
      if (!addComment(entitlements, setEntitlements)) {
        addComment(recurring, setRecurring);
      }
    }

    setNoteModal(null);
    showNotif("Note added!");
  };

  const rejectGen = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              { ...o, rejectionReason: rejectReason },
              "rejected",
              `Rejected: ${rejectReason}`
            )
          : o
      )
    );
    setRejectModal(null);
    setRejectReason("");
    logAction &&
      logAction("reject", "one-time", id, item?.title, `Reason: ${rejectReason}`);
    addNotif &&
      addNotif("rejected", "Request Rejected", `"${item?.title}" was rejected`);
    showNotif("Rejected.");
  };

  const schedulePayment = (id) => {
    if (!scheduleForm.date) {
      return showNotif("Schedule date required", "error");
    }

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              { ...o, paymentSchedule: { ...scheduleForm } },
              "pending_bank",
              `Scheduled: ${scheduleForm.date} via ${scheduleForm.method}`
            )
          : o
      )
    );

    setScheduleModal(null);
    setScheduleForm({ date: "", method: "Bank Transfer", note: "" });
    showNotif("Payment scheduled → Bank release!");
  };

  const bankRelease = (id) => {
    if (!bankForm.ref.trim()) {
      return showNotif("Reference number required", "error");
    }

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              { ...o, bankRelease: { ...bankForm } },
              "pending_receipt",
              `Bank released: Ref ${bankForm.ref}`
            )
          : o
      )
    );

    setBankModal(null);
    setBankForm({ ref: "", date: today(), note: "" });
    showNotif("Bank released → Upload receipt!");
  };

  const uploadReceipt = (id) => {
    if (!receiptFiles.length) {
      return showNotif("Please upload receipt file", "error");
    }

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                receiptUploaded: {
                  files: receiptFiles.map((f) => ({
                    id: f.id,
                    name: f.name,
                    size: f.size,
                    type: f.type,
                    downloadUrl: f.downloadUrl || "",
                    dataUrl: f.dataUrl || "",
                  })),
                  date: today(),
                  by: currentUser?.name,
                },
              },
              "pending_invoice",
              "Receipt uploaded → Employee must upload purchase invoice"
            )
          : o
      )
    );

    setReceiptModal(null);
    setReceiptFiles([]);

    const item = (onetime || []).find((o) => o.id === id);
    addNotif &&
      addNotif(
        "approval_required",
        "Upload Your Invoice",
        `Payment for "${item?.title}" has been processed — please upload your purchase invoice`
      );

    showNotif("Receipt uploaded → Employee uploads invoice!");
  };

  const markPaidAfterInvoice = (id) => {
    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                paymentInfo: {
                  ref: o.bankRelease?.ref || "",
                  method: o.paymentSchedule?.method || "",
                  date: today(),
                },
              },
              "paid_onetime",
              "Purchase invoice received — request closed"
            )
          : o
      )
    );

    logAction && logAction("pay", "one-time", id, item?.title, "Paid & closed");
    showNotif("Request completed! ✅");
  };

  const ent = {
    pending_manager: filterMgr(
      (entitlements || []).filter((e) => e.status === "pending_manager")
    ),
    pending_vp: (entitlements || []).filter((e) => e.status === "pending_vp"),
    pending_hr: (entitlements || []).filter((e) => e.status === "pending_hr"),
    pending_ceo_1: (entitlements || []).filter(
      (e) => e.status === "pending_ceo_1"
    ),
    pending_finance: (entitlements || []).filter(
      (e) => e.status === "pending_finance"
    ),
    pending_ceo_2: (entitlements || []).filter(
      (e) => e.status === "pending_ceo_2"
    ),
    pending_pay: (entitlements || []).filter((e) => e.status === "pending_pay"),
  };

  const rejectEnt = (id) => {
    const t = (entitlements || []).find((e) => e.id === id)?.title;
    setEntitlements((p) =>
      p.map((e) =>
        e.id === id ? { ...e, status: "rejected", rejectionReason: rejectReason } : e
      )
    );
    setRejectModal(null);
    setRejectReason("");
    showNotif("Rejected.");
    addNotif &&
      addNotif("rejected", "Entitlement Rejected", `"${t}" was rejected`);
  };

  const markPayEnt = (id) => {
    if (!recPayRef.trim()) return showNotif("Reference required", "error");

    setEntitlements((p) =>
      p.map((e) =>
        e.id === id
          ? {
              ...e,
              status: "paid_onetime",
              paymentInfo: {
                ref: recPayRef,
                method: recPayMethod,
                date: today(),
              },
            }
          : e
      )
    );

    setRecPayModal(null);
    setRecPayRef("");
    showNotif("Entitlement paid!");
  };

  const recFull = {
    pending_approval: filterMgr(
      (recurring || []).filter((r) => r.status === "pending_approval")
    ),
    pending_ceo_1_rec: (recurring || []).filter(
      (r) => r.status === "pending_ceo_1_rec"
    ),
    pending_finance_rec: (recurring || []).filter(
      (r) => r.status === "pending_finance_rec"
    ),
    pending_ceo_2_rec: (recurring || []).filter(
      (r) => r.status === "pending_ceo_2_rec"
    ),
    pending_pay_rec: (recurring || []).filter(
      (r) => r.status === "pending_pay_rec"
    ),
  };

  const rejectRec = (id) => {
    setRecurring((p) =>
      p.map((r) =>
        r.id === id ? { ...r, status: "upcoming", rejectionReason: rejectReason } : r
      )
    );
    setRejectModal(null);
    setRejectReason("");
    showNotif("Returned to upcoming.");
  };

  const markPayRec = (id) => {
    if (!recPayRef.trim()) return showNotif("Reference required", "error");

    setRecurring((p) =>
      p.map((r) =>
        r.id === id
          ? {
              ...r,
              status: "paid",
              paymentInfo: {
                ref: recPayRef,
                method: recPayMethod,
                date: today(),
              },
            }
          : r
      )
    );

    setRecPayModal(null);
    setRecPayRef("");
    showNotif("Recurring paid!");
  };

  const RequestCard = ({ r, canApprove, onApprove, btnLabel, onRejectFn, extra }) => {
    const [open, setOpen] = useState(false);
    const sc = statusConfig[r.status] || { label: r.status, color: C.muted };
    const pc = priorityConfig[r.priority] || priorityConfig.medium;
    const showAttachments = canApprove || canSeeAll;

    return (
      <div
        style={{
          background: C.subtle,
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 10,
          border: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14 }}>
                {r.title || r.employeeName}
              </span>
              <Badge label={sc.label} color={sc.color} />
              <Badge label={pc.label} color={pc.color} />
              {r.invoices?.length > 0 && (
                <Badge label={`📎 ${r.invoices.length} attachment`} color={C.muted} />
              )}
              {r.purchaseInvoices?.length > 0 && (
                <Badge label={`🧾 ${r.purchaseInvoices.length} invoice`} color="#14B8A6" />
              )}
            </div>

            <div
              style={{
                fontSize: 11,
                color: C.muted,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 6,
              }}
            >
              <span>{r.department}</span>
              <span>·</span>
              <span>{r.category || r.entitlementType}</span>
              <span>·</span>
              <span>
                By: <strong style={{ color: C.text }}>{r.submittedBy || r.employeeName}</strong>
              </span>
              <span>·</span>
              <span>{fmtDate(r.requestDate || r.submissionDate)}</span>
              {r.dueDate && (
                <>
                  <span>·</span>
                  <span style={{ color: C.gold }}>Due: {fmtDate(r.dueDate)}</span>
                </>
              )}
            </div>

            {r.notes && (
              <div
                style={{
                  fontSize: 11,
                  color: C.text + "88",
                  background: C.card,
                  padding: "6px 10px",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                📝 {r.notes}
              </div>
            )}

            {r.rejectionReason && (
              <div style={{ fontSize: 11, color: C.red, marginBottom: 6 }}>
                ❌ {r.rejectionReason}
              </div>
            )}

            {showAttachments && r.invoices?.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: C.muted,
                  marginBottom: 6,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span>📎 Quotations:</span>
                {r.invoices.map((f) => {
                  const fileUrl = f.downloadUrl || f.dataUrl;

                  return fileUrl ? (
                    <a
                      key={f.id || f.name}
                      href={fileUrl}
                      download={f.name}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        background: C.card,
                        border: `1px solid ${C.accent}44`,
                        borderRadius: 5,
                        padding: "2px 8px",
                        color: C.accent,
                        textDecoration: "none",
                        cursor: "pointer",
                      }}
                    >
                      ⬇ {f.name}
                    </a>
                  ) : (
                    <span
                      key={f.id || f.name}
                      style={{
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 5,
                        padding: "2px 8px",
                        color: C.muted,
                      }}
                      title="File URL is missing"
                    >
                      📄 {f.name}
                    </span>
                  );
                })}
              </div>
            )}

            {canFinance && r.purchaseInvoices?.length > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "#14B8A6",
                  marginBottom: 6,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span>🧾 Purchase Invoice:</span>
                {r.purchaseInvoices.map((f) => {
                  const fileUrl = f.downloadUrl || f.dataUrl;

                  return fileUrl ? (
                    <div
                      key={f.id || f.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: "#14B8A612",
                        border: `1px solid #14B8A633`,
                        borderRadius: 6,
                        padding: "3px 8px",
                      }}
                    >
                      <span style={{ color: "#14B8A6" }}>📄 {f.name}</span>
                      <a
                        href={fileUrl}
                        download={f.name}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          background: "#14B8A6",
                          color: "#fff",
                          textDecoration: "none",
                          borderRadius: 5,
                          padding: "2px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <span
                      key={f.id || f.name}
                      style={{
                        background: "#14B8A612",
                        border: `1px solid #14B8A633`,
                        borderRadius: 5,
                        padding: "2px 8px",
                        color: C.muted,
                      }}
                    >
                      📄 {f.name}
                    </span>
                  );
                })}
              </div>
            )}

            {canFinance &&
              ["pending_schedule", "pending_bank", "pending_receipt", "pending_invoice"].includes(
                r.status
              ) && (
                <div
                  style={{
                    fontSize: 11,
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    marginBottom: 6,
                    padding: "8px 10px",
                    background: C.card,
                    borderRadius: 8,
                  }}
                >
                  <span style={{ color: r.paymentSchedule ? C.green : C.muted }}>
                    {r.paymentSchedule
                      ? `✓ Scheduled: ${fmtDate(r.paymentSchedule.date)} · ${r.paymentSchedule.method}`
                      : "○ Not scheduled"}
                  </span>
                  <span style={{ color: r.bankRelease ? C.green : C.muted }}>
                    {r.bankRelease
                      ? `✓ Released: Ref ${r.bankRelease.ref}`
                      : "○ Pending bank"}
                  </span>
                  <span style={{ color: r.receiptUploaded ? C.green : C.muted }}>
                    {r.receiptUploaded ? `✓ Receipt uploaded` : "○ Receipt pending"}
                  </span>
                  <span style={{ color: r.purchaseInvoices?.length ? C.green : C.muted }}>
                    {r.purchaseInvoices?.length
                      ? `✓ Invoice received`
                      : "○ Awaiting employee invoice"}
                  </span>
                </div>
              )}

            {open && r.history?.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: "8px 10px",
                  background: C.card,
                  borderRadius: 8,
                }}
              >
                {[...(r.history || [])].reverse().map((h, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 8, fontSize: 10, marginBottom: 4 }}
                  >
                    <span style={{ color: C.muted }}>{fmtDate(h.date)}</span>
                    <span style={{ color: C.accent }}>{h.by}</span>
                    <span style={{ color: C.text }}>{h.note}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <button
                className="tab-btn"
                onClick={() => setOpen(!open)}
                style={{ fontSize: 10, padding: "3px 8px" }}
              >
                {open ? "▲ Hide" : "▼ History"}
              </button>
              <button
                onClick={() => setNoteModal({ id: r.id, note: "" })}
                style={{
                  fontSize: 10,
                  padding: "3px 10px",
                  background: C.subtle,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                  color: C.text,
                  cursor: "pointer",
                }}
              >
                📝 Add Note
              </button>
            </div>
          </div>

          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 130 }}>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: "monospace",
                marginBottom: 8,
              }}
            >
              {r.currency || "SAR"} {fmtAmt(r.amount)}
            </div>

            {canApprove && onApprove && (
              <button
                className="btn-green"
                onClick={() => onApprove(r.id)}
                style={{
                  fontSize: 12,
                  padding: "7px 16px",
                  display: "block",
                  width: "100%",
                  marginBottom: 6,
                }}
              >
                {btnLabel}
              </button>
            )}

            {canApprove && onRejectFn && (
              <button
                onClick={() => setRejectModal({ id: r.id, fn: onRejectFn })}
                style={{
                  fontSize: 12,
                  padding: "6px 16px",
                  background: C.red + "18",
                  border: `1px solid ${C.red}44`,
                  borderRadius: 8,
                  color: C.red,
                  cursor: "pointer",
                  width: "100%",
                  marginBottom: 6,
                }}
              >
                ✗ Reject
              </button>
            )}

            {extra && extra(r)}
          </div>
        </div>
      </div>
    );
  };

  const LevelSection = ({
    label,
    color,
    items,
    canApprove,
    onApprove,
    btnLabel,
    onRejectFn,
    extra,
  }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color }}>{label}</div>
        <Badge label={String(items.length)} color={color} />
        {items.length === 0 && <span style={{ fontSize: 12, color: C.green }}>✓ Clear</span>}
      </div>

      {items.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 13, paddingLeft: 4 }}>
          No items at this stage
        </div>
      ) : (
        items.map((r) => (
          <RequestCard
            key={r.id}
            r={r}
            canApprove={canApprove}
            onApprove={onApprove}
            btnLabel={btnLabel}
            onRejectFn={onRejectFn}
            extra={extra}
          />
        ))
      )}
    </div>
  );

  const generalLevels = [
    {
      label: "LEVEL 1 — MANAGER APPROVAL",
      color: C.orange,
      items: gen.pending_manager,
      canApprove: canManager,
      onApprove: approveManager,
      btnLabel: "✓ Approve → CEO",
      onRejectFn: rejectGen,
    },
    {
      label: "LEVEL 2 — CEO APPROVAL",
      color: "#EC4899",
      items: gen.pending_ceo_1,
      canApprove: canCEO,
      onApprove: approveCEO,
      btnLabel: "✓ Approve → Finance",
      onRejectFn: rejectGen,
    },
    {
      label: "LEVEL 3 — FINANCE APPROVAL",
      color: C.gold,
      items: gen.pending_finance,
      canApprove: canFinance,
      onApprove: approveFinance,
      btnLabel: "✓ Approve → Payment",
      onRejectFn: rejectGen,
    },
    {
      label: "LEVEL 4 — SCHEDULE PAYMENT",
      color: C.purple,
      items: gen.pending_schedule,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-primary"
            onClick={() => setScheduleModal(r.id)}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            📅 Schedule
          </button>
        ),
    },
    {
      label: "LEVEL 5 — BANK RELEASE",
      color: C.accent,
      items: gen.pending_bank,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-primary"
            onClick={() => setBankModal(r.id)}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            🏦 Release
          </button>
        ),
    },
    {
      label: "LEVEL 6 — UPLOAD RECEIPT",
      color: C.green,
      items: gen.pending_receipt,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-green"
            onClick={() => setReceiptModal(r.id)}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            📎 Upload Receipt
          </button>
        ),
    },
    {
      label: "LEVEL 7 — EMPLOYEE INVOICE",
      color: "#14B8A6",
      items: gen.pending_invoice,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance &&
        r.purchaseInvoices?.length > 0 && (
          <button
            className="btn-green"
            onClick={() => markPaidAfterInvoice(r.id)}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            ✅ Close & Paid
          </button>
        ),
    },
  ];

  const entLevels = [
    {
      label: "LEVEL 1 — MANAGER",
      color: C.orange,
      items: ent.pending_manager,
      canApprove: canManager,
      onApprove: (id) => {
        setEntitlements((p) =>
          p.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "pending_vp",
                  managerApproval: { by: currentUser?.name, date: today() },
                }
              : e
          )
        );
        showNotif("→ VP!");
      },
      btnLabel: "✓ → VP",
      onRejectFn: rejectEnt,
    },
    {
      label: "LEVEL 2 — VP",
      color: "#14B8A6",
      items: ent.pending_vp,
      canApprove: canVP,
      onApprove: (id) => {
        setEntitlements((p) =>
          p.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "pending_hr",
                  vpApproval: { by: currentUser?.name, date: today() },
                }
              : e
          )
        );
        showNotif("→ HR!");
      },
      btnLabel: "✓ → HR",
      onRejectFn: rejectEnt,
    },
    {
      label: "LEVEL 3 — HR",
      color: "#A78BFA",
      items: ent.pending_hr,
      canApprove: canHR,
      onApprove: (id) => {
        setEntitlements((p) =>
          p.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "pending_ceo_1",
                  hrApproval: { by: currentUser?.name, date: today() },
                }
              : e
          )
        );
        showNotif("→ CEO!");
      },
      btnLabel: "✓ → CEO",
      onRejectFn: rejectEnt,
    },
    {
      label: "LEVEL 4 — CEO",
      color: "#EC4899",
      items: ent.pending_ceo_1,
      canApprove: canCEO,
      onApprove: (id) => {
        setEntitlements((p) =>
          p.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "pending_finance",
                  ceo1Approval: { by: currentUser?.name, date: today() },
                }
              : e
          )
        );
        showNotif("→ Finance!");
      },
      btnLabel: "✓ → Finance",
      onRejectFn: rejectEnt,
    },
    {
      label: "LEVEL 5 — FINANCE",
      color: C.gold,
      items: ent.pending_finance,
      canApprove: canFinance,
      onApprove: (id) => {
        setEntitlements((p) =>
          p.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "pending_ceo_2",
                  financeApproval: { by: currentUser?.name, date: today() },
                }
              : e
          )
        );
        showNotif("→ Release!");
      },
      btnLabel: "✓ → Release",
      onRejectFn: rejectEnt,
    },
    {
      label: "LEVEL 6 — CEO RELEASE",
      color: "#EC4899",
      items: ent.pending_ceo_2,
      canApprove: canCEO,
      onApprove: (id) => {
        setEntitlements((p) =>
          p.map((e) =>
            e.id === id
              ? {
                  ...e,
                  status: "pending_pay",
                  ceo2Approval: { by: currentUser?.name, date: today() },
                }
              : e
          )
        );
        showNotif("→ Pay!");
      },
      btnLabel: "✓ → Pay",
      onRejectFn: rejectEnt,
    },
    {
      label: "LEVEL 7 — PAY",
      color: C.purple,
      items: ent.pending_pay,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-green"
            onClick={() => {
              setRecPayModal({ id: r.id, type: "entitlement" });
              setRecPayRef("");
            }}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            💳 Pay
          </button>
        ),
    },
  ];

  const recLevels = [
    {
      label: "LEVEL 1 — MANAGER",
      color: C.orange,
      items: recFull.pending_approval,
      canApprove: canManager,
      onApprove: (id) => {
        setRecurring((p) =>
          p.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "pending_ceo_1_rec",
                  managerApproval: { by: currentUser?.name, date: today() },
                }
              : r
          )
        );
        showNotif("→ CEO!");
      },
      btnLabel: "✓ → CEO",
      onRejectFn: rejectRec,
    },
    {
      label: "LEVEL 2 — CEO REVIEW",
      color: "#EC4899",
      items: recFull.pending_ceo_1_rec,
      canApprove: canCEO,
      onApprove: (id) => {
        setRecurring((p) =>
          p.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "pending_finance_rec",
                  ceo1Approval: { by: currentUser?.name, date: today() },
                }
              : r
          )
        );
        showNotif("→ Finance!");
      },
      btnLabel: "✓ → Finance",
      onRejectFn: rejectRec,
    },
    {
      label: "LEVEL 3 — FINANCE",
      color: C.gold,
      items: recFull.pending_finance_rec,
      canApprove: canFinance,
      onApprove: (id) => {
        setRecurring((p) =>
          p.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "pending_ceo_2_rec",
                  financeApproval: { by: currentUser?.name, date: today() },
                }
              : r
          )
        );
        showNotif("→ Release!");
      },
      btnLabel: "✓ → Release",
      onRejectFn: rejectRec,
    },
    {
      label: "LEVEL 4 — CEO RELEASE",
      color: "#EC4899",
      items: recFull.pending_ceo_2_rec,
      canApprove: canCEO,
      onApprove: (id) => {
        setRecurring((p) =>
          p.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "pending_pay_rec",
                  ceo2Approval: { by: currentUser?.name, date: today() },
                }
              : r
          )
        );
        showNotif("→ Pay!");
      },
      btnLabel: "✓ → Pay",
      onRejectFn: rejectRec,
    },
    {
      label: "LEVEL 5 — PAY",
      color: C.purple,
      items: recFull.pending_pay_rec,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-green"
            onClick={() => {
              setRecPayModal({ id: r.id, type: "recurring" });
              setRecPayRef("");
            }}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            💳 Pay
          </button>
        ),
    },
  ];

  const queues = {
    general: {
      label: "General Payments",
      color: C.orange,
      desc: "Manager → CEO → Finance → Schedule → Bank → Receipt → Invoice",
      levels: generalLevels,
    },
    entitlements: {
      label: "Employee Entitlements",
      color: "#14B8A6",
      desc: "Manager → VP → HR → CEO → Finance → CEO Release → Pay",
      levels: entLevels,
    },
    recurring: {
      label: "Recurring Payments",
      color: C.accent,
      desc: "Manager → CEO → Finance → CEO Release → Pay",
      levels: recLevels,
    },
  };

  const activeQ = queues[activeQueue];
  const totalForQueue = (q) => q.levels.reduce((s, l) => s + l.items.length, 0);
  const hasNoApprovals =
    !canSeeAll && !canManager && !canCEO && !canFinance && !canVP && !canHR;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 10,
            color: C.muted,
            letterSpacing: 2,
            marginBottom: 3,
          }}
        >
          WORKFLOW
        </div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Approvals</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          {canSeeAll
            ? "Full view — all pending items"
            : hasNoApprovals
            ? "Track your submitted requests here"
            : "Items in your approval queue"}
        </div>
      </div>

      {hasNoApprovals ? (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 40,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            No approvals for your role
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            Submit requests from One-Time or Entitlements and track them here.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            {Object.entries(queues).map(([key, q]) => {
              const total = totalForQueue(q);
              return (
                <button
                  key={key}
                  onClick={() => setActiveQueue(key)}
                  style={{
                    background: activeQueue === key ? q.color + "22" : C.card,
                    border: `2px solid ${activeQueue === key ? q.color : C.border}`,
                    color: activeQueue === key ? q.color : C.muted,
                    padding: "12px 20px",
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "left",
                    minWidth: 200,
                    transition: "all .2s",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span>{q.label}</span>
                    {total > 0 && (
                      <span
                        style={{
                          background: q.color,
                          color: "#fff",
                          borderRadius: 10,
                          padding: "2px 8px",
                          fontSize: 11,
                        }}
                      >
                        {total}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: activeQueue === key ? q.color : C.muted,
                      fontWeight: 400,
                    }}
                  >
                    {q.desc}
                  </div>
                </button>
              );
            })}
          </div>

          {activeQ.levels.map((l, i) => (
            <LevelSection key={i} {...l} />
          ))}
        </>
      )}

      {noteModal && (
        <div className="overlay" onClick={() => setNoteModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
              📝 Add / Edit Note
            </div>
            <textarea
              className="inp"
              rows={4}
              value={noteModal.note}
              onChange={(e) => setNoteModal({ ...noteModal, note: e.target.value })}
              placeholder="Add a note visible to all reviewers and the submitter..."
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                className="btn-primary"
                onClick={() => saveNote(noteModal.id, noteModal.note)}
                style={{ flex: 1 }}
              >
                Save Note
              </button>
              <button className="btn-ghost" onClick={() => setNoteModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModal && (
        <div className="overlay" onClick={() => setRejectModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 4,
                color: C.red,
              }}
            >
              ✗ Reject Request
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>
              This reason will be visible to the submitter.
            </div>
            <textarea
              className="inp"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                onClick={() => rejectModal.fn(rejectModal.id)}
                style={{
                  flex: 1,
                  background: C.red,
                  color: "#fff",
                  border: "none",
                  padding: 10,
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Confirm
              </button>
              <button className="btn-ghost" onClick={() => setRejectModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduleModal && (
        <div className="overlay" onClick={() => setScheduleModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 4,
                color: C.purple,
              }}
            >
              📅 Schedule Payment
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
              {(onetime || []).find((o) => o.id === scheduleModal)?.title} · SAR{" "}
              {fmtAmt((onetime || []).find((o) => o.id === scheduleModal)?.amount)}
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  PAYMENT DATE *
                </label>
                <input
                  className="inp"
                  type="date"
                  value={scheduleForm.date}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, date: e.target.value })
                  }
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  PAYMENT METHOD
                </label>
                <select
                  className="inp"
                  value={scheduleForm.method}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, method: e.target.value })
                  }
                >
                  {["Bank Transfer", "Cheque", "Cash", "Online Payment", "Credit Card"].map(
                    (m) => (
                      <option key={m}>{m}</option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  NOTE
                </label>
                <input
                  className="inp"
                  value={scheduleForm.note}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, note: e.target.value })
                  }
                  placeholder="Optional note for bank..."
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={() => schedulePayment(scheduleModal)}
                style={{ flex: 1 }}
              >
                Schedule Payment
              </button>
              <button className="btn-ghost" onClick={() => setScheduleModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bankModal && (
        <div className="overlay" onClick={() => setBankModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 440 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 4,
                color: C.accent,
              }}
            >
              🏦 Bank Release
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
              {(onetime || []).find((o) => o.id === bankModal)?.title}
            </div>
            {(onetime || []).find((o) => o.id === bankModal)?.paymentSchedule && (
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 18 }}>
                Scheduled:{" "}
                {fmtDate((onetime || []).find((o) => o.id === bankModal)?.paymentSchedule?.date)} ·{" "}
                {(onetime || []).find((o) => o.id === bankModal)?.paymentSchedule?.method}
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  TRANSACTION REFERENCE *
                </label>
                <input
                  className="inp"
                  value={bankForm.ref}
                  onChange={(e) => setBankForm({ ...bankForm, ref: e.target.value })}
                  placeholder="e.g. TRX-2026-00123"
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  RELEASE DATE
                </label>
                <input
                  className="inp"
                  type="date"
                  value={bankForm.date}
                  onChange={(e) => setBankForm({ ...bankForm, date: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={() => bankRelease(bankModal)}
                style={{ flex: 1 }}
              >
                Confirm Release
              </button>
              <button className="btn-ghost" onClick={() => setBankModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptModal && (
        <div className="overlay" onClick={() => setReceiptModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 4,
                color: C.green,
              }}
            >
              📎 Upload Payment Receipt
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
              {(onetime || []).find((o) => o.id === receiptModal)?.title}
            </div>
            <div style={{ fontSize: 12, color: C.green, marginBottom: 18 }}>
              Bank Ref: {(onetime || []).find((o) => o.id === receiptModal)?.bankRelease?.ref}
            </div>

            <PayInvoiceUpload payInvoices={receiptFiles} onChange={setReceiptFiles} />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-green"
                onClick={() => uploadReceipt(receiptModal)}
                style={{ flex: 1, opacity: receiptFiles.length ? 1 : 0.5 }}
              >
                Upload Receipt ({receiptFiles.length} file
                {receiptFiles.length !== 1 ? "s" : ""})
              </button>
              <button className="btn-ghost" onClick={() => setReceiptModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {recPayModal && (
        <div className="overlay" onClick={() => setRecPayModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 14,
                color: C.green,
              }}
            >
              💳 Record Payment
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  METHOD
                </label>
                <select
                  className="inp"
                  value={recPayMethod}
                  onChange={(e) => setRecPayMethod(e.target.value)}
                >
                  {["Bank Transfer", "Cheque", "Cash", "Online Payment"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  REFERENCE *
                </label>
                <input
                  className="inp"
                  value={recPayRef}
                  onChange={(e) => setRecPayRef(e.target.value)}
                  placeholder="e.g. TRX-2026-00456"
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-green"
                style={{ flex: 1 }}
                onClick={() =>
                  recPayModal.type === "recurring"
                    ? markPayRec(recPayModal.id)
                    : markPayEnt(recPayModal.id)
                }
              >
                Confirm Paid
              </button>
              <button className="btn-ghost" onClick={() => setRecPayModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApprovalsView;