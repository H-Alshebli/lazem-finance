import { statusConfig } from "./constants";

const ROLE_STATUS_MAP = {
  pending_manager: ["manager"],
  pending_ceo: ["ceo"],
  pending_schedule_ceo: ["ceo"],
  pending_finance: ["finance"],
  pending_schedule_preparation: ["finance"],
  pending_schedule_verified: ["finance"],
  pending_release_initiation: ["finance"],
  pending_release_verify: ["finance"],
  pending_pay: ["finance"],
  pending_invoice_review: ["finance"],
  pending_invoice_upload: ["requester"],
  closed_paid: ["requester"],
  rejected: ["requester"],
};

const TYPE_BY_STATUS = {
  pending_manager: "approval_required",
  pending_ceo: "approval_required",
  pending_schedule_ceo: "approval_required",
  pending_finance: "approval_required",
  pending_schedule_preparation: "approval_required",
  pending_schedule_verified: "approval_required",
  pending_release_initiation: "approval_required",
  pending_release_verify: "approval_required",
  pending_pay: "payment_due",
  pending_invoice_upload: "approval_required",
  pending_invoice_review: "approval_required",
  closed_paid: "paid",
  rejected: "rejected",
};

export function statusLabel(status) {
  return statusConfig?.[status]?.label || String(status || "Updated").replaceAll("_", " ");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function uniqueUsers(users = []) {
  const map = new Map();
  users.forEach((u) => {
    const key = u?.id || u?.uid || normalizeEmail(u?.email);
    if (key) map.set(key, u);
  });
  return [...map.values()];
}

function matchUser(users, key) {
  const value = String(key || "").trim().toLowerCase();
  if (!value) return null;
  return users.find(
    (u) =>
      String(u?.id || "").toLowerCase() === value ||
      String(u?.uid || "").toLowerCase() === value ||
      normalizeEmail(u?.email) === value
  );
}

function deptUsers({ item, roleKey, allUsers, deptConfig }) {
  const departmentName = item?.approvalDepartment || item?.department || item?.creatorDepartment || "";
  const dept = (deptConfig || []).find((d) => d.id === departmentName || d.name === departmentName);
  if (!dept) return [];

  const fieldsByRole = {
    manager: ["manager", "managerApprovers"],
    finance: ["finance"],
    vp: ["vp"],
    hr: ["hr"],
    staff: ["staff"],
  };

  const keys = [];
  (fieldsByRole[roleKey] || []).forEach((field) => {
    const value = dept[field];
    if (Array.isArray(value)) keys.push(...value);
    else if (value) keys.push(value);
  });

  return keys.map((key) => matchUser(allUsers, key)).filter(Boolean);
}

function roleUsers(role, allUsers) {
  return (allUsers || []).filter((u) => u?.role === role);
}

function requesterUser(item, allUsers) {
  return (
    matchUser(allUsers, item?.submittedById) ||
    matchUser(allUsers, item?.submittedByEmail) ||
    (item?.submittedByEmail ? { email: item.submittedByEmail, name: item.submittedBy || "Requester" } : null)
  );
}

export function getRecipientsForStatus({ item, status, allUsers = [], deptConfig = [] }) {
  const targets = ROLE_STATUS_MAP[status] || [];
  const users = [];

  targets.forEach((target) => {
    if (target === "requester") {
      const requester = requesterUser(item, allUsers);
      if (requester) users.push(requester);
      return;
    }

    const fromDept = deptUsers({ item, roleKey: target, allUsers, deptConfig });
    users.push(...fromDept);

    if (fromDept.length === 0) {
      users.push(...roleUsers(target, allUsers));
    }
  });

  return uniqueUsers(users).filter((u) => normalizeEmail(u?.email));
}

export function getNoteRecipients({ item, allUsers = [], deptConfig = [], actorEmail = "" }) {
  const recipients = [
    ...getRecipientsForStatus({ item, status: item?.status, allUsers, deptConfig }),
  ];

  const requester = requesterUser(item, allUsers);
  if (requester) recipients.push(requester);

  return uniqueUsers(recipients).filter(
    (u) => normalizeEmail(u?.email) && normalizeEmail(u.email) !== normalizeEmail(actorEmail)
  );
}

export async function sendEmailNotification({ recipients, title, body, requestTitle, status, actorName }) {
  const to = uniqueUsers(recipients).map((u) => u.email).filter(Boolean);
  if (!to.length) return;

  try {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: title,
        title,
        body,
        requestTitle,
        statusLabel: statusLabel(status),
        actorName,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.error("Email notification failed:", data?.error || response.statusText);
    }
  } catch (error) {
    console.error("Email notification failed:", error);
  }
}

export function buildStatusNotification({ item, oldStatus, newStatus, actorName }) {
  const isCreate = !oldStatus;
  const label = statusLabel(newStatus);

  return {
    type: TYPE_BY_STATUS[newStatus] || "approval_required",
    title: isCreate ? `New Request: ${item?.title || "Untitled"}` : `Request Updated: ${item?.title || "Untitled"}`,
    body: isCreate
      ? `${actorName || item?.submittedBy || "A user"} created a new request. Current status: ${label}.`
      : `${actorName || "A user"} moved the request from ${statusLabel(oldStatus)} to ${label}.`,
  };
}

export function findNewHistoryNote(oldItem, newItem) {
  const oldHistory = oldItem?.history || [];
  const newHistory = newItem?.history || [];
  if (newHistory.length <= oldHistory.length) return null;

  const latest = newHistory[newHistory.length - 1];
  if (!latest?.note) return null;

  const text = String(latest.note || "");
  if (text.includes("💬") || text.toLowerCase().includes("note")) return latest;
  return null;
}
