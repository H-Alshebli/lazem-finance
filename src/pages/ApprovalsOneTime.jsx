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
  permissions,
  effectivePermissions,
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
    date: today(),
    note: "",
  });

  const [receiptFiles, setReceiptFiles] = useState([]);

  const baseRole = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const role = { ...baseRole, ...(effectivePermissions || permissions?.[userRole] || {}) };
  const isAdmin = userRole === "admin" || userRole === "sub_admin";
  // Approval page shows only requests that need action from this user. Admin remains full view.
  const canSeeAll = isAdmin;
  const canManager = !!role.canApproveL1 || userRole === "manager" || isAdmin;
  const canCEO = !!role.canApproveCEO || userRole === "ceo" || isAdmin;
  const canFinance = !!role.canApproveFinance || userRole === "finance" || isAdmin;
  const canHRFinance = userRole === "hr_finance" || isAdmin;
  // HR Level 1 / Level 2 are NOT fixed roles.
  // They are selected in Departments → HR → Manager Approval Levels.
  const getRequestFlowType = (item) => String(
    item?.requestFlowType ||
      item?.approvalFlowType ||
      item?.flowType ||
      item?.requestType ||
      "normal"
  ).toLowerCase();
  const isHrRequest = (item) => getRequestFlowType(item) === "hr" || getRequestFlowType(item) === "hr_related" || getRequestFlowType(item) === "hr-related";
  const isNormalRequest = (item) => !isHrRequest(item);

  const getApprovalDepartment = (item) =>
    item.approvalDepartment || item.department || "";

  const getDepartmentConfig = (item) =>
    (deptConfig || []).find(
      (d) => d.id === getApprovalDepartment(item) || d.name === getApprovalDepartment(item)
    ) || null;

  const getHRDepartmentConfig = () =>
    (deptConfig || []).find((d) => String(d.id || d.name || "").toLowerCase() === "hr") || null;

  const normalizeFinanceApprovers = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value) return [value];
    return [];
  };

  const normalizeManagerApprovers = (department) => {
    const levels = Array.isArray(department?.managerApprovers)
      ? department.managerApprovers
      : [];

    const normalizedLevels = levels
      .map((level, index) => {
        const userId = typeof level === "string" ? level : level?.userId || level?.id || "";
        if (!userId) return null;
        return {
          level: index + 1,
          userId,
          userName: level?.userName || "",
          userEmail: level?.userEmail || "",
        };
      })
      .filter(Boolean);

    if (normalizedLevels.length > 0) return normalizedLevels;

    if (department?.manager) {
      return [{ level: 1, userId: department.manager, userName: "", userEmail: "" }];
    }

    return [];
  };

  const userMatches = (value) =>
    value === currentUser?.id || value === currentUser?.email || value === currentUser?.uid;

  const getCurrentManagerIndex = (item) => Math.max(Number(item?.currentManagerLevel || 1) - 1, 0);

  const getCurrentManagerLevel = (item) => {
    const levels = normalizeManagerApprovers(getDepartmentConfig(item));
    return levels[getCurrentManagerIndex(item)] || levels[0] || null;
  };

  const getHRApprovalLevels = () => normalizeManagerApprovers(getHRDepartmentConfig());
  const getHRApprovalLevel = (index) => getHRApprovalLevels()[index] || null;
  const userIsCurrentApprover = (item) =>
    isAdmin ||
    userMatches(item?.currentApproverId) ||
    userMatches(item?.currentApproverEmail);

  const canHRLevelApprove = (item, levelIndex) => {
    if (isAdmin) return true;
    const level = getHRApprovalLevel(levelIndex);
    return (
      isHrRequest(item) &&
      item?.status === (levelIndex === 0 ? "pending_hr_manager_1" : "pending_hr_manager_2") &&
      (userIsCurrentApprover(item) || !!level && userMatches(level.userId))
    );
  };

  const canCurrentManagerApprove = (item) => {
    if (isAdmin) return true;
    const level = getCurrentManagerLevel(item);
    return !!level && userMatches(level.userId);
  };

  const getPendingWithLabel = (item) => {
    if (item.status === "pending_manager") {
      const level = getCurrentManagerLevel(item);
      const levelNumber = getCurrentManagerIndex(item) + 1;
      const name = level?.userName || level?.userEmail || level?.userId || "Manager";
      return `Pending Manager Level ${levelNumber} Approval - ${name}`;
    }
    if (item.status === "pending_hr_finance") return "Pending HR Finance Review";
    if (item.status === "pending_hr_manager_1") {
      const level = getHRApprovalLevel(0);
      const name = item.currentApproverName || level?.userName || level?.userEmail || "HR Level 1";
      return `Pending HR Level 1 Approval - ${name}`;
    }
    if (item.status === "pending_hr_manager_2") {
      const level = getHRApprovalLevel(1);
      const name = item.currentApproverName || level?.userName || level?.userEmail || "HR Level 2";
      return `Pending HR Level 2 Approval - ${name}`;
    }
    if (item.status === "pending_ceo") return "Pending CEO Approval";
    if (item.status === "pending_finance") return "Pending Finance Manager Approval";
    return null;
  };

  const myFinanceDepts = (deptConfig || [])
    .filter((d) => normalizeFinanceApprovers(d.finance).some(userMatches))
    .map((d) => d.id);

  const managerDeptFilter = (item) => isAdmin || canCurrentManagerApprove(item);
  const financeDeptFilter = (item) => isAdmin || myFinanceDepts.includes(getApprovalDepartment(item));
  const filterMgr = (items) => (canManager ? items.filter(managerDeptFilter) : []);
  const filterFinance = (items) => (canFinance ? items.filter(financeDeptFilter) : []);
  const filterHRFinance = (items) => (canHRFinance ? items.filter(isHrRequest) : []);
  const filterHRLevel1 = (items) => items.filter((item) => canHRLevelApprove(item, 0));
  const filterHRLevel2 = (items) => items.filter((item) => canHRLevelApprove(item, 1));
  const filterFinanceOrHRExecution = (items, hrHandled = false) => {
    const normalItems = filterFinance(items.filter(isNormalRequest));
    const hrItems = hrHandled ? filterHRFinance(items.filter(isHrRequest)) : filterFinance(items.filter(isHrRequest));
    return [...normalItems, ...hrItems];
  };

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
    pending_hr_finance: filterHRFinance(
      (onetime || []).filter((o) => o.status === "pending_hr_finance")
    ),
    pending_hr_manager_1: filterHRLevel1(
      (onetime || []).filter((o) => o.status === "pending_hr_manager_1")
    ),
    pending_hr_manager_2: filterHRLevel2(
      (onetime || []).filter((o) => o.status === "pending_hr_manager_2")
    ),
    pending_ceo: canCEO
      ? (onetime || []).filter((o) => o.status === "pending_ceo")
      : [],
    pending_finance: filterFinance(
      (onetime || []).filter((o) => o.status === "pending_finance")
    ),
    pending_schedule_preparation: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_schedule_preparation"),
      true
    ),
    pending_schedule_verified: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_schedule_verified"),
      false
    ),
    pending_release_initiation: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_release_initiation"),
      true
    ),
    pending_release_verify: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_release_verify"),
      false
    ),
    pending_pay: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_pay"),
      true
    ),
    pending_invoice_upload: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_invoice_upload"),
      true
    ),
    pending_invoice_review: filterFinanceOrHRExecution(
      (onetime || []).filter((o) => o.status === "pending_invoice_review"),
      false
    ),
  };

  const approveManager = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    if (!item) return;

    const managerLevels = normalizeManagerApprovers(getDepartmentConfig(item));
    const currentIndex = getCurrentManagerIndex(item);
    const currentLevelNumber = currentIndex + 1;
    const nextLevel = managerLevels[currentIndex + 1];
    const nextStatus = nextLevel ? "pending_manager" : isHrRequest(item) ? "pending_hr_finance" : "pending_ceo";
    const nextNote = nextLevel
      ? `Manager Level ${currentLevelNumber} approved → Manager Level ${currentLevelNumber + 1}`
      : isHrRequest(item)
      ? `Manager Level ${currentLevelNumber} approved → HR Finance`
      : `Manager Level ${currentLevelNumber} approved → CEO`;

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                currentManagerLevel: nextLevel ? currentLevelNumber + 1 : currentLevelNumber,
                currentApproverId: nextLevel ? nextLevel.userId : isHrRequest(o) ? "hr_finance" : "ceo",
                currentApproverName: nextLevel ? nextLevel.userName || nextLevel.userEmail || "" : isHrRequest(o) ? "HR Finance" : "CEO",
                currentApproverRole: nextLevel ? `Manager Level ${currentLevelNumber + 1}` : isHrRequest(o) ? "HR Finance" : "CEO",
                managerApprovals: [
                  ...(o.managerApprovals || []),
                  {
                    level: currentLevelNumber,
                    by: currentUser?.name,
                    byId: currentUser?.id || currentUser?.uid,
                    date: today(),
                  },
                ],
                managerApproval: { by: currentUser?.name, date: today(), level: currentLevelNumber },
              },
              nextStatus,
              nextNote
            )
          : o
      )
    );

    logAction?.("approve", "one-time", id, item?.title, nextNote);

    if (nextLevel) {
      addNotif?.(
        "approval_required",
        `Manager Level ${currentLevelNumber + 1} Approval Needed`,
        `"${item?.title}" needs approval from ${nextLevel.userName || nextLevel.userEmail || "next manager"}`
      );
      showNotif(`Approved → Manager Level ${currentLevelNumber + 1}!`);
    } else if (isHrRequest(item)) {
      addNotif?.(
        "approval_required",
        "HR Finance Review Needed",
        `"${item?.title}" needs HR Finance review`
      );
      showNotif("Approved → HR Finance!");
    } else {
      addNotif?.(
        "approval_required",
        "CEO Approval Needed",
        `"${item?.title}" needs CEO approval`
      );
      showNotif("Approved → CEO!");
    }
  };

  const approveHRFinance = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    const level1 = getHRApprovalLevel(0);

    const nextStatus = level1 ? "pending_hr_manager_1" : "pending_ceo";
    const nextName = level1?.userName || level1?.userEmail || "CEO";

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                hrFinanceApproval: { by: currentUser?.name, date: today() },
                currentApproverId: level1?.userId || "ceo",
                currentApproverEmail: level1?.userEmail || "",
                currentApproverName: nextName,
                currentApproverRole: level1 ? "HR Level 1" : "CEO",
              },
              nextStatus,
              level1 ? "HR Finance reviewed → HR Level 1 approval" : "HR Finance reviewed → CEO approval"
            )
          : o
      )
    );
    addNotif?.("approval_required", level1 ? "HR Level 1 Approval Needed" : "CEO Approval Needed", `"${item?.title}" needs approval from ${nextName}`);
    showNotif(level1 ? "HR Finance approved → HR Level 1!" : "HR Finance approved → CEO!");
  };

  const approveHRManager1 = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    const level2 = getHRApprovalLevel(1);

    const nextStatus = level2 ? "pending_hr_manager_2" : "pending_ceo";
    const nextName = level2?.userName || level2?.userEmail || "CEO";

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                hrManager1Approval: { by: currentUser?.name, byId: currentUser?.id || currentUser?.uid, date: today() },
                currentApproverId: level2?.userId || "ceo",
                currentApproverEmail: level2?.userEmail || "",
                currentApproverName: nextName,
                currentApproverRole: level2 ? "HR Level 2" : "CEO",
              },
              nextStatus,
              level2 ? "HR Level 1 approved → HR Level 2 approval" : "HR Level 1 approved → CEO approval"
            )
          : o
      )
    );
    addNotif?.("approval_required", level2 ? "HR Level 2 Approval Needed" : "CEO Approval Needed", `"${item?.title}" needs approval from ${nextName}`);
    showNotif(level2 ? "HR Level 1 approved → HR Level 2!" : "HR Level 1 approved → CEO!");
  };

  const approveHRManager2 = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                hrManager2Approval: { by: currentUser?.name, byId: currentUser?.id || currentUser?.uid, date: today() },
                currentApproverId: "ceo",
                currentApproverEmail: "",
                currentApproverName: "CEO",
                currentApproverRole: "CEO",
              },
              "pending_ceo",
              "HR Level 2 approved → CEO approval"
            )
          : o
      )
    );
    addNotif?.("approval_required", "CEO Approval Needed", `"${item?.title}" needs CEO approval`);
    showNotif("HR Level 2 approved → CEO!");
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
              "pending_schedule_preparation",
              isHrRequest(o) ? "Finance Manager approved → HR Finance schedule preparation" : "Finance approved → Schedule preparation"
            )
          : o
      )
    );

    addNotif?.(
      "payment_due",
      "Schedule Preparation Required",
      `"${item?.title}" approved by Finance — prepare the payment schedule`
    );
    showNotif("Finance approved → Schedule preparation!");
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

  const openScheduleModal = (r) => {
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

  const saveSchedulePreparation = (id) => {
    if (!validateScheduleForm()) return;

    const item = (onetime || []).find((o) => o.id === id);
    const oldDate = item?.financeSchedule?.approvedDate || item?.requestedPaymentDate || item?.dueDate || "";
    const isFirstPreparation = item?.status === "pending_schedule_preparation";
    const nextStatus = isFirstPreparation ? "pending_schedule_verified" : item?.status;

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                requestedPaymentDate: scheduleForm.approvedDate,
                dueDate: scheduleForm.approvedDate,
                financeSchedule: {
                  ...(o.financeSchedule || {}),
                  approvedDate: scheduleForm.approvedDate,
                  method: scheduleForm.method,
                  companyName: scheduleForm.companyName,
                  bankName:
                    scheduleForm.method === "Bank Transfer"
                      ? scheduleForm.bankName
                      : "",
                  note: scheduleForm.note || "",
                  scheduledAt: o.financeSchedule?.scheduledAt || today(),
                  scheduledBy: o.financeSchedule?.scheduledBy || currentUser?.name || "Finance",
                  lastUpdatedAt: today(),
                  lastUpdatedBy: currentUser?.name || "Finance",
                  requestedDate: o.requestedPaymentDate || o.dueDate || "",
                },
                rescheduleHistory: !isFirstPreparation
                  ? [
                      ...(o.rescheduleHistory || []),
                      {
                        fromDate: oldDate,
                        toDate: scheduleForm.approvedDate,
                        reason: scheduleForm.note || "Schedule updated",
                        by: currentUser?.name || "Finance",
                        byRole: userRole,
                        at: today(),
                        stage: o.status,
                      },
                    ]
                  : o.rescheduleHistory || [],
              },
              nextStatus,
              isFirstPreparation
                ? `Schedule prepared for ${scheduleForm.approvedDate} via ${scheduleForm.method} → Schedule verification`
                : `Rescheduled from ${oldDate || "-"} to ${scheduleForm.approvedDate}${
                    scheduleForm.note ? ` · Note: ${scheduleForm.note}` : ""
                  }`
            )
          : o
      )
    );

    if (isFirstPreparation) {
      addNotif?.(
        "approval_required",
        "Schedule Verification Required",
        `"${item?.title}" is ready for schedule verification`
      );
    }

    setScheduleModal(null);
    setScheduleForm({
      approvedDate: "",
      method: "Bank Transfer",
      companyName: COMPANY_OPTIONS[0] || "",
      bankName: BANK_OPTIONS[0] || "",
      note: "",
    });

    showNotif(isFirstPreparation ? "Schedule prepared → Verification stage!" : "Schedule date updated!");
  };

  const verifySchedule = (id) => {
    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                financeSchedule: {
                  ...(o.financeSchedule || {}),
                  verifiedAt: today(),
                  verifiedBy: currentUser?.name || "Finance",
                },
              },
              "pending_release_initiation",
              "Schedule verified by Finance → Pending release initiation"
            )
          : o
      )
    );

    addNotif?.(
      "payment_due",
      "Release Initiation Required",
      `"${item?.title}" schedule is verified and ready for release initiation`
    );

    showNotif("Schedule verified → Release initiation!");
  };

  const initiateRelease = (id) => {
    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                releaseInitiation: {
                  initiatedAt: today(),
                  initiatedBy: currentUser?.name || "Finance",
                },
              },
              "pending_release_verify",
              "Release initiated → Pending release verification"
            )
          : o
      )
    );

    addNotif?.(
      "approval_required",
      "Release Verification Required",
      `"${item?.title}" release was initiated and needs verification`
    );

    showNotif("Release initiated → Verification!");
  };

  const verifyRelease = (id) => {
    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                releaseVerification: {
                  verifiedAt: today(),
                  verifiedBy: currentUser?.name || "Finance",
                },
              },
              "pending_pay",
              "Release verified → Pending pay and receipt upload"
            )
          : o
      )
    );

    addNotif?.(
      "payment_due",
      "Payment Required",
      `"${item?.title}" release is verified and ready to pay`
    );

    showNotif("Release verified → Pending pay!");
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
  const modalReason = rejectModal?.reason;
  const domReason = typeof document !== "undefined" ? document.getElementById("rejectReasonText")?.value : "";
  const reason = String(rejectReason || modalReason || domReason || "").trim();

  if (!reason) {
    showNotif("Please write the rejection reason before rejecting.", "error");
    return;
  }

  const rejectedBy = currentUser?.name || currentUser?.email || "Approver";

  setOnetime((p) =>
    p.map((o) =>
      o.id === id
        ? addHistory(
            {
              ...o,
              rejectionReason: reason,
              rejectedReason: reason,
              rejectedComment: reason,
              rejectedBy,
              rejectedByEmail: currentUser?.email || "",
              rejectedAt: today(),
            },
            "rejected",
            `❌ Rejected by ${rejectedBy}: ${reason}`
          )
        : o
    )
  );

  setRejectModal(null);
  setRejectReason("");

  logAction?.("reject", "one-time", id, item?.title, `Reason: ${reason}`);
  addNotif?.("rejected", "Request Rejected", `"${item?.title}" was rejected: ${reason}`);
  showNotif("Rejected.");
};

  const openPayModal = (id) => {
    setBankModal({ id });
    setBankForm({ date: today(), note: "" });
    setReceiptFiles([]);
  };

  const payAndUploadReceipt = () => {
    if (!bankModal?.id) return;


    if (!receiptFiles.length) {
      showNotif("Please upload receipt file", "error");
      return;
    }

    const requestId = bankModal.id;
    const item = (onetime || []).find((o) => o.id === requestId);

    setOnetime((p) =>
      p.map((o) =>
        o.id === requestId
          ? addHistory(
              {
                ...o,
                bankRelease: {
                  ...bankForm,
                  paidBy: currentUser?.name || "Finance",
                  paidByRole: userRole,
                },
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
                  by: currentUser?.name || "Finance",
                },
              },
              "pending_invoice_upload",
              "Payment completed and receipt uploaded → Awaiting invoice upload"
            )
          : o
      )
    );

    setBankModal(null);
    setBankForm({ date: today(), note: "" });
    setReceiptFiles([]);

    addNotif?.(
      "approval_required",
      "Upload Your Invoice",
      `Payment for "${item?.title}" has been completed — please upload your purchase invoice`
    );

    showNotif("Paid and receipt uploaded → Awaiting invoice upload!");
  };

  const missingPurchaseInvoice = (r) =>
    !Array.isArray(r?.purchaseInvoices) || r.purchaseInvoices.length === 0;

  const sendInvoiceReminder = (id) => {
    const item = (onetime || []).find((o) => o.id === id);
    if (!item) return;

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? {
              ...o,
              invoiceReminder: {
                lastSentAt: today(),
                sentBy: currentUser?.name || "Finance",
                count: Number(o.invoiceReminder?.count || 0) + 1,
              },
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: currentUser?.name || "Finance",
                  date: today(),
                  note: "🔔 Finance reminder sent: please upload the final purchase invoice.",
                },
              ],
            }
          : o
      )
    );

    addNotif?.(
      "approval_required",
      "Invoice Upload Reminder",
      `Finance sent a reminder to upload the purchase invoice for "${item.title}".`
    );
    showNotif("Invoice reminder sent to requester.");
  };

  const reviewInvoiceException = (id, approved) => {
    const item = (onetime || []).find((o) => o.id === id);
    if (!item) return;

    const statusText = approved ? "approved" : "rejected";

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? {
              ...o,
              invoiceException: {
                ...(o.invoiceException || {}),
                status: statusText,
                reviewedAt: today(),
                reviewedBy: currentUser?.name || "Finance",
                reviewedById: currentUser?.id || currentUser?.uid || "",
              },
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: currentUser?.name || "Finance",
                  date: today(),
                  note: approved
                    ? "✅ Finance approved invoice exception — requester can create a new request."
                    : "❌ Finance rejected invoice exception — requester must upload the purchase invoice first.",
                },
              ],
            }
          : o
      )
    );

    logAction?.(
      approved ? "approve" : "reject",
      "invoice-exception",
      id,
      item?.title,
      approved ? "Invoice exception approved" : "Invoice exception rejected"
    );

    showNotif(approved ? "Invoice exception approved." : "Invoice exception rejected.");
  };

  const reviewInvoiceAndClose = (id) => {
    const item = (onetime || []).find((o) => o.id === id);

    setOnetime((p) =>
      p.map((o) =>
        o.id === id
          ? addHistory(
              {
                ...o,
                invoiceReview: {
                  reviewedAt: today(),
                  reviewedBy: currentUser?.name || "Finance",
                },
                paymentInfo: {
                  method: o.financeSchedule?.method || "",
                  date: o.bankRelease?.date || today(),
                },
              },
              "closed_paid",
              "Invoice reviewed — request closed as paid"
            )
          : o
      )
    );

    logAction?.("pay", "one-time", id, item?.title, "Invoice reviewed & closed");
    showNotif("Invoice reviewed and request closed! ✅");
  };

  const RequestCard = ({ r, canApprove, onApprove, btnLabel, onRejectFn, extra }) => {
    const [open, setOpen] = useState(false);
    const sc = statusConfig[r.status] || { label: r.status, color: C.muted };
    const pc = priorityConfig[r.priority] || priorityConfig.medium;
    const showAttachments = canSeeAll || canManager || canCEO || canFinance || canHRFinance || userIsCurrentApprover(r);
    const displayRequestedDate =
      r.financeSchedule?.approvedDate || r.requestedPaymentDate || r.dueDate;
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
              {getPendingWithLabel(r) && (
                <Badge label={getPendingWithLabel(r)} color={C.orange} />
              )}
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
              {getPendingWithLabel(r) && (
                <>
                  <span>·</span>
                  <span style={{ color: C.orange }}>{getPendingWithLabel(r)}</span>
                </>
              )}
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
                "pending_schedule_preparation",
                "pending_schedule_verified",
                "pending_release_initiation",
                "pending_release_verify",
                "pending_pay",
                "pending_invoice_upload",
                "pending_invoice_review",
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
                      ? `✓ Schedule Prepared: ${fmtDate(r.financeSchedule.approvedDate)}`
                      : "○ Schedule preparation pending"}
                  </span>
                  <span style={{ color: r.financeSchedule?.verifiedAt ? C.green : C.muted }}>
                    {r.financeSchedule?.verifiedAt
                      ? "✓ Schedule verified"
                      : "○ Schedule verification pending"}
                  </span>
                  <span style={{ color: r.releaseInitiation ? C.green : C.muted }}>
                    {r.releaseInitiation ? "✓ Release initiated" : "○ Release initiation pending"}
                  </span>
                  <span style={{ color: r.releaseVerification ? C.green : C.muted }}>
                    {r.releaseVerification ? "✓ Release verified" : "○ Release verification pending"}
                  </span>
                  <span style={{ color: r.bankRelease ? C.green : C.muted }}>
                    {r.bankRelease ? "✓ Paid + receipt uploaded" : "○ Payment pending"}
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
                    <span style={{ color: C.text }}>
  {h.note || h.comment || h.reason || h.rejectionReason || "-"}
