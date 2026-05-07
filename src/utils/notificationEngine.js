import { statusConfig } from "./constants";

const ROLE_STATUS_MAP = {
  pending_approval: ["manager"],
  pending_manager: ["manager"],

  pending_vp: ["vp", "requester"],
  pending_hr: ["hr", "requester"],

  pending_ceo: ["ceo", "requester"],
  pending_ceo_1: ["ceo", "requester"],
  pending_ceo_2: ["ceo", "requester"],
  pending_schedule_ceo: ["ceo", "requester"],

  pending_finance: ["finance", "requester"],
  pending_finance_rec: ["finance", "requester"],

  pending_schedule_preparation: ["finance", "requester"],
  pending_schedule_verified: ["finance", "requester"],
  pending_schedule_review: ["finance", "requester"],
  pending_schedule_final_approval: ["finance", "requester"],

  pending_release_initiation: ["finance", "requester"],
  pending_release_verify: ["finance", "requester"],
  pending_bank: ["finance", "requester"],
  pending_bank_release: ["finance", "requester"],

  pending_pay: ["finance", "requester"],
  pending_pay_rec: ["finance", "requester"],

  pending_invoice_upload: ["requester", "staff"],
  pending_invoice: ["requester", "staff"],
  pending_receipt: ["requester", "staff"],

  pending_invoice_review: ["finance", "requester"],

  closed_paid: ["requester"],
  paid: ["requester"],
  completed: ["requester"],
  rejected: ["requester"],
};

const TYPE_BY_STATUS = {
  pending_approval: "approval_required",
  pending_manager: "approval_required",

  pending_vp: "approval_required",
  pending_hr: "approval_required",

  pending_ceo: "approval_required",
  pending_ceo_1: "approval_required",
  pending_ceo_2: "approval_required",
  pending_schedule_ceo: "approval_required",

  pending_finance: "approval_required",
  pending_finance_rec: "approval_required",

  pending_schedule_preparation: "approval_required",
  pending_schedule_verified: "approval_required",
  pending_schedule_review: "approval_required",
  pending_schedule_final_approval: "approval_required",

  pending_release_initiation: "approval_required",
  pending_release_verify: "approval_required",
  pending_bank: "approval_required",
  pending_bank_release: "approval_required",

  pending_pay: "payment_due",
  pending_pay_rec: "payment_due",

  pending_invoice_upload: "approval_required",
  pending_invoice: "approval_required",
  pending_receipt: "approval_required",
  pending_invoice_review: "approval_required",

  closed_paid: "paid",
  paid: "paid",
  completed: "paid",
  rejected: "rejected",
};

