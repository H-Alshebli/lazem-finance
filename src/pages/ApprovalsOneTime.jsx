import { useState } from "react";
import {
  C,
  ROLE_CONFIG,
  statusConfig,
  priorityConfig,
  COMPANY_OPTIONS,
  BANK_OPTIONS,
} from "../utils/constants";
import { fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";
import { PayInvoiceUpload } from "../components/InvoiceUpload";

function ApprovalsOneTimeView({
  onetime,
  setOnetime,
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

  const [scheduleModal, setScheduleModal] = useState(null);
  const [ceoRescheduleModal, setCeoRescheduleModal] = useState(null);
  const [ceoFinanceNoteModal, setCeoFinanceNoteModal] = useState(null);
  const [bankModal, setBankModal] = useState(null);
  const [receiptModal, setReceiptModal] = useState(null);

  const [scheduleForm, setScheduleForm] = useState({
    approvedDate: "",
    method: "Bank Transfer",
    companyName: COMPANY_OPTIONS[0] || "",
    bankName: BANK_OPTIONS[0] || "",
    note: "",
  });

  const [ceoRescheduleForm, setCeoRescheduleForm] = useState({
    date: "",
    note: "",
  });

  const [ceoFinanceNote, setCeoFinanceNote] = useState("");

  const [bankForm, setBankForm] = useState({
    ref: "",
    date: today(),
    note: "",
  });

  const [receiptFiles, setReceiptFiles] = useState([]);

  const role = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const canSeeAll = role.canViewAll;
  const isAdmin = userRole === "admin";
  const canManager = userRole === "manager" || isAdmin;
  const canCEO = userRole === "ceo" || isAdmin;
  const canFinance = userRole === "finance" || isAdmin;

  const myManagedDepts = (deptConfig || [])
    .filter(
      (d) =>
        d.manager === currentUser?.id ||
        d.manager === currentUser?.email ||
        d.manager === currentUser?.uid
    )
    .map((d) => d.id);

  const getApprovalDepartment = (item) =>
    item.approvalDepartment || item.department || "";

  const deptFilter = (item) => myManagedDepts.includes(getApprovalDepartment(item));
  const filterMgr = (items) => (canManager ? items.filter(deptFilter) : []);

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

  const queues = {
    pending_manager: filterMgr(
      (onetime || []).filter((o) => o.status === "pending_manager")
    ),
    pending_ceo_1: (onetime || []).filter((o) => o.status === "pending_ceo_1"),
    pending_finance: (onetime || []).filter((o) => o.status === "pending_finance"),
    pending_schedule_finance: canFinance
      ? (onetime || []).filter((o) => o.status === "pending_schedule_finance")
      : [],
    pending_schedule_ceo: canCEO || canFinance
      ? (onetime || []).filter((o) => o.status === "pending_schedule_ceo")
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

    logAction?.("approve", "one-time", id, item?.title, "Manager → CEO");
    addNotif?.(
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

    addNotif?.(
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
              "pending_schedule_finance",
              "Finance approved → create finance schedule"
            )
          : o
      )
    );

    addNotif?.(
      "payment_due",
      "Finance Schedule Required",
      `"${item?.title}" fully approved — finance must set the schedule`
    );
    showNotif("Finance approved → Schedule stage!");
  };

  const validateScheduleForm = () => {
    if (!scheduleForm.approvedDate) {
      showNotif("Approved schedule date is required", "error");
      return false;
    }
    if (!scheduleForm.method) {
      showNotif("Payment method is required", "error");
      return false;
    }
    if (!scheduleForm.companyName?.trim()) {
      showNotif("Company name is required", "error");
      return false;
    }
    if (
      scheduleForm.method === "Bank Transfer" &&
      !scheduleForm.bankName?.trim()
    ) {
      showNotif("Bank name is required for bank transfer", "error");
      return false;
    }
    return true;
  };

  const openFinanceScheduleModal = (r) => {
    const defaultDate =
      r.financeSchedule?.approvedDate ||
      r.requestedPaymentDate ||
      r.dueDate ||
      "";

    setScheduleModal(r.id);
    setScheduleForm({
      approvedDate: defaultDate,
      method: r.financeSchedule?.method || "Bank Transfer",
      companyName: r.financeSchedule?.companyName || COMPANY_OPTIONS[0] || "",
      bankName: r.financeSchedule?.bankName || BANK_OPTIONS[0] || "",
      note: r.financeSchedule?.note || "",
    });
  };

  const saveFinanceSchedule = (id) => {
    if (!validateScheduleForm()) return;

    const item = (onetime || []).find((o) => o.id === id);
    const hadCEOApproval = !!item?.ceoScheduleApproval;
    const currentSchedule = item?.financeSchedule || null;

    const changedAfterCEO =
      hadCEOApproval &&
      (currentSchedule?.approvedDate !== scheduleForm.approvedDate ||
        currentSchedule?.method !== scheduleForm.method ||
        currentSchedule?.companyName !== scheduleForm.companyName ||
        (scheduleForm.method === "Bank Transfer"
          ? currentSchedule?.bankName !== scheduleForm.bankName
          : false));

    const historyNote = changedAfterCEO
      ? `Finance rescheduled after CEO approval → back to CEO approval (${scheduleForm.approvedDate} via ${scheduleForm.method})`
      : `Finance scheduled payment for ${scheduleForm.approvedDate} via ${scheduleForm.method}`;

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                financeSchedule: {
                  approvedDate: scheduleForm.approvedDate,
                  method: scheduleForm.method,
                  companyName: scheduleForm.companyName,
                  bankName:
                    scheduleForm.method === "Bank Transfer"
                      ? scheduleForm.bankName
                      : "",
                  note: scheduleForm.note || "",
                  scheduledAt: today(),
                  scheduledBy: currentUser?.name || "Finance",
                  requestedDate: o.requestedPaymentDate || o.dueDate || "",
                },
                ceoScheduleApproval: changedAfterCEO ? null : o.ceoScheduleApproval,
              },
              "pending_schedule_ceo",
              historyNote
            )
          : o
      )
    );

    addNotif?.(
      "approval_required",
      "CEO Schedule Approval Needed",
      `"${item?.title}" schedule is ready for CEO approval`
    );

    setScheduleModal(null);
    setScheduleForm({
      approvedDate: "",
      method: "Bank Transfer",
      companyName: COMPANY_OPTIONS[0] || "",
      bankName: BANK_OPTIONS[0] || "",
      note: "",
    });

    showNotif(
      changedAfterCEO
        ? "Rescheduled → back to CEO approval!"
        : "Finance schedule saved → CEO schedule approval!"
    );
  };

  const approveCEOSchedule = (id) => {
    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                ceoScheduleApproval: {
                  by: currentUser?.name,
                  date: today(),
                  autoApproved: false,
                },
              },
              "pending_bank",
              "CEO approved finance schedule → Bank release"
            )
          : o
      )
    );

    addNotif?.(
      "payment_due",
      "Ready for Bank Release",
      `"${item?.title}" schedule approved by CEO`
    );

    showNotif("CEO approved schedule → Bank release!");
  };

  const openCeoRescheduleModal = (r) => {
    setCeoRescheduleModal(r.id);
    setCeoRescheduleForm({
      date: r.financeSchedule?.approvedDate || "",
      note: "",
    });
  };

  const saveCeoReschedule = (id) => {
    if (!ceoRescheduleForm.date) {
      showNotif("New schedule date is required", "error");
      return;
    }

    const item = (onetime || []).find((o) => o.id === id);
    const oldDate = item?.financeSchedule?.approvedDate || "";

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                financeSchedule: {
                  ...(o.financeSchedule || {}),
                  approvedDate: ceoRescheduleForm.date,
                  note: ceoRescheduleForm.note || o.financeSchedule?.note || "",
                  rescheduledByCEO: true,
                  rescheduledAt: today(),
                },
                ceoScheduleApproval: {
                  by: currentUser?.name,
                  date: today(),
                  autoApproved: false,
                },
              },
              "pending_bank",
              `CEO rescheduled payment date from ${oldDate || "-"} to ${ceoRescheduleForm.date}${
                ceoRescheduleForm.note ? ` · Note: ${ceoRescheduleForm.note}` : ""
              }`
            )
          : o
      )
    );

    setCeoRescheduleModal(null);
    setCeoRescheduleForm({ date: "", note: "" });
    showNotif("CEO rescheduled and approved → Bank release!");
  };

  const sendCeoNoteToFinance = (id) => {
    if (!ceoFinanceNote.trim()) {
      showNotif("CEO note is required", "error");
      return;
    }

    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                ceoScheduleApproval: null,
              },
              "pending_schedule_finance",
              `CEO sent note to Finance: ${ceoFinanceNote}`
            )
          : o
      )
    );

    addNotif?.(
      "approval_required",
      "CEO Note to Finance",
      `CEO requested finance action on "${item?.title}"`
    );

    setCeoFinanceNoteModal(null);
    setCeoFinanceNote("");
    showNotif("Returned to Finance with CEO note!");
  };

  const saveNote = (id, note) => {
    if (!note?.trim()) return;

    setOnetime((p) =>
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

    setNoteModal(null);
    showNotif("Note added!");
  };

  const rejectOneTime = (id) => {
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
    logAction?.("reject", "one-time", id, item?.title, `Reason: ${rejectReason}`);
    addNotif?.("rejected", "Request Rejected", `"${item?.title}" was rejected`);
    showNotif("Rejected.");
  };

  const bankRelease = (id) => {
    if (!bankForm.ref.trim()) {
      showNotif("Reference number required", "error");
      return;
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
      showNotif("Please upload receipt file", "error");
      return;
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
    addNotif?.(
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
                  method: o.financeSchedule?.method || "",
                  date: today(),
                },
              },
              "paid_onetime",
              "Purchase invoice received — request closed"
            )
          : o
      )
    );

    logAction?.("pay", "one-time", id, item?.title, "Paid & closed");
    showNotif("Request completed! ✅");
  };

  const RequestCard = ({ r, canApprove, onApprove, btnLabel, onRejectFn, extra }) => {
    const [open, setOpen] = useState(false);
    const sc = statusConfig[r.status] || { label: r.status, color: C.muted };
    const pc = priorityConfig[r.priority] || priorityConfig.medium;
  const showAttachments = canSeeAll || canManager || canCEO || canFinance;
    const displayRequestedDate = r.requestedPaymentDate || r.dueDate;
    const requestedFor = r.department || "-";
    const approvalFlow = getApprovalDepartment(r) || "-";

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
              <span style={{ fontWeight: 700, fontSize: 14 }}>{r.title}</span>
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
              <span>Requested For: {requestedFor}</span>
              <span>·</span>
              <span>Approval Flow: {approvalFlow}</span>
              <span>·</span>
              <span>{r.category}</span>
              <span>·</span>
              <span>
                By: <strong style={{ color: C.text }}>{r.submittedBy}</strong>
              </span>
              <span>·</span>
              <span>{fmtDate(r.requestDate)}</span>
              {displayRequestedDate && (
                <>
                  <span>·</span>
                  <span style={{ color: C.gold }}>
                    Requested Payment Date: {fmtDate(displayRequestedDate)}
                  </span>
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
                  position: "relative",
                  zIndex: 1,
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
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: C.card,
                        border: `1px solid ${C.accent}44`,
                        borderRadius: 5,
                        padding: "2px 8px",
                        color: C.accent,
                        textDecoration: "none",
                        cursor: "pointer",
                        position: "relative",
                        zIndex: 5,
                        pointerEvents: "auto",
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
                    >
                      📄 {f.name}
                    </span>
                  );
                })}
              </div>
            )}

            {r.financeSchedule && (
              <div
                style={{
                  fontSize: 11,
                  marginBottom: 6,
                  padding: "8px 10px",
                  background: C.card,
                  borderRadius: 8,
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ color: C.purple, fontWeight: 700 }}>
                  Finance Schedule
                </div>
                <div style={{ color: C.text }}>
                  Approved Date: {fmtDate(r.financeSchedule.approvedDate)}
                </div>
                <div style={{ color: C.text }}>
                  Method: {r.financeSchedule.method}
                </div>
                <div style={{ color: C.text }}>
                  Company: {r.financeSchedule.companyName}
                </div>
                {r.financeSchedule.method === "Bank Transfer" &&
                  r.financeSchedule.bankName && (
                    <div style={{ color: C.text }}>
                      Bank: {r.financeSchedule.bankName}
                    </div>
                  )}
                {r.financeSchedule.note && (
                  <div style={{ color: C.muted }}>
                    Note: {r.financeSchedule.note}
                  </div>
                )}
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
                  position: "relative",
                  zIndex: 1,
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
                        position: "relative",
                        zIndex: 2,
                      }}
                    >
                      <span style={{ color: "#14B8A6" }}>📄 {f.name}</span>
                      <a
                        href={fileUrl}
                        download={f.name}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          background: "#14B8A6",
                          color: "#fff",
                          textDecoration: "none",
                          borderRadius: 5,
                          padding: "2px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                          position: "relative",
                          zIndex: 5,
                          pointerEvents: "auto",
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

            {(canFinance || canCEO) &&
              [
                "pending_schedule_finance",
                "pending_schedule_ceo",
                "pending_bank",
                "pending_receipt",
                "pending_invoice",
              ].includes(r.status) && (
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
                  <span style={{ color: r.financeSchedule ? C.green : C.muted }}>
                    {r.financeSchedule
                      ? `✓ Finance Schedule: ${fmtDate(r.financeSchedule.approvedDate)}`
                      : "○ Finance schedule pending"}
                  </span>
                  <span style={{ color: r.ceoScheduleApproval ? C.green : C.muted }}>
                    {r.ceoScheduleApproval
                      ? `✓ CEO Schedule Approved${r.ceoScheduleApproval.autoApproved ? " (Auto)" : ""}`
                      : "○ CEO schedule pending"}
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

          <div style={{ textAlign: "right", flexShrink: 0, minWidth: 170 }}>
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

  const levels = [
    {
      label: "LEVEL 1 — MANAGER APPROVAL",
      color: C.orange,
      items: queues.pending_manager,
      canApprove: canManager,
      onApprove: approveManager,
      btnLabel: "✓ Approve → CEO",
      onRejectFn: rejectOneTime,
    },
    {
      label: "LEVEL 2 — CEO APPROVAL",
      color: "#EC4899",
      items: queues.pending_ceo_1,
      canApprove: canCEO,
      onApprove: approveCEO,
      btnLabel: "✓ Approve → Finance",
      onRejectFn: rejectOneTime,
    },
    {
      label: "LEVEL 3 — FINANCE APPROVAL",
      color: C.gold,
      items: queues.pending_finance,
      canApprove: canFinance,
      onApprove: approveFinance,
      btnLabel: "✓ Approve → Schedule",
      onRejectFn: rejectOneTime,
    },
    {
      label: "LEVEL 4 — FINANCE SCHEDULE",
      color: C.purple,
      items: queues.pending_schedule_finance,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-primary"
            onClick={() => openFinanceScheduleModal(r)}
            style={{ fontSize: 12, padding: "7px 16px" }}
          >
            📅 Schedule / Reschedule
          </button>
        ),
    },
    {
      label: "LEVEL 5 — CEO SCHEDULE APPROVAL",
      color: "#C026D3",
      items: queues.pending_schedule_ceo,
      canApprove: canCEO,
      onApprove: approveCEOSchedule,
      btnLabel: "✓ Approve Schedule",
      onRejectFn: rejectOneTime,
      extra: (r) => (
        <>
          {canCEO && (
            <button
              className="btn-primary"
              onClick={() => openCeoRescheduleModal(r)}
              style={{ fontSize: 12, padding: "7px 16px", width: "100%", marginBottom: 6 }}
            >
              📅 Reschedule
            </button>
          )}
          {canCEO && (
            <button
              onClick={() => {
                setCeoFinanceNoteModal(r.id);
                setCeoFinanceNote("");
              }}
              style={{
                fontSize: 12,
                padding: "6px 16px",
                background: C.subtle,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.gold,
                cursor: "pointer",
                width: "100%",
                marginBottom: 6,
              }}
            >
              📝 Send to Finance
            </button>
          )}
          {canFinance && (
            <button
              className="btn-primary"
              onClick={() => openFinanceScheduleModal(r)}
              style={{ fontSize: 12, padding: "7px 16px", width: "100%" }}
            >
              📅 Finance Reschedule
            </button>
          )}
        </>
      ),
    },
    {
      label: "LEVEL 6 — BANK RELEASE",
      color: C.accent,
      items: queues.pending_bank,
      canApprove: canFinance,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) => (
        <>
          {canFinance && (
            <button
              className="btn-primary"
              onClick={() => openFinanceScheduleModal(r)}
              style={{ fontSize: 12, padding: "7px 16px", width: "100%", marginBottom: 6 }}
            >
              📅 Reschedule Before Release
            </button>
          )}
          {canFinance && (
            <button
              className="btn-primary"
              onClick={() => setBankModal(r.id)}
              style={{ fontSize: 12, padding: "7px 16px", width: "100%" }}
            >
              🏦 Release
            </button>
          )}
        </>
      ),
    },
    {
      label: "LEVEL 7 — UPLOAD RECEIPT",
      color: C.green,
      items: queues.pending_receipt,
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
      label: "LEVEL 8 — EMPLOYEE INVOICE",
      color: "#14B8A6",
      items: queues.pending_invoice,
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

  const totalPending = levels.reduce((sum, level) => sum + level.items.length, 0);
  const hasNoApprovals = !canSeeAll && !canManager && !canCEO && !canFinance;

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
        <div style={{ fontSize: 22, fontWeight: 700 }}>One-Time Approvals</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          {canSeeAll
            ? "Full view — all pending one-time items"
            : hasNoApprovals
            ? "Track one-time requests here"
            : "One-time items in your approval queue"}
        </div>
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.orange}55`,
          borderRadius: 12,
          padding: "12px 18px",
          marginBottom: 20,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ color: C.orange, fontWeight: 700 }}>General Payments</div>
        <Badge label={String(totalPending)} color={C.orange} />
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
            No one-time approvals for your role
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            Submit one-time requests and track them here.
          </div>
        </div>
      ) : (
        levels.map((l, i) => <LevelSection key={i} {...l} />)
      )}

      {noteModal && (
        <div className="overlay" onClick={() => setNoteModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
              📝 Add Note
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
            style={{ maxWidth: 480 }}
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
              📅 Finance Schedule
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
              {(onetime || []).find((o) => o.id === scheduleModal)?.title} · SAR{" "}
              {fmtAmt((onetime || []).find((o) => o.id === scheduleModal)?.amount)}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  APPROVED SCHEDULE DATE *
                </label>
                <input
                  className="inp"
                  type="date"
                  value={scheduleForm.approvedDate}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, approvedDate: e.target.value })
                  }
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  PAYMENT METHOD *
                </label>
                <select
                  className="inp"
                  value={scheduleForm.method}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      method: e.target.value,
                      bankName:
                        e.target.value === "Bank Transfer"
                          ? scheduleForm.bankName || BANK_OPTIONS[0] || ""
                          : "",
                    })
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
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  COMPANY NAME *
                </label>
                <select
                  className="inp"
                  value={scheduleForm.companyName}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, companyName: e.target.value })
                  }
                >
                  {COMPANY_OPTIONS.map((company) => (
                    <option key={company} value={company}>
                      {company}
                    </option>
                  ))}
                </select>
              </div>

              {scheduleForm.method === "Bank Transfer" && (
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    BANK NAME *
                  </label>
                  <select
                    className="inp"
                    value={scheduleForm.bankName}
                    onChange={(e) =>
                      setScheduleForm({ ...scheduleForm, bankName: e.target.value })
                    }
                  >
                    {BANK_OPTIONS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  NOTE
                </label>
                <input
                  className="inp"
                  value={scheduleForm.note}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, note: e.target.value })
                  }
                  placeholder="Optional schedule note..."
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={() => saveFinanceSchedule(scheduleModal)}
                style={{ flex: 1 }}
              >
                Save Schedule
              </button>
              <button className="btn-ghost" onClick={() => setScheduleModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {ceoRescheduleModal && (
        <div className="overlay" onClick={() => setCeoRescheduleModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: "#C026D3" }}>
              📅 CEO Reschedule
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  NEW DATE *
                </label>
                <input
                  className="inp"
                  type="date"
                  value={ceoRescheduleForm.date}
                  onChange={(e) =>
                    setCeoRescheduleForm({ ...ceoRescheduleForm, date: e.target.value })
                  }
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  NOTE
                </label>
                <textarea
                  className="inp"
                  rows={3}
                  value={ceoRescheduleForm.note}
                  onChange={(e) =>
                    setCeoRescheduleForm({ ...ceoRescheduleForm, note: e.target.value })
                  }
                  placeholder="Optional CEO note..."
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={() => saveCeoReschedule(ceoRescheduleModal)}
                style={{ flex: 1 }}
              >
                Save & Approve
              </button>
              <button className="btn-ghost" onClick={() => setCeoRescheduleModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {ceoFinanceNoteModal && (
        <div className="overlay" onClick={() => setCeoFinanceNoteModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16, color: C.gold }}>
              📝 CEO Note to Finance
            </div>

            <textarea
              className="inp"
              rows={4}
              value={ceoFinanceNote}
              onChange={(e) => setCeoFinanceNote(e.target.value)}
              placeholder="Explain what Finance should do..."
            />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={() => sendCeoNoteToFinance(ceoFinanceNoteModal)}
                style={{ flex: 1 }}
              >
                Send to Finance
              </button>
              <button className="btn-ghost" onClick={() => setCeoFinanceNoteModal(null)}>
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
            {(onetime || []).find((o) => o.id === bankModal)?.financeSchedule && (
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 18 }}>
                Scheduled:{" "}
                {fmtDate((onetime || []).find((o) => o.id === bankModal)?.financeSchedule?.approvedDate)} ·{" "}
                {(onetime || []).find((o) => o.id === bankModal)?.financeSchedule?.method}
              </div>
            )}
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
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
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
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
    </div>
  );
}

export default ApprovalsOneTimeView;