</span>
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
                onClick={() => {
                  setRejectReason("");
                  setRejectModal({ id: r.id, fn: onRejectFn, reason: "" });
                }}
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

  const ActionSection = ({
    label,
    description,
    color,
    items,
    canApprove,
    onApprove,
    btnLabel,
    onRejectFn,
    extra,
  }) => (
    <div
      style={{
        background: C.card,
        border: `1px solid ${color}44`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 14,
        padding: "16px 18px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color }}>{label}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {description}
          </div>
        </div>
        <Badge label={String(items.length)} color={color} />
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((r) => (
          <RequestCard
            key={r.id}
            r={r}
            canApprove={canApprove}
            onApprove={onApprove}
            btnLabel={btnLabel}
            onRejectFn={onRejectFn}
            extra={extra}
          />
        ))}
      </div>
    </div>
  );


  const canPrepareScheduleFor = (r) => isHrRequest(r) ? canHRFinance : canFinance;
  const canInitiateReleaseFor = (r) => isHrRequest(r) ? canHRFinance : canFinance;
  const canPayFor = (r) => isHrRequest(r) ? canHRFinance : canFinance;
  const canManageInvoiceUploadFor = (r) => isHrRequest(r) ? canHRFinance : canFinance;
  const canVerifyFinanceFor = (r) => canFinance;

  const actionStages = [
    {
      label: "Manager Approval",
      description: "Review requests currently assigned to you as manager.",
      color: C.orange,
      items: queues.pending_manager,
      canApprove: canManager,
      onApprove: approveManager,
      btnLabel: "✓ Approve",
      onRejectFn: rejectOneTime,
    },
    {
      label: "HR Finance Review",
      description: "HR Finance reviews HR-related requests before HR managers.",
      color: "#06B6D4",
      items: queues.pending_hr_finance,
      canApprove: canHRFinance,
      onApprove: approveHRFinance,
      btnLabel: "✓ HR Finance Approve",
      onRejectFn: rejectOneTime,
    },
    {
      label: "HR Level 1 Approval",
      description: "First HR department approval level configured in Departments → HR.",
      color: "#A78BFA",
      items: queues.pending_hr_manager_1,
      canApprove: true,
      onApprove: approveHRManager1,
      btnLabel: "✓ Approve",
      onRejectFn: rejectOneTime,
    },
    {
      label: "HR Level 2 Approval",
      description: "Second HR department approval level configured in Departments → HR.",
      color: "#7C3AED",
      items: queues.pending_hr_manager_2,
      canApprove: true,
      onApprove: approveHRManager2,
      btnLabel: "✓ Approve",
      onRejectFn: rejectOneTime,
    },
    {
      label: "CEO Approval",
      description: "Requests waiting for CEO decision.",
      color: "#EC4899",
      items: queues.pending_ceo,
      canApprove: canCEO,
      onApprove: approveCEO,
      btnLabel: "✓ Approve",
      onRejectFn: rejectOneTime,
    },
    {
      label: "Finance Manager Approval",
      description: "Finance Manager review before scheduling the payment.",
      color: C.gold,
      items: queues.pending_finance,
      canApprove: canFinance,
      onApprove: approveFinance,
      btnLabel: "✓ Approve",
      onRejectFn: rejectOneTime,
    },
    {
      label: "Prepare Schedule",
      description: "Set the approved payment date, method, company, and bank.",
      color: C.purple,
      items: queues.pending_schedule_preparation,
      canApprove: false,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canPrepareScheduleFor(r) && (
          <button
            className="btn-primary"
            onClick={() => openScheduleModal(r)}
            style={{ fontSize: 12, padding: "7px 16px", width: "100%" }}
          >
            📅 Prepare Schedule
          </button>
        ),
    },
    {
      label: "Verify Schedule",
      description: "Confirm or adjust the prepared schedule.",
      color: "#7C3AED",
      items: queues.pending_schedule_verified,
      canApprove: canFinance,
      onApprove: verifySchedule,
      btnLabel: "✓ Verify Schedule",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-primary"
            onClick={() => openScheduleModal(r)}
            style={{ fontSize: 12, padding: "7px 16px", width: "100%", marginTop: 6 }}
          >
            📅 Reschedule
          </button>
        ),
    },
    {
      label: "Initiate Release",
      description: "Start the payment release process.",
      color: C.accent,
      items: queues.pending_release_initiation,
      canApprove: canFinance || canHRFinance,
      onApprove: initiateRelease,
      btnLabel: "✓ Initiate Release",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-primary"
            onClick={() => openScheduleModal(r)}
            style={{ fontSize: 12, padding: "7px 16px", width: "100%", marginTop: 6 }}
          >
            📅 Reschedule
          </button>
        ),
    },
    {
      label: "Verify Release",
      description: "Confirm the release before payment.",
      color: "#2563EB",
      items: queues.pending_release_verify,
      canApprove: canFinance,
      onApprove: verifyRelease,
      btnLabel: "✓ Verify Release",
      onRejectFn: null,
      extra: (r) =>
        canFinance && (
          <button
            className="btn-primary"
            onClick={() => openScheduleModal(r)}
            style={{ fontSize: 12, padding: "7px 16px", width: "100%", marginTop: 6 }}
          >
            📅 Reschedule
          </button>
        ),
    },
    {
      label: "Pay + Upload Receipt",
      description: "Complete payment and attach the receipt.",
      color: C.green,
      items: queues.pending_pay,
      canApprove: false,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canPayFor(r) && (
          <>
            <button
              className="btn-primary"
              onClick={() => openScheduleModal(r)}
              style={{ fontSize: 12, padding: "7px 16px", width: "100%", marginBottom: 6 }}
            >
              📅 Reschedule
            </button>
            <button
              className="btn-green"
              onClick={() => openPayModal(r.id)}
              style={{ fontSize: 12, padding: "7px 16px", width: "100%" }}
            >
              💰 Pay + Upload Receipt
            </button>
          </>
        ),
    },
    {
      label: "Employee Invoice / Exception",
      description: "Track paid requests waiting for employee purchase invoice, send reminders, or approve exception requests.",
      color: "#14B8A6",
      items: queues.pending_invoice_upload,
      canApprove: false,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canManageInvoiceUploadFor(r) && (
          <div style={{ display: "grid", gap: 6 }}>
            {missingPurchaseInvoice(r) && (
              <button
                className="btn-primary"
                onClick={() => sendInvoiceReminder(r.id)}
                style={{ fontSize: 12, padding: "7px 16px", width: "100%" }}
              >
                🔔 Send Invoice Reminder
              </button>
            )}

            {r.invoiceException?.status === "pending" && (
              <div
                style={{
                  background: C.gold + "12",
                  border: `1px solid ${C.gold}33`,
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 11,
                  color: C.gold,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Exception requested</div>
                <div style={{ color: C.text }}>{r.invoiceException.reason}</div>
              </div>
            )}

            {r.invoiceException?.status === "pending" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <button
                  className="btn-green"
                  onClick={() => reviewInvoiceException(r.id, true)}
                  style={{ fontSize: 12, padding: "7px 10px", width: "100%" }}
                >
                  ✅ Approve Exception
                </button>
                <button
                  className="tab-btn"
                  onClick={() => reviewInvoiceException(r.id, false)}
                  style={{ fontSize: 12, padding: "7px 10px", width: "100%" }}
                >
                  ❌ Reject Exception
                </button>
              </div>
            )}

            {r.invoiceException?.status === "approved" && (
              <div style={{ fontSize: 11, color: C.green }}>
                ✅ Exception approved — requester can create a new request.
              </div>
            )}
          </div>
        ),
    },
    {
      label: "Invoice Review & Close",
      description: "Review uploaded purchase invoices and close the request.",
      color: "#14B8A6",
      items: queues.pending_invoice_review,
      canApprove: false,
      onApprove: null,
      btnLabel: "",
      onRejectFn: null,
      extra: (r) =>
        canFinance &&
        r.purchaseInvoices?.length > 0 && (
          <button
            className="btn-green"
            onClick={() => reviewInvoiceAndClose(r.id)}
            style={{ fontSize: 12, padding: "7px 16px", width: "100%" }}
          >
            ✅ Review Invoice & Close
          </button>
        ),
    },
  ];

  const visibleStages = actionStages.filter((stage) => stage.items.length > 0);

  const totalPending = visibleStages.reduce((sum, stage) => sum + stage.items.length, 0);
  const hasNoApprovals = !canSeeAll && totalPending === 0;

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
          ACTIONS
        </div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>One-Time Approvals</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 5 }}>
          Only requests waiting for your action are shown here.
        </div>
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${totalPending > 0 ? C.orange + "66" : C.border}`,
          borderLeft: `4px solid ${totalPending > 0 ? C.orange : C.green}`,
          borderRadius: 14,
          padding: "16px 18px",
          marginBottom: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>
            {totalPending > 0 ? "Pending actions" : "No pending actions"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {totalPending > 0
              ? "Review the cards below and take the required action."
              : "You are clear. Nothing is waiting for your approval right now."}
          </div>
        </div>
        <Badge label={String(totalPending)} color={totalPending > 0 ? C.orange : C.green} />
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
            No one-time approval access
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            Your role is not assigned to approve one-time requests.
          </div>
        </div>
      ) : visibleStages.length === 0 ? (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 40,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            All clear
          </div>
          <div style={{ fontSize: 13, color: C.muted }}>
            There are no one-time requests waiting for your action.
          </div>
        </div>
      ) : (
        visibleStages.map((stage, i) => <ActionSection key={i} {...stage} />)
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
        <div className="overlay" onClick={() => { setRejectModal(null); setRejectReason(""); }}>
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
              id="rejectReasonText"
              className="inp"
              rows={4}
              value={rejectReason}
              onChange={(e) => {
                const value = e.target.value;
                setRejectReason(value);
                setRejectModal((prev) => (prev ? { ...prev, reason: value } : prev));
              }}
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
              <button className="btn-ghost" onClick={() => { setRejectModal(null); setRejectReason(""); }}>
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
              📅 Schedule Preparation / Reschedule
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
                  lang="en-GB"
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
                  {["Bank Transfer","Cash", "Sadad", "Credit Card"].map(
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
                onClick={() => saveSchedulePreparation(scheduleModal)}
                style={{ flex: 1 }}
              >
                Save Schedule / Reschedule
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
              💰 Pay + Upload Receipt
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
              {(onetime || []).find((o) => o.id === bankModal?.id)?.title}
            </div>
            {(onetime || []).find((o) => o.id === bankModal?.id)?.financeSchedule && (
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 18 }}>
                Scheduled: {" "}
                {fmtDate(
                  (onetime || []).find((o) => o.id === bankModal?.id)?.financeSchedule?.approvedDate
                )}{" "}
                · {" "}
                {(onetime || []).find((o) => o.id === bankModal?.id)?.financeSchedule?.method}
              </div>
            )}

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  PAYMENT DATE
                </label>
                <input
                  className="inp"
                  type="date"
                  lang="en-GB"
                  value={bankForm.date}
                  onChange={(e) => setBankForm({ ...bankForm, date: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  NOTE
                </label>
                <input
                  className="inp"
                  value={bankForm.note}
                  onChange={(e) => setBankForm({ ...bankForm, note: e.target.value })}
                  placeholder="Optional payment note..."
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  PAYMENT RECEIPT *
                </label>
                <PayInvoiceUpload payInvoices={receiptFiles} onChange={setReceiptFiles} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-green"
                onClick={payAndUploadReceipt}
                style={{ flex: 1, opacity: receiptFiles.length ? 1 : 0.6 }}
              >
                Confirm Paid + Receipt ({receiptFiles.length} file{receiptFiles.length !== 1 ? "s" : ""})
              </button>
              <button className="btn-ghost" onClick={() => setBankModal(null)}>
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