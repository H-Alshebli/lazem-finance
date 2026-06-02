import { statusConfig } from "./constants";

const STATUS_TYPE_MAP = {
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
  paid_onetime: "paid",
  completed: "paid",
  rejected: "rejected",
};

const FINANCE_STATUSES = new Set([
  "pending_finance",
  "pending_finance_rec",
  "pending_schedule_preparation",
  "pending_schedule_verified",
  "pending_schedule_review",
  "pending_schedule_final_approval",
  "pending_release_initiation",
  "pending_release_verify",
  "pending_bank",
  "pending_bank_release",
  "pending_pay",
  "pending_pay_rec",
  "pending_invoice_review",
]);

const CEO_STATUSES = new Set([
  "pending_ceo",
  "pending_ceo_1",
  "pending_ceo_2",
  "pending_schedule_ceo",
]);

const REQUESTER_STATUSES = new Set([
  "pending_invoice_upload",
  "pending_invoice",
  "pending_receipt",
  "closed_paid",
  "paid",
  "paid_onetime",
  "completed",
  "rejected",
]);

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
  return user?.email || user?.mail || user?.userEmail || user?.value || "";
}

function getUserId(user) {
  return user?.id || user?.uid || user?.userId || user?.value || "";
}

function uniqueUsers(users = []) {
  const map = new Map();

  users.forEach((u) => {
    if (!u) return;

    const email = getUserEmail(u);
    const id = getUserId(u);
    const key = normalizeEmail(email) || normalizeText(id);

    if (!key) return;

    map.set(key, {
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
      matchUser(users, key.manager) ||
      matchUser(users, key.approver) ||
      matchUser(users, key.user);

    if (possible) return possible;

    const email = getUserEmail(key);
    if (email) return { ...key, email };

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

    return (
      id === value ||
      uid === value ||
      userId === value ||
      userIdField === value ||
      userEmail === value
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

function findDepartment(item, deptConfig = []) {
  const departmentName = normalizeText(getItemDepartmentName(item));
  if (!departmentName) return null;

  return (deptConfig || []).find(
    (d) =>
      normalizeText(d?.id) === departmentName ||
      normalizeText(d?.name) === departmentName
  );
}

function extractKeysFromValue(value) {
  const keys = [];

  if (Array.isArray(value)) {
    value.forEach((v) => keys.push(...extractKeysFromValue(v)));
    return keys;
  }

  if (value && typeof value === "object") {
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
      value.user
    );

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

function usersFromKeys(keys, allUsers) {
  return uniqueUsers(
    (keys || [])
      .map((key) => matchUser(allUsers, key))
      .filter(Boolean)
  );
}

function roleUsers(role, allUsers = []) {
  const wanted = normalizeRole(role);

  return (allUsers || []).filter((u) => {
    const userRole = normalizeRole(u?.role);
    if (wanted === "ceo") return userRole === "ceo";
    return userRole === wanted;
  });
}

function managerLevels(item, allUsers = [], deptConfig = []) {
  const dept = findDepartment(item, deptConfig);
  if (!dept) return [];

  const rawLevels = Array.isArray(dept.managerApprovers)
    ? dept.managerApprovers
    : Array.isArray(dept.approvalLevels)
    ? dept.approvalLevels
    : Array.isArray(dept.levels)
    ? dept.levels
    : [];

  const levels = rawLevels
    .map((level, index) => {
      const user = matchUser(allUsers, level);
      const fallbackEmail = level?.userEmail || level?.email || "";
      const fallbackId =
        level?.userId || level?.id || level?.uid || level?.value || level || "";

      if (!user && !fallbackEmail) return null;

      return {
        ...(user || {}),
        id: getUserId(user) || fallbackId,
        uid: user?.uid,
        name: user?.name || level?.userName || level?.name || "Manager",
        email: getUserEmail(user) || fallbackEmail,
        pipelineRole: `Manager Level ${index + 1}`,
      };
    })
    .filter((u) => getUserEmail(u));

  if (levels.length) return levels;

  const manager = matchUser(allUsers, dept.manager);
  if (manager) return [{ ...manager, pipelineRole: "Manager" }];

  return [];
}

function deptUsers({ item, roleKey, allUsers, deptConfig }) {
  const dept = findDepartment(item, deptConfig);

  if (!dept) {
    console.warn("No department config found for notification:", {
      departmentName: getItemDepartmentName(item),
      roleKey,
      itemId: item?.id,
      itemTitle: item?.title,
      itemStatus: item?.status,
    });
    return [];
  }

  if (roleKey === "manager") return managerLevels(item, allUsers, deptConfig);

  const fieldsByRole = {
    finance: ["finance", "financeApprovers", "financeUsers"],
    vp: ["vp", "vpApprover"],
    hr: ["hr", "hrApprover"],
    staff: ["staff", "staffMembers", "users"],
    ceo: ["ceo", "ceoApprover"],
  };

  const keys = [];
  (fieldsByRole[roleKey] || []).forEach((field) => {
    keys.push(...extractKeysFromValue(dept[field]));
  });

  const matched = usersFromKeys(keys, allUsers).map((u) => ({
    ...u,
    pipelineRole: roleKey,
  }));

  console.log("Department notification lookup:", {
    departmentName: getItemDepartmentName(item),
    roleKey,
    fieldsChecked: fieldsByRole[roleKey] || [],
    keys,
    matchedEmails: matched.map((u) => getUserEmail(u)).filter(Boolean),
  });

  return matched;
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
    (item?.submittedByEmail
      ? {
          id: item.submittedById || item.submittedByEmail,
          email: item.submittedByEmail,
          name: item.submittedBy || "Requester",
          pipelineRole: "Requester",
        }
      : null) ||
    (item?.createdByEmail
      ? {
          id: item.createdById || item.createdByEmail,
          email: item.createdByEmail,
          name: item.createdBy || "Requester",
          pipelineRole: "Requester",
        }
      : null) ||
    (item?.requesterEmail
      ? {
          id: item.requesterId || item.requesterEmail,
          email: item.requesterEmail,
          name: item.requesterName || "Requester",
          pipelineRole: "Requester",
        }
      : null) ||
    (item?.staffEmail
      ? {
          id: item.staffId || item.staffEmail,
          email: item.staffEmail,
          name: item.staffName || "Requester",
          pipelineRole: "Requester",
        }
      : null)
  );
}

function currentManagerRecipient(item, allUsers, deptConfig) {
  const currentApprover =
    matchUser(allUsers, item?.currentApproverId) ||
    matchUser(allUsers, item?.currentApproverEmail) ||
    (item?.currentApproverEmail
      ? {
          id: item.currentApproverId || item.currentApproverEmail,
          name: item.currentApproverName || "Manager",
          email: item.currentApproverEmail,
        }
      : null);

  if (currentApprover && normalizeEmail(getUserEmail(currentApprover))) {
    return [{ ...currentApprover, pipelineRole: item?.currentApproverRole || "Current Approver" }];
  }

  const levels = managerLevels(item, allUsers, deptConfig);
  const index = Math.max(Number(item?.currentManagerLevel || 1) - 1, 0);
  const level = levels[index] || levels[0];

  if (level) return [level];

  // Last-resort fallback only. This prevents email failure when department config is missing.
  return roleUsers("manager", allUsers).map((u) => ({ ...u, pipelineRole: "Manager" }));
}

function responsibleRecipientsForStatus(item, status, allUsers, deptConfig) {
  if (status === "pending_manager" || status === "pending_approval") {
    return currentManagerRecipient(item, allUsers, deptConfig);
  }

  if (CEO_STATUSES.has(status)) {
    const deptCeo = deptUsers({ item, roleKey: "ceo", allUsers, deptConfig });
    const globalCeo = roleUsers("ceo", allUsers).map((u) => ({ ...u, pipelineRole: "CEO" }));
    return deptCeo.length ? deptCeo : globalCeo;
  }

  if (FINANCE_STATUSES.has(status)) {
    const finance = deptUsers({ item, roleKey: "finance", allUsers, deptConfig });
    const globalFinance = roleUsers("finance", allUsers).map((u) => ({ ...u, pipelineRole: "Finance" }));
    return finance.length ? finance : globalFinance;
  }

  if (status === "pending_vp") {
    const vp = deptUsers({ item, roleKey: "vp", allUsers, deptConfig });
    return vp.length ? vp : roleUsers("vp", allUsers);
  }

  if (status === "pending_hr") {
    const hr = deptUsers({ item, roleKey: "hr", allUsers, deptConfig });
    return hr.length ? hr : roleUsers("hr", allUsers);
  }

  if (REQUESTER_STATUSES.has(status)) {
    const requester = requesterUser(item, allUsers);
    return requester ? [requester] : [];
  }

  return [];
}

export function getPipelineRecipients({ item, allUsers = [], deptConfig = [] }) {
  const recipients = [];

  const requester = requesterUser(item, allUsers);
  if (requester) recipients.push({ ...requester, pipelineRole: "Requester" });

  recipients.push(...managerLevels(item, allUsers, deptConfig));

  const finance = deptUsers({ item, roleKey: "finance", allUsers, deptConfig });
  if (finance.length) {
    recipients.push(...finance.map((u) => ({ ...u, pipelineRole: "Finance" })));
  } else {
    recipients.push(...roleUsers("finance", allUsers).map((u) => ({ ...u, pipelineRole: "Finance" })));
  }

  const deptCeo = deptUsers({ item, roleKey: "ceo", allUsers, deptConfig });
  const ceo = deptCeo.length ? deptCeo : roleUsers("ceo", allUsers);
  recipients.push(...ceo.map((u) => ({ ...u, pipelineRole: "CEO" })));

  return uniqueUsers(recipients).filter((u) => normalizeEmail(getUserEmail(u)));
}

export function getRecipientsForStatus({
  item,
  status,
  allUsers = [],
  deptConfig = [],
  includeRequester = true,
}) {
  const responsible = responsibleRecipientsForStatus(item, status, allUsers, deptConfig);
  const requester = includeRequester ? requesterUser(item, allUsers) : null;

  // New routing rule: notify only the next responsible person plus the requester.
  // This prevents every previous approver / full pipeline member from receiving each movement email.
  const finalUsers = uniqueUsers([...responsible, requester]).filter((u) =>
    normalizeEmail(getUserEmail(u))
  );

  console.log("Final notification recipients:", {
    status,
    responsibleEmails: responsible.map((u) => getUserEmail(u)).filter(Boolean),
    requesterEmail: requester ? getUserEmail(requester) : "",
    finalEmails: finalUsers.map((u) => getUserEmail(u)).filter(Boolean),
  });

  return finalUsers;
}

export function getNoteRecipients({
  item,
  allUsers = [],
  deptConfig = [],
  actorEmail = "",
}) {
  return getRecipientsForStatus({
    item,
    status: item?.status,
    allUsers,
    deptConfig,
    includeRequester: true,
  }).filter((u) => {
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
      console.error("Email notification failed:", data?.error || response.statusText);
    } else {
      console.log("Email notification sent:", data);
    }
  } catch (error) {
    console.error("Email notification failed:", error);
  }
}

export function buildStatusNotification({ item, oldStatus, newStatus, actorName }) {
  const isCreate = !oldStatus;
  const label = statusLabel(newStatus);

  return {
    type: STATUS_TYPE_MAP[newStatus] || "approval_required",
    title: isCreate
      ? `New Request: ${item?.title || "Untitled"}`
      : `Request Updated: ${item?.title || "Untitled"}`,
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

  return latest;
}
