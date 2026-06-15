import { useEffect, useMemo, useState } from "react";
import {
  C,
  DEPARTMENTS,
  CATEGORIES_ONETIME,
  ROLE_CONFIG,
  statusConfig,
  priorityConfig,
  GENERAL_STEPS,
  HR_RELATED_STEPS,
  HR_REQUEST_TYPES,
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
  permissions,
  effectivePermissions,
  authUsers,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showRequestTypeModal, setShowRequestTypeModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [reschedModal, setReschedModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [invoiceFiles, setInvoiceFiles] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [exceptionModal, setExceptionModal] = useState(null);
  const [exceptionReason, setExceptionReason] = useState("");

  const baseRole = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const role = { ...baseRole, ...(effectivePermissions || permissions?.[userRole] || {}) };
  const isFinance = userRole === "finance" || userRole === "admin" || !!role.canApproveFinance || !!role.canPay;
  const isAdmin = userRole === "admin" || userRole === "sub_admin";
  // One-Time Requests page now keeps every pipeline participant able to track the request.
  // Admin/Sub Admin can still see everything.
  const canSeeAll = isAdmin || !!role.canViewAll;
  const authUserList = Object.values(authUsers || {});

  const normalizeText = (value) => String(value || "").trim().toLowerCase();
  const currentUserKeys = [
    currentUser?.uid,
    currentUser?.id,
    currentUser?.email,
    username,
  ].filter(Boolean).map(normalizeText);

  const userMatches = (value) => {
    if (!value) return false;
    if (typeof value === "object") {
      return userMatches(value.userId) || userMatches(value.id) || userMatches(value.uid) ||
        userMatches(value.email) || userMatches(value.userEmail) || userMatches(value.value);
    }
    return currentUserKeys.includes(normalizeText(value));
  };

  const findAuthUser = (key) => {
    const normalized = normalizeText(key);
    if (!normalized) return null;
    return authUserList.find((u) =>
      [u.id, u.uid, u.email, u.userId].filter(Boolean).map(normalizeText).includes(normalized)
    );
  };

  const getApprovalDepartment = (item) => item?.approvalDepartment || item?.department || item?.creatorDepartment || "";
  const getRequestFlowType = (item) => String(
    item?.requestFlowType ||
      item?.approvalFlowType ||
      item?.flowType ||
      item?.requestType ||
      "normal"
  ).toLowerCase();
  const isHrRequest = (item) => getRequestFlowType(item) === "hr" || getRequestFlowType(item) === "hr_related" || getRequestFlowType(item) === "hr-related";

  const submitInvoiceExceptionRequest = () => {
    if (!exceptionModal?.requests?.length) return;

    if (!exceptionReason.trim()) {
      showNotif("Please write the reason for the exception request", "error");
      return;
    }

    const requestIds = exceptionModal.requests.map((r) => r.id);

    setOnetime((p) =>
      p.map((o) =>
        requestIds.includes(o.id)
          ? {
              ...o,
              invoiceException: {
                status: "pending",
                reason: exceptionReason.trim(),
                requestedAt: today(),
                requestedBy: username,
                requestedById: currentUser?.uid || currentUser?.id || "",
                requestedByEmail: currentUser?.email || "",
              },
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `⚠️ Invoice exception requested: ${exceptionReason.trim()}`,
                },
              ],
            }
          : o
      )
    );

    addNotif?.(
      "approval_required",
      "Invoice Exception Requested",
      `${username} requested Finance Manager approval to create a new request before uploading the purchase invoice.`
    );

    setExceptionModal(null);
    setExceptionReason("");
    showNotif("Exception request sent to Finance Manager.");
  };

  const getDepartmentConfig = (itemOrDepartment) => {
    const departmentName = typeof itemOrDepartment === "string" ? itemOrDepartment : getApprovalDepartment(itemOrDepartment);

    return (deptConfig || []).find((d) =>
      normalizeText(d.id) === normalizeText(departmentName) || normalizeText(d.name) === normalizeText(departmentName)
    ) || null;
  };

  const getHRDepartmentConfig = () =>
    (deptConfig || []).find((d) => normalizeText(d.id || d.name) === "hr") || null;

  const normalizeManagerApprovers = (department) => {
    const levels = Array.isArray(department?.managerApprovers) ? department.managerApprovers : [];
    const normalized = levels.map((level, index) => {
      const rawId = typeof level === "string" ? level : level?.userId || level?.id || level?.uid || level?.email || "";
      if (!rawId) return null;
      const user = findAuthUser(rawId);
      return {
        level: index + 1,
        userId: user?.id || user?.uid || rawId,
        userEmail: user?.email || level?.userEmail || level?.email || "",
        userName: user?.name || level?.userName || level?.name || "",
      };
    }).filter(Boolean);

    if (normalized.length) return normalized;
    if (department?.manager) {
      const user = findAuthUser(department.manager);
      return [{
        level: 1,
        userId: user?.id || user?.uid || department.manager,
        userEmail: user?.email || "",
        userName: user?.name || "",
      }];
    }
    return [];
  };

  const getRequesterManagerIndex = (department) => {
    const levels = normalizeManagerApprovers(department);
    return levels.findIndex((level) => userMatches(level.userId) || userMatches(level.userEmail));
  };

  const getHRApprovalLevels = () => normalizeManagerApprovers(getHRDepartmentConfig());
  const isHRDepartmentApprover = (item) => {
    if (!isHrRequest(item)) return false;
    const levels = getHRApprovalLevels();
    return levels.some((level) => userMatches(level.userId) || userMatches(level.userEmail));
  };

  const buildInitialApprovalRouting = (approvalDepartment, requestFlowType = "normal") => {
    const department = getDepartmentConfig(approvalDepartment);
    const levels = normalizeManagerApprovers(department);
    const requesterIndex = getRequesterManagerIndex(department);
    const nextIndex = requesterIndex >= 0 ? requesterIndex + 1 : 0;
    const nextLevel = levels[nextIndex];

    if (nextLevel) {
      return {
        status: "pending_manager",
        currentManagerLevel: nextIndex + 1,
        currentApproverId: nextLevel.userId || "",
        currentApproverEmail: nextLevel.userEmail || "",
        currentApproverName: nextLevel.userName || nextLevel.userEmail || `Manager Level ${nextIndex + 1}`,
        currentApproverRole: `Manager Level ${nextIndex + 1}`,
        initialRouteNote: requesterIndex >= 0
          ? `Requester is Manager Level ${requesterIndex + 1}; routed to Manager Level ${nextIndex + 1}`
          : `Routed to Manager Level ${nextIndex + 1}`,
      };
    }

    if (requestFlowType === "hr") {
      return {
        status: "pending_hr_finance",
        currentManagerLevel: levels.length || 0,
        currentApproverId: "hr_finance",
        currentApproverEmail: "",
        currentApproverName: "HR Finance",
        currentApproverRole: "HR Finance",
        initialRouteNote: requesterIndex >= 0
          ? `Requester is final manager level; HR-related request routed to HR Finance`
          : `No manager approver configured; HR-related request routed to HR Finance`,
      };
    }

    return {
      status: "pending_ceo",
      currentManagerLevel: levels.length || 0,
      currentApproverId: "ceo",
      currentApproverEmail: "",
      currentApproverName: "CEO",
      currentApproverRole: "CEO",
      initialRouteNote: requesterIndex >= 0
        ? `Requester is final manager level; routed directly to CEO`
        : `No manager approver configured; routed directly to CEO`,
    };
  };

  const isRequestInMyTrack = (item) => {
    if (userRole === "hr_finance") return isHrRequest(item);
    if (isHRDepartmentApprover(item)) {
      return [
        "pending_hr_manager_1",
        "pending_hr_manager_2",
        "pending_ceo",
        "pending_finance",
        "pending_schedule_preparation",
        "pending_schedule_verified",
        "pending_release_initiation",
        "pending_release_verify",
        "pending_pay",
        "pending_invoice_upload",
        "pending_invoice_review",
        "closed_paid",
        "rejected",
      ].includes(item.status);
    }

    if (canSeeAll) return true;
    if (userMatches(item.submittedById) || userMatches(item.submittedByEmail) || userMatches(item.submittedBy)) return true;

    const department = getDepartmentConfig(item);
    const managerLevels = normalizeManagerApprovers(department);
    if (managerLevels.some((level) => userMatches(level.userId) || userMatches(level.userEmail))) return true;

    if ((userRole === "ceo" || role.canApproveCEO) && ["pending_ceo", "pending_finance", "pending_schedule_preparation", "pending_schedule_verified", "pending_release_initiation", "pending_release_verify", "pending_pay", "pending_invoice_upload", "pending_invoice_review", "closed_paid", "rejected"].includes(item.status)) return true;

    const financeKeys = Array.isArray(department?.finance) ? department.finance : department?.finance ? [department.finance] : [];
    if ((isFinance || role.canApproveFinance) && (financeKeys.length === 0 || financeKeys.some(userMatches))) {
      if (!isHrRequest(item)) return true;
      return ["pending_finance", "pending_schedule_verified", "pending_release_verify", "pending_invoice_review", "closed_paid", "rejected"].includes(item.status);
    }

    return false;
  };

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
    requestFlowType: "normal",
    hrRequestType: HR_REQUEST_TYPES[0] || "Salary",
    employeeName: "",
    employeeId: "",
    hrPeriod: "",
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
    requestFlowType: "normal",
    hrRequestType: HR_REQUEST_TYPES[0] || "Salary",
    employeeName: "",
    employeeId: "",
    hrPeriod: "",
  });

  const myRequests = (onetime || []).filter(isRequestInMyTrack);

  const statusTabs = [
    ["all", "All"],
    ["pending_manager", "Pending Manager"],
    ["pending_ceo", "CEO Approval"],
    ["pending_finance", "Finance Approval"],
    ["pending_schedule_preparation", "Schedule Preparation"],
    ["pending_schedule_verified", "Schedule Verified"],
    ["pending_release_initiation", "Release Initiation"],
    ["pending_release_verify", "Release Verification"],
    ["pending_pay", "Pending Pay"],
    ["pending_invoice_upload", "Invoice Upload"],
    ["pending_invoice_review", "Invoice Review"],
    ["closed_paid", "Closed"],
    ["rejected", "Rejected"],
  ];

  const filtered =
    filterStatus === "all"
      ? myRequests
      : myRequests.filter((o) => o.status === filterStatus);

  const isMySubmittedRequest = (r) =>
    r?.submittedBy === username ||
    r?.submittedById === currentUser?.uid ||
    r?.submittedById === currentUser?.id ||
    r?.submittedByEmail === currentUser?.email;