export function statusLabel(status) {
  return (
    statusConfig?.[status]?.label ||
    String(status || "Updated").replaceAll("_", " ")
  );
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(email) {
  return normalizeText(email);
}

function normalizeRole(role) {
  return normalizeText(role);
}

function getUserEmail(user) {
  return (
    user?.email ||
    user?.mail ||
    user?.userEmail ||
    user?.value ||
    ""
  );
}

function getUserId(user) {
  return (
    user?.id ||
    user?.uid ||
    user?.userId ||
    user?.value ||
    ""
  );
}

function uniqueUsers(users = []) {
  const map = new Map();

  users.forEach((u) => {
    if (!u) return;

    const email = getUserEmail(u);
    const id = getUserId(u);
    const key = id || normalizeEmail(email);

    if (!key) return;

    map.set(normalizeText(key), {
      ...u,
      email,
    });
  });

  return [...map.values()];
}

function matchUser(users = [], key) {
  if (!key) return null;

  if (typeof key === "object") {
    const possible =
      matchUser(users, key.id) ||
      matchUser(users, key.uid) ||
      matchUser(users, key.userId) ||
      matchUser(users, key.email) ||
      matchUser(users, key.mail) ||
      matchUser(users, key.userEmail) ||
      matchUser(users, key.value) ||
      matchUser(users, key.name) ||
      matchUser(users, key.displayName) ||
      matchUser(users, key.label) ||
      matchUser(users, key.manager) ||
      matchUser(users, key.approver) ||
      matchUser(users, key.user);

    if (possible) return possible;

    const email = getUserEmail(key);
    if (email) {
      return {
        ...key,
        email,
      };
    }

    return null;
  }

  const value = normalizeText(key);
  if (!value) return null;

  return (users || []).find((u) => {
    const userEmail = normalizeEmail(getUserEmail(u));
    const userId = normalizeText(getUserId(u));
    const uid = normalizeText(u?.uid);
    const id = normalizeText(u?.id);
    const userIdField = normalizeText(u?.userId);
    const name = normalizeText(u?.name);
    const displayName = normalizeText(u?.displayName);
    const label = normalizeText(u?.label);

    return (
      id === value ||
      uid === value ||
      userId === value ||
      userIdField === value ||
      userEmail === value ||
      name === value ||
      displayName === value ||
      label === value
    );
  });
}

function getItemDepartmentName(item) {
  return (
    item?.approvalDepartment ||
    item?.department ||
    item?.creatorDepartment ||
    item?.requestDepartment ||
    item?.requestedDepartment ||
    item?.departmentName ||
    item?.staffDepartment ||
    item?.userDepartment ||
    item?.submittedByDepartment ||
    item?.requestedFor ||
    ""
  );
}

function extractKeysFromValue(value) {
  const keys = [];

  if (Array.isArray(value)) {
    value.forEach((v) => {
      keys.push(...extractKeysFromValue(v));
    });

    return keys;
  }

  if (typeof value === "object" && value !== null) {
    keys.push(
      value.userId,
      value.uid,
      value.id,
      value.email,
      value.mail,
      value.userEmail,
      value.value,
      value.manager,
      value.approver,
      value.user,
      value.name,
      value.displayName,
      value.label
    );

    // Support nested approval-level structures like:
    // { level: 1, user: "uid" }
    // { level: 1, approver: { id, email } }
    // { manager: { id, email } }
    if (value.user && typeof value.user === "object") {
      keys.push(...extractKeysFromValue(value.user));
    }

    if (value.approver && typeof value.approver === "object") {
      keys.push(...extractKeysFromValue(value.approver));
    }

    if (value.manager && typeof value.manager === "object") {
      keys.push(...extractKeysFromValue(value.manager));
    }

    return keys.filter(Boolean);
  }

  if (value) keys.push(value);

  return keys.filter(Boolean);
}

function deptUsers({ item, roleKey, allUsers, deptConfig }) {
  const departmentName = getItemDepartmentName(item);

  const dept = (deptConfig || []).find(
    (d) =>
      normalizeText(d?.id) === normalizeText(departmentName) ||
      normalizeText(d?.name) === normalizeText(departmentName)
  );

  if (!dept) {
    console.warn("No department config found for notification:", {
      departmentName,
      roleKey,
      itemId: item?.id,
      itemTitle: item?.title,
      itemStatus: item?.status,
    });
    return [];
  }

  const fieldsByRole = {
    manager: [
      "manager",
      "managerApprovers",
      "managers",
      "managerApprovalLevels",
      "approvalLevels",
      "levels",
    ],
    finance: ["finance", "financeApprovers", "financeUsers"],
    vp: ["vp", "vpApprover"],
    hr: ["hr", "hrApprover"],
    staff: ["staff", "staffMembers", "users"],
    ceo: ["ceo", "ceoApprover"],
  };

  const keys = [];

  (fieldsByRole[roleKey] || []).forEach((field) => {
    const value = dept[field];
    keys.push(...extractKeysFromValue(value));
  });

  const matched = keys
    .map((key) => matchUser(allUsers, key))
    .filter(Boolean);

  console.log("Department notification lookup:", {
    departmentName,
    roleKey,
    fieldsChecked: fieldsByRole[roleKey] || [],
    rawDepartmentConfig: dept,
    keys,
    matchedEmails: matched.map((u) => getUserEmail(u)).filter(Boolean),
  });

  return matched;
}

function roleUsers(role, allUsers = []) {
  const wanted = normalizeRole(role);

  return (allUsers || []).filter((u) => {
    const userRole = normalizeRole(u?.role);

    if (wanted === "ceo") {
      return userRole === "ceo";
    }

    return userRole === wanted;
  });
}

function requesterUser(item, allUsers = []) {
  return (
    matchUser(allUsers, item?.submittedById) ||
    matchUser(allUsers, item?.submittedByEmail) ||
    matchUser(allUsers, item?.createdById) ||
    matchUser(allUsers, item?.createdByEmail) ||
    matchUser(allUsers, item?.requesterId) ||
    matchUser(allUsers, item?.requesterEmail) ||
    matchUser(allUsers, item?.staffId) ||
    matchUser(allUsers, item?.staffEmail) ||
    matchUser(allUsers, item?.createdBy) ||
    matchUser(allUsers, item?.submittedBy) ||
    (item?.submittedByEmail
      ? {
          email: item.submittedByEmail,
          name: item.submittedBy || "Requester",
        }
      : null) ||
    (item?.createdByEmail
      ? {
          email: item.createdByEmail,
          name: item.createdBy || "Requester",
        }
      : null) ||
    (item?.requesterEmail
      ? {
          email: item.requesterEmail,
          name: item.requesterName || "Requester",
        }
      : null) ||
    (item?.staffEmail
      ? {
          email: item.staffEmail,
          name: item.staffName || "Requester",
        }
      : null)
  );
}

function staffUsers(item, allUsers, deptConfig) {
  const users = [];

  const fromDept = deptUsers({
    item,
    roleKey: "staff",
    allUsers,
    deptConfig,
  });

  users.push(...fromDept);

  const requester = requesterUser(item, allUsers);
  if (requester) users.push(requester);

  return uniqueUsers(users);
}

export function getRecipientsForStatus({
  item,
  status,
  allUsers = [],
  deptConfig = [],
}) {
  const targets = ROLE_STATUS_MAP[status] || [];
  const users = [];

  console.log("Notification status lookup:", {
    status,
    targets,
    itemId: item?.id,
    itemTitle: item?.title,
    department: getItemDepartmentName(item),
  });

  targets.forEach((target) => {
    if (target === "requester") {
      const requester = requesterUser(item, allUsers);
      if (requester) users.push(requester);
      return;
    }

    if (target === "staff") {
      users.push(...staffUsers(item, allUsers, deptConfig));
      return;
    }

    const fromDept = deptUsers({
      item,
      roleKey: target,
      allUsers,
      deptConfig,
    });

    users.push(...fromDept);

    if (fromDept.length === 0) {
      const fallback = roleUsers(target, allUsers);
      users.push(...fallback);

      console.log("Role fallback notification lookup:", {
        target,
        fallbackEmails: fallback.map((u) => getUserEmail(u)).filter(Boolean),
      });
    }
  });

  const finalUsers = uniqueUsers(users).filter((u) =>
    normalizeEmail(getUserEmail(u))
  );

  console.log("Final notification recipients:", {
    status,
    emails: finalUsers.map((u) => getUserEmail(u)).filter(Boolean),
  });

  return finalUsers;
}

export function getNoteRecipients({
  item,
  allUsers = [],
  deptConfig = [],
  actorEmail = "",
}) {
  const recipients = [
    ...getRecipientsForStatus({
      item,
      status: item?.status,
      allUsers,
      deptConfig,
    }),
  ];

  const requester = requesterUser(item, allUsers);
  if (requester) recipients.push(requester);

  return uniqueUsers(recipients).filter((u) => {
    const email = normalizeEmail(getUserEmail(u));
    return email && email !== normalizeEmail(actorEmail);
  });
}

export async function sendEmailNotification({
  recipients,
  title,
  body,
  requestTitle,
  status,
  actorName,
  requestUrl,
}) {
  const to = uniqueUsers(recipients)
    .map((u) => getUserEmail(u))
    .filter(Boolean);

  console.log("Notification email recipients:", to);

  if (!to.length) {
    console.warn("No notification email recipients found.");
    return;
  }

  try {
    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject: title,
        title,
        body,
        requestTitle,
        statusLabel: statusLabel(status),
        actorName,
        requestUrl,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(
        "Email notification failed:",
        data?.error || response.statusText
      );
    } else {
      console.log("Email notification sent:", data);
    }
  } catch (error) {
    console.error("Email notification failed:", error);
  }
}

export function buildStatusNotification({
  item,
  oldStatus,
  newStatus,
  actorName,
}) {
  const isCreate = !oldStatus;
  const label = statusLabel(newStatus);

  return {
    type: TYPE_BY_STATUS[newStatus] || "approval_required",
    title: isCreate
      ? `New Request: ${item?.title || "Untitled"}`
      : `Request Updated: ${item?.title || "Untitled"}`,
    body: isCreate
      ? `${
          actorName || item?.submittedBy || "A user"
        } created a new request. Current status: ${label}.`
      : `${
          actorName || "A user"
        } moved the request from ${statusLabel(oldStatus)} to ${label}.`,
  };
}

export function findNewHistoryNote(oldItem, newItem) {
  const oldHistory = oldItem?.history || [];
  const newHistory = newItem?.history || [];

  if (newHistory.length <= oldHistory.length) return null;

  const latest = newHistory[newHistory.length - 1];
  if (!latest?.note) return null;

  return latest;
}