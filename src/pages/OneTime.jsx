import { useEffect, useMemo, useState } from "react";
import {
  C,
  DEPARTMENTS,
  CATEGORIES_ONETIME,
  ROLE_CONFIG,
  statusConfig,
  priorityConfig,
  GENERAL_STEPS,
} from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";
import WorkflowTimeline from "../components/WorkflowTimeline";
import InvoiceUpload from "../components/InvoiceUpload";

function OnetimeView({
  onetime,
  setOnetime,
  showNotif,
  userRole,
  username,
  logAction,
  addNotif,
  currentUser,
  deptConfig,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [reschedModal, setReschedModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [editModal, setEditModal] = useState(null);

  const role = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const isFinance = userRole === "finance" || userRole === "admin";
  const isAdmin = userRole === "admin";
  const canSeeAll = role.canViewAll;

  const resolveUserDepartments = () => {
    const uidOrId = currentUser?.uid || currentUser?.id;
    const email = currentUser?.email;

    const fromDeptConfig = (deptConfig || [])
      .filter((d) => {
        const staff = Array.isArray(d.staff) ? d.staff : [];
        return staff.includes(uidOrId) || (email && staff.includes(email));
      })
      .map((d) => d.id);

    const fromProfile = currentUser?.department ? [currentUser.department] : [];

    return [...new Set([...fromDeptConfig, ...fromProfile])].filter(Boolean);
  };

  const userDepartments = useMemo(resolveUserDepartments, [deptConfig, currentUser]);
  const creatorDepartment = userDepartments[0] || "";
  const isITRequester =
    isAdmin || creatorDepartment === "IT" || userDepartments.includes("IT");

  const getDefaultTargetDepartment = () => {
    if (isITRequester) return "IT";
    return creatorDepartment || "";
  };

  const buildInitialForm = () => ({
    title: "",
    category: "Equipment",
    department: getDefaultTargetDepartment(),
    approvalDepartment: isITRequester ? "IT" : creatorDepartment || "",
    creatorDepartment: creatorDepartment || "",
    amount: "",
    currency: "SAR",
    priority: "medium",
    dueDate: "",
    notes: "",
    invoices: [],
  });

  const [form, setForm] = useState(buildInitialForm);

  const [editForm, setEditForm] = useState({
    title: "",
    category: "Equipment",
    department: getDefaultTargetDepartment(),
    approvalDepartment: isITRequester ? "IT" : creatorDepartment || "",
    creatorDepartment: creatorDepartment || "",
    amount: "",
    currency: "SAR",
    priority: "medium",
    dueDate: "",
    notes: "",
    invoices: [],
  });

  const myRequests = canSeeAll
    ? onetime || []
    : (onetime || []).filter(
        (o) =>
          o.submittedBy === username ||
          o.submittedById === currentUser?.uid ||
          o.submittedById === currentUser?.id
      );

  const statusTabs = [
    ["all", "All"],
    ["pending_manager", "Pending Manager"],
    ["pending_ceo_1", "CEO Approval"],
    ["pending_finance", "Finance Approval"],
    ["pending_schedule_preparation", "Schedule Preparation"],
    ["pending_schedule_review", "Schedule Review"],
    ["pending_schedule_final_approval", "Final Schedule Approval"],
    ["pending_bank_release", "Bank Release"],
    ["pending_receipt", "Upload Receipt"],
    ["pending_invoice", "Upload Invoice"],
    ["paid_onetime", "Paid"],
    ["rejected", "Rejected"],
  ];

  const filtered =
    filterStatus === "all"
      ? myRequests
      : myRequests.filter((o) => o.status === filterStatus);

  const resetForm = () => {
    setForm(buildInitialForm());
  };

  useEffect(() => {
    if (!showAdd) {
      setForm(buildInitialForm());
    }
  }, [creatorDepartment, isITRequester, showAdd]);

  useEffect(() => {
    if (!editModal) {
      setEditForm({
        title: "",
        category: "Equipment",
        department: getDefaultTargetDepartment(),
        approvalDepartment: isITRequester ? "IT" : creatorDepartment || "",
        creatorDepartment: creatorDepartment || "",
        amount: "",
        currency: "SAR",
        priority: "medium",
        dueDate: "",
        notes: "",
        invoices: [],
      });
    }
  }, [creatorDepartment, isITRequester, editModal]);

  const hasValidInvoiceLink = (files = []) =>
    files.every(
      (f) =>
        (typeof f?.downloadUrl === "string" && f.downloadUrl.trim()) ||
        (typeof f?.dataUrl === "string" && f.dataUrl.trim())
    );

  const validateRequestForm = (data, isEdit = false) => {
    if (!data.title?.trim()) {
      showNotif("Title is required", "error");
      return false;
    }

    if (!data.amount || Number(data.amount) <= 0) {
      showNotif("Valid amount is required", "error");
      return false;
    }

    if (!data.notes?.trim()) {
      showNotif("Justification note is required", "error");
      return false;
    }

    if (!data.dueDate) {
      showNotif("Requested payment date is required", "error");
      return false;
    }

    if (!data.department?.trim()) {
      showNotif("Department is required", "error");
      return false;
    }

    if (!Array.isArray(data.invoices) || data.invoices.length === 0) {
      showNotif(
        isEdit
          ? "At least one quotation attachment is required"
          : "Please upload at least one quotation attachment",
        "error"
      );
      return false;
    }

    if (!hasValidInvoiceLink(data.invoices)) {
      showNotif(
        "One or more quotation files are missing a valid file link. Please re-upload them.",
        "error"
      );
      return false;
    }

    return true;
  };

  const addItem = () => {
    if (!validateRequestForm(form)) return;

    const targetDepartment = isITRequester
      ? form.department
      : creatorDepartment || form.department || "";

    const approvalDepartment = isITRequester
      ? "IT"
      : creatorDepartment || form.department || "";

    const newItem = {
      ...form,
      id: uid(),
      amount: +form.amount,
      department: targetDepartment,
      approvalDepartment,
      creatorDepartment: creatorDepartment || "",
      submittedBy: username,
      submittedById: currentUser?.uid || currentUser?.id,
      submittedByEmail: currentUser?.email || "",
      requestDate: today(),
      requestedPaymentDate: form.dueDate,
      status: "pending_manager",
      history: [
        {
          status: "pending_manager",
          by: username,
          date: today(),
          note: `Request submitted with quotations · Requested for ${targetDepartment} · Approval flow ${approvalDepartment}`,
        },
      ],
      managerApproval: null,
      ceo1Approval: null,
      financeApproval: null,
      financeSchedule: null,
      ceoScheduleApproval: null,
      bankRelease: null,
      receiptUploaded: null,
      purchaseInvoices: [],
    };

    setOnetime((p) => [newItem, ...(p || [])]);
    setShowAdd(false);
    resetForm();

    if (logAction) {
      logAction(
        "create",
        "one-time",
        newItem.id,
        newItem.title,
        `${newItem.category} · Requested For ${newItem.department} · Approval Flow ${newItem.approvalDepartment}`,
        +newItem.amount
      );
    }

    if (addNotif) {
      addNotif(
        "new_submission",
        `New Request: ${newItem.title}`,
        `Submitted by ${username} — awaiting Manager approval`
      );
    }

    showNotif("Request submitted for Manager approval!");
  };

  const saveNote = () => {
    if (!noteModal?.note?.trim()) return;

    setOnetime((p) =>
      p.map((o) =>
        o.id === noteModal.id
          ? {
              ...o,
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `💬 ${noteModal.note}`,
                },
              ],
            }
          : o
      )
    );

    setNoteModal(null);
    showNotif("Note added!");
  };

  const reschedule = () => {
    if (!reschedModal?.date) return;

    setOnetime((p) =>
      p.map((o) =>
        o.id === reschedModal.id
          ? {
              ...o,
              dueDate: reschedModal.date,
              requestedPaymentDate: reschedModal.date,
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `Requested payment date updated to ${reschedModal.date}`,
                },
              ],
            }
          : o
      )
    );

    setReschedModal(null);
    showNotif("Requested payment date updated!");
  };

  const canEditRequest = (r) => {
    if (isAdmin) return true;

    const isMyReq =
      r.submittedBy === username ||
      r.submittedById === currentUser?.uid ||
      r.submittedById === currentUser?.id;

    return (
      isMyReq &&
      ["pending_manager", "pending_ceo_1", "pending_finance"].includes(r.status)
    );
  };

  const openEditModal = (r) => {
    setEditForm({
      title: r.title || "",
      category: r.category || "Equipment",
      department: r.department || getDefaultTargetDepartment(),
      approvalDepartment:
        r.approvalDepartment || (isITRequester ? "IT" : creatorDepartment || ""),
      creatorDepartment: r.creatorDepartment || creatorDepartment || "",
      amount: r.amount || "",
      currency: r.currency || "SAR",
      priority: r.priority || "medium",
      dueDate: r.requestedPaymentDate || r.dueDate || "",
      notes: r.notes || "",
      invoices: Array.isArray(r.invoices) ? r.invoices : [],
    });
    setEditModal(r.id);
  };

  const saveEditRequest = () => {
    if (!validateRequestForm(editForm, true)) return;

    const targetDepartment = isITRequester
      ? editForm.department
      : creatorDepartment || editForm.department || "";

    const approvalDepartment = isITRequester
      ? "IT"
      : creatorDepartment || editForm.department || "";

    setOnetime((p) =>
      p.map((o) =>
        o.id === editModal
          ? {
              ...o,
              title: editForm.title,
              category: editForm.category,
              department: targetDepartment,
              approvalDepartment,
              creatorDepartment: editForm.creatorDepartment || creatorDepartment || "",
              amount: +editForm.amount,
              currency: editForm.currency,
              priority: editForm.priority,
              dueDate: editForm.dueDate,
              requestedPaymentDate: editForm.dueDate,
              notes: editForm.notes,
              invoices: editForm.invoices,
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `Request updated by requester/admin · Requested for ${targetDepartment} · Approval flow ${approvalDepartment}`,
                },
              ],
            }
          : o
      )
    );

    if (logAction) {
      logAction(
        "edit",
        "one-time",
        editModal,
        editForm.title,
        `Request details updated · Requested For ${targetDepartment} · Approval Flow ${approvalDepartment}`
      );
    }

    setEditModal(null);
    showNotif("Request updated successfully!");
  };

  const uploadPurchaseInvoice = () => {
    if (!invoiceFiles.length) {
      return showNotif("Please upload at least one invoice file", "error");
    }

    setOnetime((p) =>
      p.map((o) =>
        o.id === invoiceModal
          ? {
              ...o,
              purchaseInvoices: invoiceFiles.map((f) => ({
                id: f.id || uid(),
                name: f.name || "",
                size: f.size || 0,
                type: f.type || "",
                uploadedAt: f.uploadedAt || today(),
                downloadUrl: f.downloadUrl || "",
                dataUrl: f.dataUrl || "",
              })),
              history: [
                ...(o.history || []),
                {
                  status: "pending_invoice",
                  by: username,
                  date: today(),
                  note: `Purchase invoice uploaded (${invoiceFiles.length} file${
                    invoiceFiles.length !== 1 ? "s" : ""
                  }) — Finance will close`,
                },
              ],
            }
          : o
      )
    );

    setInvoiceModal(null);
    setInvoiceFiles([]);

    if (addNotif) {
      addNotif(
        "approval_required",
        "Purchase Invoice Received",
        `Employee uploaded invoice — please review and close`
      );
    }

    showNotif("Purchase invoice uploaded successfully!");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              letterSpacing: 2,
              marginBottom: 3,
            }}
          >
            REQUESTS
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            One-Time Requests
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {canSeeAll
              ? `Showing all ${(onetime || []).length} requests`
              : `Your ${myRequests.length} request${myRequests.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {role.canSubmit && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + New Request
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {statusTabs.map(([v, l]) => {
          const count = myRequests.filter((o) => o.status === v).length;

          return (
            <button
              key={v}
              className={`tab-btn${filterStatus === v ? " active" : ""}`}
              onClick={() => setFilterStatus(v)}
            >
              {l}
              {v !== "all" && count > 0 && (
                <span
                  style={{
                    marginLeft: 5,
                    background: C.accent + "44",
                    color: C.accent,
                    borderRadius: 8,
                    padding: "0 5px",
                    fontSize: 10,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>
            {canSeeAll
              ? "No requests found"
              : "You haven't submitted any requests yet"}
          </div>
        )}

        {filtered.map((r) => {
          const sc = statusConfig[r.status] || { label: r.status, color: C.muted };
          const pc = priorityConfig[r.priority] || priorityConfig.medium;
          const displayRequestedDate =
            r.financeSchedule?.approvedDate || r.requestedPaymentDate || r.dueDate;

          const isOverdue =
            displayRequestedDate &&
            daysUntil(displayRequestedDate) < 0 &&
            !["paid_onetime", "rejected"].includes(r.status);

          const expanded = expandedId === r.id;
          const isMyReq =
            r.submittedBy === username ||
            r.submittedById === currentUser?.uid ||
            r.submittedById === currentUser?.id;

          const inPayment = [
            "pending_schedule_preparation",
            "pending_schedule_review",
            "pending_schedule_final_approval",
            "pending_bank_release",
            "pending_receipt",
          ].includes(r.status);

          const hasUploadedPurchaseInvoice =
            Array.isArray(r.purchaseInvoices) && r.purchaseInvoices.length > 0;

          const showPurchaseInvoiceUpload =
            isMyReq &&
            r.status === "pending_invoice" &&
            !hasUploadedPurchaseInvoice;

          const requestedFor = r.department || "-";
          const approvalFlow = r.approvalDepartment || r.department || "-";

          return (
            <div
              key={r.id}
              style={{
                background: C.card,
                borderRadius: 14,
                padding: "18px 20px",
                border: `1px solid ${
                  showPurchaseInvoiceUpload
                    ? "#14B8A644"
                    : isOverdue
                    ? C.red + "55"
                    : sc.color + "33"
                }`,
                borderLeft: `4px solid ${showPurchaseInvoiceUpload ? "#14B8A6" : sc.color}`,
              }}
            >
              <WorkflowTimeline status={r.status} steps={GENERAL_STEPS} />

              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</span>
                    {isOverdue && <Badge label="Overdue" color={C.red} />}
                    <Badge label={sc.label} color={sc.color} />
                    <Badge label={pc.label} color={pc.color} />
                    {r.invoices?.length > 0 && (
                      <Badge label={`📎 ${r.invoices.length}`} color={C.muted} />
                    )}
                    {r.purchaseInvoices?.length > 0 && (
                      <Badge label={`🧾 ${r.purchaseInvoices.length}`} color="#14B8A6" />
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: C.muted,
                      marginBottom: 8,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
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
                        <span
                          style={{
                            color: isOverdue ? C.red : C.gold,
                            fontWeight: 600,
                          }}
                        >
                          Requested Payment Date: {fmtDate(displayRequestedDate)}
                        </span>
                      </>
                    )}
                  </div>

                  {r.notes && (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.text + "99",
                        background: C.subtle,
                        padding: "7px 12px",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      📝 {r.notes}
                    </div>
                  )}

                  {r.rejectionReason && (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.red,
                        background: C.red + "11",
                        border: `1px solid ${C.red}33`,
                        padding: "7px 12px",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      ❌ {r.rejectionReason}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                      fontSize: 11,
                      marginTop: 4,
                      marginBottom: 8,
                    }}
                  >
                    {[["Manager", r.managerApproval], ["CEO", r.ceo1Approval]].map(
                      ([l, a]) => (
                        <span key={l} style={{ color: a ? C.green : C.muted }}>
                          {a ? `✓ ${l}: ${a.by} (${fmtDate(a.date)})` : `○ ${l}`}
                        </span>
                      )
                    )}

                    {r.financeApproval && (
                      <span style={{ color: C.green }}>✓ Finance approved</span>
                    )}

                    {r.financeSchedule && (
                      <span style={{ color: C.green }}>
                        ✓ Schedule prepared: {fmtDate(r.financeSchedule.approvedDate)}
                      </span>
                    )}

                    {r.financeSchedule?.reviewedAt && (
                      <span style={{ color: C.green }}>✓ Schedule reviewed</span>
                    )}

                    {r.ceoScheduleApproval && (
                      <span style={{ color: C.green }}>
                        ✓ Final schedule approved
                        {r.ceoScheduleApproval.autoApproved ? " (Auto)" : ""}
                      </span>
                    )}

                    {r.bankRelease && (
                      <span style={{ color: C.green }}>
                        ✓ Released: Ref {r.bankRelease.ref}
                      </span>
                    )}

                    {r.receiptUploaded && (
                      <span style={{ color: C.green }}>✓ Receipt uploaded</span>
                    )}

                    {r.purchaseInvoices?.length > 0 && (
                      <span style={{ color: "#14B8A6" }}>
                        ✓ Purchase invoice uploaded
                      </span>
                    )}
                  </div>

                  {r.financeSchedule && (
                    <div
                      style={{
                        fontSize: 11,
                        background: C.subtle,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginBottom: 8,
                        display: "grid",
                        gap: 4,
                      }}
                    >
                      <div style={{ color: C.purple, fontWeight: 700 }}>
                        Payment Schedule
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

                  {r.receiptUploaded?.files?.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.green,
                        marginBottom: 8,
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span>📎 Payment Receipt:</span>
                      {r.receiptUploaded.files.map((f) => {
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
                              background: C.green + "12",
                              border: `1px solid ${C.green}33`,
                              borderRadius: 5,
                              padding: "2px 8px",
                              color: C.green,
                              textDecoration: "none",
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
                              background: C.green + "12",
                              border: `1px solid ${C.green}33`,
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

                  {r.purchaseInvoices?.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#14B8A6",
                        marginBottom: 8,
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
                          <a
                            key={f.id || f.name}
                            href={fileUrl}
                            download={f.name}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: "#14B8A612",
                              border: `1px solid #14B8A633`,
                              borderRadius: 5,
                              padding: "2px 8px",
                              color: "#14B8A6",
                              textDecoration: "none",
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

                  {isMyReq && inPayment && (
                    <div
                      style={{
                        padding: "8px 12px",
                        background: C.purple + "12",
                        border: `1px solid ${C.purple}33`,
                        borderRadius: 8,
                        fontSize: 11,
                        color: C.purple,
                        marginBottom: 8,
                      }}
                    >
                      ⏳ Payment is being processed through schedule / release workflow
                    </div>
                  )}

                  {showPurchaseInvoiceUpload && (
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "#14B8A612",
                        border: `1px solid #14B8A644`,
                        borderRadius: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#14B8A6",
                          marginBottom: 4,
                        }}
                      >
                        💰 Your payment has been released!
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.muted,
                          marginBottom: 10,
                        }}
                      >
                        Please upload the final purchase invoice to complete this request.
                      </div>
                      <button
                        onClick={() => {
                          setInvoiceModal(r.id);
                          setInvoiceFiles([]);
                        }}
                        style={{
                          background: "#14B8A6",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 20px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ⬆ Upload Purchase Invoice
                      </button>
                    </div>
                  )}

                  {isMyReq && r.status === "pending_invoice" && hasUploadedPurchaseInvoice && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#14B8A612",
                        border: `1px solid #14B8A644`,
                        borderRadius: 8,
                        fontSize: 12,
                        color: "#14B8A6",
                        marginBottom: 8,
                      }}
                    >
                      ✅ Purchase invoice already uploaded
                    </div>
                  )}

                  {r.status === "paid_onetime" && r.paymentInfo && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.green,
                        background: C.green + "12",
                        border: `1px solid ${C.green}33`,
                        borderRadius: 8,
                        padding: "7px 12px",
                        marginBottom: 8,
                      }}
                    >
                      ✅ Paid {fmtDate(r.paymentInfo.date)} · Ref: {r.paymentInfo.ref}
                    </div>
                  )}

                  {expanded && r.history?.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 12px",
                        background: C.subtle,
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.muted,
                          letterSpacing: 1,
                          marginBottom: 8,
                        }}
                      >
                        ACTIVITY HISTORY
                      </div>

                      {[...(r.history || [])].reverse().map((h, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 10,
                            fontSize: 11,
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ color: C.muted, whiteSpace: "nowrap" }}>
                            {fmtDate(h.date)}
                          </span>
                          <span style={{ color: C.accent }}>{h.by}</span>
                          <span style={{ color: C.text }}>{h.note}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      className="tab-btn"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      style={{ fontSize: 11, padding: "5px 12px" }}
                    >
                      {expanded ? "▲ Hide" : "▼ History"}
                    </button>

                    <button
                      onClick={() => setNoteModal({ id: r.id, note: "" })}
                      style={{
                        fontSize: 11,
                        padding: "5px 12px",
                        background: C.subtle,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        color: C.text,
                        cursor: "pointer",
                      }}
                    >
                      📝 Add Note
                    </button>

                    {canEditRequest(r) && (
                      <button
                        onClick={() => openEditModal(r)}
                        style={{
                          fontSize: 11,
                          padding: "5px 12px",
                          background: C.subtle,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          color: C.accent,
                          cursor: "pointer",
                        }}
                      >
                        ✏️ Edit Request
                      </button>
                    )}

                    {(isMyReq || isFinance || isAdmin) &&
                      !["paid_onetime", "rejected"].includes(r.status) && (
                        <button
                          onClick={() =>
                            setReschedModal({
                              id: r.id,
                              date: r.requestedPaymentDate || r.dueDate || "",
                            })
                          }
                          style={{
                            fontSize: 11,
                            padding: "5px 12px",
                            background: C.subtle,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            color: C.gold,
                            cursor: "pointer",
                          }}
                        >
                          📅 Update Requested Date
                        </button>
                      )}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 120 }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: "monospace",
                    }}
                  >
                    {r.currency || "SAR"} {fmtAmt(r.amount)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              New One-Time Request
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Create a one-time request with mandatory note, requested payment date,
              and quotation attachment.
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  TITLE *
                </label>
                <input
                  className="inp"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Laptop for IT team"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    CATEGORY *
                  </label>
                  <select
                    className="inp"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES_ONETIME.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {isITRequester ? (
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      REQUESTED FOR DEPARTMENT *
                    </label>
                    <select
                      className="inp"
                      value={form.department}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                    >
                      {DEPARTMENTS.filter((d) => d !== "All Company").map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      DEPARTMENT
                    </label>
                    <input className="inp" value={creatorDepartment || "-"} readOnly />
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    AMOUNT *
                  </label>
                  <input
                    className="inp"
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    CURRENCY *
                  </label>
                  <select
                    className="inp"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {["SAR", "USD", "EUR", "KWD", "AED"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    PRIORITY *
                  </label>
                  <select
                    className="inp"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  REQUESTED PAYMENT DATE *
                </label>
                <input
                  className="inp"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  JUSTIFICATION NOTE *
                </label>
                <textarea
                  className="inp"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Explain why this purchase/payment is needed..."
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  QUOTATIONS / ATTACHMENTS *
                </label>
                <InvoiceUpload
                  invoices={form.invoices || []}
                  onChange={(invs) => setForm((f) => ({ ...f, invoices: invs }))}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex: 1 }}>
                Submit Request
              </button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="overlay" onClick={() => setEditModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              Edit Request
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Update request details and quotations.
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  TITLE *
                </label>
                <input
                  className="inp"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    CATEGORY *
                  </label>
                  <select
                    className="inp"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  >
                    {CATEGORIES_ONETIME.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                {isITRequester ? (
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      REQUESTED FOR DEPARTMENT *
                    </label>
                    <select
                      className="inp"
                      value={editForm.department}
                      onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                    >
                      {DEPARTMENTS.filter((d) => d !== "All Company").map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      DEPARTMENT
                    </label>
                    <input className="inp" value={creatorDepartment || "-"} readOnly />
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    AMOUNT *
                  </label>
                  <input
                    className="inp"
                    type="number"
                    value={editForm.amount}
                    onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    CURRENCY *
                  </label>
                  <select
                    className="inp"
                    value={editForm.currency}
                    onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  >
                    {["SAR", "USD", "EUR", "KWD", "AED"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    PRIORITY *
                  </label>
                  <select
                    className="inp"
                    value={editForm.priority}
                    onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  REQUESTED PAYMENT DATE *
                </label>
                <input
                  className="inp"
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  JUSTIFICATION NOTE *
                </label>
                <textarea
                  className="inp"
                  rows={3}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  QUOTATIONS / ATTACHMENTS *
                </label>
                <InvoiceUpload
                  invoices={editForm.invoices || []}
                  onChange={(invs) => setEditForm((f) => ({ ...f, invoices: invs }))}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-primary" onClick={saveEditRequest} style={{ flex: 1 }}>
                Save Changes
              </button>
              <button className="btn-ghost" onClick={() => setEditModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
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
              placeholder="Add another note or comment..."
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn-primary" onClick={saveNote} style={{ flex: 1 }}>
                Save
              </button>
              <button className="btn-ghost" onClick={() => setNoteModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {reschedModal && (
        <div className="overlay" onClick={() => setReschedModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
              📅 Update Requested Payment Date
            </div>
            <input
              className="inp"
              type="date"
              value={reschedModal.date}
              onChange={(e) => setReschedModal({ ...reschedModal, date: e.target.value })}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn-primary" onClick={reschedule} style={{ flex: 1 }}>
                Update
              </button>
              <button className="btn-ghost" onClick={() => setReschedModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <div
          className="overlay"
          onClick={() => {
            setInvoiceModal(null);
            setInvoiceFiles([]);
          }}
        >
          <div
            className="modal"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 4,
                color: "#14B8A6",
              }}
            >
              ⬆ Upload Purchase Invoice
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Upload the final purchase invoice. At least one file is required.
            </div>

            <InvoiceUpload invoices={invoiceFiles} onChange={setInvoiceFiles} />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={uploadPurchaseInvoice}
                style={{ flex: 1, opacity: invoiceFiles.length ? 1 : 0.5 }}
              >
                Submit ({invoiceFiles.length} file{invoiceFiles.length !== 1 ? "s" : ""})
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setInvoiceModal(null);
                  setInvoiceFiles([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OnetimeView;