const isInvoiceExceptionApproved = (r) =>
  String(r?.invoiceException?.status || "").toLowerCase() === "approved";

const isMissingRequiredPurchaseInvoice = (r) => {
  const isRequesterRequest = isMySubmittedRequest(r);

  const isWaitingForInvoice =
    String(r?.status || "").toLowerCase() === "pending_invoice_upload";

  const hasNoPurchaseInvoice =
    !Array.isArray(r?.purchaseInvoices) || r.purchaseInvoices.length === 0;

  return (
    isRequesterRequest &&
    isWaitingForInvoice &&
    hasNoPurchaseInvoice &&
    !isInvoiceExceptionApproved(r)
  );
};

  const invoiceBlockedRequests = (onetime || []).filter(isMissingRequiredPurchaseInvoice);
  const hasInvoiceBlock = invoiceBlockedRequests.length > 0;

  const openNewRequest = () => {
    if (hasInvoiceBlock) {
      setExceptionModal({ requests: invoiceBlockedRequests });
      setExceptionReason("");
      return;
    }

    setShowRequestTypeModal(true);
  };

  const startNewRequest = (requestFlowType) => {
    setForm({
      ...buildInitialForm(),
      requestFlowType,
      category: requestFlowType === "hr" ? "Other" : "Equipment",
    });
    setShowRequestTypeModal(false);
    setShowAdd(true);
  };

  const escapeHtml = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const downloadRequestCyclePDF = (r) => {
    const rows = (r.history || [])
      .map((h, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(fmtDate(h.date))}</td>
          <td>${escapeHtml(h.by || "-")}</td>
          <td>${escapeHtml(statusConfig[h.status]?.label || h.status || "-")}</td>
          <td>${escapeHtml(h.note || "-")}</td>
        </tr>
      `)
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Request Cycle - ${escapeHtml(r.title)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
            h1 { margin: 0 0 6px; font-size: 22px; }
            .muted { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
            .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 18px; }
            .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; }
            .label { color: #6b7280; font-size: 11px; text-transform: uppercase; margin-bottom: 4px; }
            .value { font-size: 13px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 11px; text-align: left; vertical-align: top; }
            th { background: #f3f4f6; font-size: 10px; text-transform: uppercase; color: #374151; }
            @media print { button { display: none; } body { padding: 12px; } }
          </style>
        </head>
        <body>
          <h1>Lazem Finance Request Cycle</h1>
          <div class="muted">Generated on ${escapeHtml(fmtDate(today()))}</div>
          <div class="grid">
            <div class="box"><div class="label">Request</div><div class="value">${escapeHtml(r.title)}</div></div>
            <div class="box"><div class="label">Status</div><div class="value">${escapeHtml(statusConfig[r.status]?.label || r.status)}</div></div>
            <div class="box"><div class="label">Amount</div><div class="value">${escapeHtml(r.currency || "SAR")} ${escapeHtml(fmtAmt(r.amount))}</div></div>
            <div class="box"><div class="label">Submitted By</div><div class="value">${escapeHtml(r.submittedBy || "-")}</div></div>
            <div class="box"><div class="label">Requested For</div><div class="value">${escapeHtml(r.department || "-")}</div></div>
            <div class="box"><div class="label">Approval Flow</div><div class="value">${escapeHtml(r.approvalFlowLabel || (isHrRequest(r) ? "HR-Related" : r.approvalDepartment || "-"))}</div></div>
          </div>
          ${r.rejectionReason ? `<div class="box" style="border-color:#fecaca;background:#fef2f2;margin-bottom:16px"><div class="label">Rejected Comment</div><div class="value">${escapeHtml(r.rejectionReason)}</div></div>` : ""}
          <h2 style="font-size:16px;margin-top:18px">Cycle History</h2>
          <table>
            <thead><tr><th>#</th><th>Date</th><th>By</th><th>Status</th><th>Note / Comment</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="5">No history recorded.</td></tr>`}</tbody>
          </table>
          <script>window.onload = () => { window.print(); };</script>
        </body>
      </html>
    `;

    const win = window.open("", "_blank");
    if (!win) {
      showNotif("Please allow popups to download/print the request cycle", "error");
      return;
    }
    win.document.write(html);
    win.document.close();
  };

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

    if (data.requestFlowType === "hr" && !data.employeeName?.trim()) {
      showNotif("Employee name is required for HR-related requests", "error");
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

    const requestFlowType = form.requestFlowType === "hr" ? "hr" : "normal";

    // Important: the popup selection decides the workflow.
    // The requested-for department can still be IT/Operations/etc. for the direct-manager step.
    const approvalDepartment = isITRequester
      ? "IT"
      : creatorDepartment || form.department || "";

    const routing = buildInitialApprovalRouting(approvalDepartment, requestFlowType);

    const newItem = {
      ...form,
      requestFlowType,
      approvalFlowType: requestFlowType,
      flowType: requestFlowType,
      requestType: requestFlowType === "hr" ? "hr" : "normal",
      approvalFlowLabel: requestFlowType === "hr" ? "HR-Related" : approvalDepartment,
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
      status: routing.status,
      currentManagerLevel: routing.currentManagerLevel,
      currentApproverId: routing.currentApproverId,
      currentApproverEmail: routing.currentApproverEmail,
      currentApproverName: routing.currentApproverName,
      currentApproverRole: routing.currentApproverRole,
      history: [
        {
          status: routing.status,
          by: username,
          date: today(),
          note: `Request submitted with quotations · ${requestFlowType === "hr" ? "HR-related request" : "Normal request"} · Requested for ${targetDepartment} · Approval flow ${requestFlowType === "hr" ? "HR-Related" : approvalDepartment} · ${routing.initialRouteNote}`,
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
    setShowRequestTypeModal(false);
    resetForm();

    if (logAction) {
      logAction(
        "create",
        "one-time",
        newItem.id,
        newItem.title,
        `${newItem.category} · Requested For ${newItem.department} · Approval Flow ${newItem.approvalFlowLabel || newItem.approvalDepartment}`,
        +newItem.amount
      );
    }

    if (addNotif) {
      addNotif(
        "new_submission",
        `New Request: ${newItem.title}`,
        `Submitted by ${username} — ${routing.currentApproverRole} action required`
      );
    }

    showNotif(`Request submitted → ${routing.currentApproverRole}!`);
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
      ["pending_manager", "pending_ceo", "pending_finance"].includes(r.status)
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
      requestFlowType: r.requestFlowType || "normal",
      hrRequestType: r.hrRequestType || HR_REQUEST_TYPES[0] || "Salary",
      employeeName: r.employeeName || "",
      employeeId: r.employeeId || "",
      hrPeriod: r.hrPeriod || "",
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
              requestFlowType: editForm.requestFlowType || "normal",
              hrRequestType: editForm.hrRequestType || "",
              employeeName: editForm.employeeName || "",
              employeeId: editForm.employeeId || "",
              hrPeriod: editForm.hrPeriod || "",
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `Request updated by requester/admin · Requested for ${targetDepartment} · Approval flow ${editForm.requestFlowType === "hr" ? "HR-Related" : approvalDepartment}`,
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
        `Request details updated · Requested For ${targetDepartment} · Approval Flow ${editForm.requestFlowType === "hr" ? "HR-Related" : approvalDepartment}`
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
              status: "pending_invoice_review",
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
                  status: "pending_invoice_review",
                  by: username,
                  date: today(),
                  note: `Purchase invoice uploaded (${invoiceFiles.length} file${
                    invoiceFiles.length !== 1 ? "s" : ""
                  }) — Finance will review and close`,
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
          <button className="btn-primary" onClick={openNewRequest}>
            + New Request
          </button>
        )}
      </div>

      {hasInvoiceBlock && (
        <div
          style={{
            background: C.red + "10",
            border: `1px solid ${C.red}33`,
            borderRadius: 12,
            padding: "12px 14px",
            marginBottom: 14,
            color: C.red,
            fontSize: 12,
          }}
        >
          🔒 New requests are locked until you upload the purchase invoice for
          {" "}{invoiceBlockedRequests.length} paid request
          {invoiceBlockedRequests.length !== 1 ? "s" : ""}. You can upload the invoice or request a Finance Manager exception.
        </div>
      )}

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
            !["closed_paid", "rejected"].includes(r.status);

          const expanded = expandedId === r.id;
          const isMyReq =
            r.submittedBy === username ||
            r.submittedById === currentUser?.uid ||
            r.submittedById === currentUser?.id;

          const inPayment = [
            "pending_schedule_preparation",
            "pending_schedule_verified",
            "pending_release_initiation",
            "pending_release_verify",
            "pending_pay",
          ].includes(r.status);

          const hasUploadedPurchaseInvoice =
            Array.isArray(r.purchaseInvoices) && r.purchaseInvoices.length > 0;

          const showPurchaseInvoiceUpload =
            isMyReq &&
            r.status === "pending_invoice_upload" &&
            !hasUploadedPurchaseInvoice;

          const requestedFor = r.department || "-";
          const approvalFlow = r.approvalFlowLabel || (isHrRequest(r) ? "HR-Related" : r.approvalDepartment || r.department || "-");

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
              <WorkflowTimeline status={r.status} steps={isHrRequest(r) ? HR_RELATED_STEPS : GENERAL_STEPS} />

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

                    {r.financeSchedule?.verifiedAt && (
                      <span style={{ color: C.green }}>✓ Schedule verified</span>
                    )}

                    {r.releaseInitiation && (
                      <span style={{ color: C.green }}>✓ Release initiated</span>
                    )}

                    {r.releaseVerification && (
                      <span style={{ color: C.green }}>✓ Release verified</span>
                    )}

                    {r.bankRelease && (
                      <span style={{ color: C.green }}>
                        ✓ Paid + receipt uploaded
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

                  {r.invoices?.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.accent,
                        marginBottom: 8,
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
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              background: C.accent + "12",
                              border: `1px solid ${C.accent}33`,
                              borderRadius: 5,
                              padding: "2px 8px",
                              color: C.accent,
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
                              background: C.accent + "12",
                              border: `1px solid ${C.accent}33`,
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

                  {isMyReq && r.status === "pending_invoice_review" && hasUploadedPurchaseInvoice && (
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

                  {r.status === "closed_paid" && r.paymentInfo && (
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
                      ✅ Closed/Paid {fmtDate(r.paymentInfo.date)}
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
                          <span style={{ color: C.text }}>
  {h.note || h.comment || h.reason || h.rejectionReason || "-"}
</span>
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

                    {(isFinance || isAdmin) && (
                      <button
                        onClick={() => downloadRequestCyclePDF(r)}
                        style={{
                          fontSize: 11,
                          padding: "5px 12px",
                          background: C.subtle,
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          color: C.green,
                          cursor: "pointer",
                        }}
                      >
                        ⬇ Download Cycle PDF
                      </button>
                    )}

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
                      !["closed_paid", "rejected"].includes(r.status) && (
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

      {exceptionModal && (
        <div className="overlay" onClick={() => setExceptionModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: C.red }}>
              🔒 Invoice Required Before New Request
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
              You have paid request(s) waiting for the final purchase invoice. Upload the invoice first, or request an exception from Finance Manager.
            </div>

            <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              {(exceptionModal.requests || []).map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: `1px solid ${C.border}`,
                    background: C.subtle,
                    borderRadius: 10,
                    padding: "9px 11px",
                    fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, color: C.text }}>{r.title}</div>
                  <div style={{ color: C.muted }}>
                    {r.currency || "SAR"} {fmtAmt(r.amount)} · Status: {statusConfig[r.status]?.label || r.status}
                  </div>
                  {r.invoiceException?.status === "pending" && (
                    <div style={{ color: C.gold, marginTop: 4 }}>
                      Existing exception request is pending Finance Manager review.
                    </div>
                  )}
                  <button
                    className="btn-green"
                    onClick={() => {
                      setInvoiceModal(r.id);
                      setInvoiceFiles([]);
                      setExceptionModal(null);
                    }}
                    style={{ fontSize: 12, padding: "7px 12px", marginTop: 8 }}
                  >
                    ⬆ Upload Invoice Now
                  </button>
                </div>
              ))}
            </div>

            <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
              EXCEPTION REASON *
            </label>
            <textarea
              className="inp"
              rows={4}
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              placeholder="Explain why you cannot upload the purchase invoice now..."
            />

            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn-primary" onClick={submitInvoiceExceptionRequest} style={{ flex: 1 }}>
                Send Exception Request
              </button>
              <button className="btn-ghost" onClick={() => setExceptionModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRequestTypeModal && (
        <div className="overlay" onClick={() => setShowRequestTypeModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>
              Select Request Type
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
              Choose the correct workflow before creating the request.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={() => startNewRequest("normal")}
                style={{ padding: 16, textAlign: "left", minHeight: 110 }}
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>Normal Request</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                  Supplier, purchase, project, operations, and general finance requests.
                </div>
              </button>
              <button
                className="btn-green"
                onClick={() => startNewRequest("hr")}
                style={{ padding: 16, textAlign: "left", minHeight: 110 }}
              >
                <div style={{ fontSize: 16, fontWeight: 800 }}>HR-Related Request</div>
                <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>
                  Salary, allowance, employee reimbursement, GOSI, recruitment, and HR payments.
                </div>
              </button>
            </div>
            <button className="btn-ghost" onClick={() => setShowRequestTypeModal(false)} style={{ marginTop: 14, width: "100%" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              {form.requestFlowType === "hr" ? "New HR-Related Request" : "New One-Time Request"}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              {form.requestFlowType === "hr"
                ? "This request will follow: Staff → Manager → HR Finance → HR Department Level 1 → HR Department Level 2 → CEO → Finance Manager → Finance cycle."
                : "Create a one-time request with mandatory note, requested payment date, and quotation attachment."}
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
                  lang="en-GB"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>

              {form.requestFlowType === "hr" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      HR REQUEST TYPE *
                    </label>
                    <select
                      className="inp"
                      value={form.hrRequestType}
                      onChange={(e) => setForm({ ...form, hrRequestType: e.target.value })}
                    >
                      {HR_REQUEST_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      EMPLOYEE NAME *
                    </label>
                    <input
                      className="inp"
                      value={form.employeeName}
                      onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                      placeholder="Employee name"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      EMPLOYEE ID
                    </label>
                    <input
                      className="inp"
                      value={form.employeeId}
                      onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      PERIOD / MONTH
                    </label>
                    <input
                      className="inp"
                      value={form.hrPeriod}
                      onChange={(e) => setForm({ ...form, hrPeriod: e.target.value })}
                      placeholder="e.g. June 2026"
                    />
                  </div>
                </div>
              )}

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
                  lang="en-GB"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                />
              </div>

              {editForm.requestFlowType === "hr" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      HR REQUEST TYPE *
                    </label>
                    <select
                      className="inp"
                      value={editForm.hrRequestType}
                      onChange={(e) => setEditForm({ ...editForm, hrRequestType: e.target.value })}
                    >
                      {HR_REQUEST_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      EMPLOYEE NAME *
                    </label>
                    <input
                      className="inp"
                      value={editForm.employeeName}
                      onChange={(e) => setEditForm({ ...editForm, employeeName: e.target.value })}
                      placeholder="Employee name"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      EMPLOYEE ID
                    </label>
                    <input
                      className="inp"
                      value={editForm.employeeId}
                      onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                      PERIOD / MONTH
                    </label>
                    <input
                      className="inp"
                      value={editForm.hrPeriod}
                      onChange={(e) => setEditForm({ ...editForm, hrPeriod: e.target.value })}
                      placeholder="e.g. June 2026"
                    />
                  </div>
                </div>
              )}

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
              lang="en-GB"
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
