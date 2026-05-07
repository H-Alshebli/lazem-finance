import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  listenCol,
  listenPermissions,
  listenDeptConfig,
  listenAllUsers,
  addItem,
  updateItem,
  deleteItem,
  savePermissions,
  saveDeptConfig,
  updateUserRole,
  COL,
} from "../firebase/firestore";
import { DEFAULT_PERMISSIONS, DEPARTMENTS } from "../utils/constants";
import {
  buildStatusNotification,
  findNewHistoryNote,
  getNoteRecipients,
  getRecipientsForStatus,
  sendEmailNotification,
} from "../utils/notificationEngine";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { currentUser, userProfile } = useAuth();

  const [recurring, setRecurringState] = useState([]);
  const [onetime, setOnetimeState] = useState([]);
  const [entitlements, setEntitlementsState] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [permissions, setPermissions_] = useState(DEFAULT_PERMISSIONS);
  const [deptConfig, setDeptConfig_] = useState(() =>
    DEPARTMENTS.filter((d) => d !== "All Company").map((d) => ({
      id: d,
      name: d,
      manager: "",
      managerApprovers: [],
      finance: [],
      vp: "",
      hr: "",
      staff: [],
      notes: "",
    }))
  );
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    if (!currentUser?.uid) return;

    const subs = [
      listenCol(COL.recurring, setRecurringState, "createdAt"),
      listenCol(
        COL.onetime,
        (items) => setOnetimeState(restoreFiles(items)),
        "createdAt"
      ),
      listenCol(
        COL.entitlements,
        (items) => setEntitlementsState(restoreFiles(items)),
        "createdAt"
      ),
      listenCol(COL.auditLog, setAuditLog, "createdAt"),
      listenCol(COL.notifications, setNotifications, "createdAt"),
      listenPermissions((p) => setPermissions_((prev) => ({ ...prev, ...(p || {}) }))),
      listenDeptConfig(setDeptConfig_),
      listenAllUsers(setAllUsers),
    ];

    return () => subs.forEach((u) => u && u());
  }, [currentUser?.uid]);

  const addRecurring = (data) =>
    addItem(COL.recurring, {
      ...sanitize(data),
      submittedBy: userProfile?.name,
      submittedById: currentUser?.uid,
    });

  const updateRecurring = (id, data) =>
    updateItem(COL.recurring, id, sanitize(data));

  const deleteRecurring = (id) => deleteItem(COL.recurring, id);

  const addOnetime = (data) =>
    addItem(COL.onetime, {
      ...sanitize(data),
      submittedBy: userProfile?.name,
      submittedById: currentUser?.uid,
    });

  const updateOnetime = (id, data) =>
    updateItem(COL.onetime, id, sanitize(data));

  const addEntitlement = (data) =>
    addItem(COL.entitlements, {
      ...sanitize(data),
      submittedBy: userProfile?.name,
      submittedById: currentUser?.uid,
    });

  const updateEntitlement = (id, data) =>
    updateItem(COL.entitlements, id, sanitize(data));

  const logAudit = (
    action,
    entity,
    entityId,
    title,
    detail = "",
    amount = null
  ) =>
    addItem(COL.auditLog, {
      userId: currentUser?.uid,
      userName: userProfile?.name,
      userRole: userProfile?.role,
      action,
      entity,
      entityId,
      title,
      detail,
      amount,
    });

  const addNotification = (type, title, body, meta = {}) =>
    addItem(COL.notifications, {
      type,
      title,
      body,
      read: false,
      timestamp: new Date().toISOString(),
      ...meta,
    });

  const dismissNotification = (id) =>
    updateItem(COL.notifications, id, { read: true });

  const dismissAllNotifications = async () => {
    const unread = myNotifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => dismissNotification(n.id)));
  };

  const savePerms = (permsOrUpdater) => {
    setPermissions_((prev) => {
      const next =
        typeof permsOrUpdater === "function"
          ? permsOrUpdater(prev || DEFAULT_PERMISSIONS)
          : permsOrUpdater;

      savePermissions(next).catch((err) =>
        console.error("Failed to save permissions:", err)
      );

      return next;
    });
  };

  const saveDepts = (deptsOrUpdater) => {
    setDeptConfig_((prev) => {
      const next =
        typeof deptsOrUpdater === "function"
          ? deptsOrUpdater(prev || [])
          : deptsOrUpdater;

      saveDeptConfig(next).catch((err) =>
        console.error("Failed to save department config:", err)
      );

      return next;
    });
  };

  const isNotificationForMe = (n) => {
    if (!n) return false;
    if (!n.recipientIds && !n.recipientEmails) return true;

    const myId = currentUser?.uid || currentUser?.id;
    const myEmail = String(currentUser?.email || "").toLowerCase();

    return (
      (Array.isArray(n.recipientIds) && n.recipientIds.includes(myId)) ||
      (Array.isArray(n.recipientEmails) &&
        n.recipientEmails.map((e) => String(e).toLowerCase()).includes(myEmail))
    );
  };

  const myNotifications = notifications.filter(isNotificationForMe);
  const unreadCount = myNotifications.filter((n) => !n.read).length;

  const setFirebaseUserRole = async (userId, newRole) => {
    await updateUserRole(userId, newRole);
  };

  // Keep only Firestore-safe file fields
  const cacheFileData = (files) => {
    if (!Array.isArray(files)) return [];

    return files.map((f) => ({
      id: f?.id || "",
      name: f?.name || "",
      size: f?.size || 0,
      type: f?.type || "",
      uploadedAt: f?.uploadedAt || "",
      downloadUrl: f?.downloadUrl || "",
    }));
  };

  const restoreFileData = (files) => {
    if (!Array.isArray(files)) return [];
    return files.map((f) => ({ ...f }));
  };

  const sanitize = (item) => {
    const clean = { ...item };

    if (clean.invoices) {
      clean.invoices = cacheFileData(clean.invoices);
    }

    if (clean.purchaseInvoices) {
      clean.purchaseInvoices = cacheFileData(clean.purchaseInvoices);
    }

    if (clean.receiptUploaded?.files) {
      clean.receiptUploaded = {
        ...clean.receiptUploaded,
        files: cacheFileData(clean.receiptUploaded.files),
      };
    }

    Object.keys(clean).forEach((k) => {
      if (clean[k] === undefined) delete clean[k];
    });

    return clean;
  };

  const restoreFiles = (items = []) =>
    items.map((item) => ({
      ...item,
      invoices: restoreFileData(item.invoices),
      purchaseInvoices: restoreFileData(item.purchaseInvoices),
      receiptUploaded: item.receiptUploaded
        ? {
            ...item.receiptUploaded,
            files: restoreFileData(item.receiptUploaded.files),
          }
        : item.receiptUploaded,
    }));

  const smartSetRecurring = (fn) => {
    const newItems = typeof fn === "function" ? fn(recurring) : fn;

    newItems.forEach((item) => {
      const exists = recurring.find((r) => r.id === item.id);

      if (!exists) {
        const { id, ...rest } = item;
        addItem(COL.recurring, sanitize(rest));
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        updateItem(COL.recurring, item.id, sanitize(item));
      }
    });
  };

  const notifyRequestChange = async ({ oldItem, newItem, reason = "status" }) => {
    if (!newItem) return;

    const actorName = userProfile?.name || currentUser?.displayName || "System";
    const actorEmail = currentUser?.email || "";
    const oldStatus = oldItem?.status;
    const newStatus = newItem?.status;

    if (reason === "note") {
      const latestNote = findNewHistoryNote(oldItem, newItem);
      if (!latestNote) return;

      const recipients = getNoteRecipients({
        item: newItem,
        allUsers,
        deptConfig,
        actorEmail,
      });

      if (!recipients.length) return;

      const title = `New Note: ${newItem.title || "Request"}`;
      const body = `${latestNote.by || actorName} added a note on ${newItem.title || "the request"}: ${latestNote.note}`;
      const recipientIds = recipients.map((u) => u.id || u.uid).filter(Boolean);
      const recipientEmails = recipients.map((u) => u.email).filter(Boolean);

      await addNotification("note", title, body, {
        requestId: newItem.id,
        requestType: "one-time",
        status: newStatus,
        recipientIds,
        recipientEmails,
      });

      await sendEmailNotification({
        recipients,
        title,
        body,
        requestTitle: newItem.title,
        status: newStatus,
        actorName,
      });
      return;
    }

    if (oldStatus === newStatus && oldItem) return;

    const recipients = getRecipientsForStatus({
      item: newItem,
      status: newStatus,
      allUsers,
      deptConfig,
    });

    if (!recipients.length) return;

    const built = buildStatusNotification({
      item: newItem,
      oldStatus,
      newStatus,
      actorName,
    });

    const recipientIds = recipients.map((u) => u.id || u.uid).filter(Boolean);
    const recipientEmails = recipients.map((u) => u.email).filter(Boolean);

    await addNotification(built.type, built.title, built.body, {
      requestId: newItem.id,
      requestType: "one-time",
      status: newStatus,
      recipientIds,
      recipientEmails,
    });

    await sendEmailNotification({
      recipients,
      title: built.title,
      body: built.body,
      requestTitle: newItem.title,
      status: newStatus,
      actorName,
    });
  };

  const smartSetOnetime = (fn) => {
    const newItems = typeof fn === "function" ? fn(onetime) : fn;

    newItems.forEach((item) => {
      const exists = onetime.find((o) => o.id === item.id);

      if (!exists) {
        const { id, ...rest } = item;
        addItem(COL.onetime, sanitize(rest));
        notifyRequestChange({ oldItem: null, newItem: item, reason: "status" });
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        updateItem(COL.onetime, item.id, sanitize(item));

        if (exists.status !== item.status) {
          notifyRequestChange({ oldItem: exists, newItem: item, reason: "status" });
        } else {
          notifyRequestChange({ oldItem: exists, newItem: item, reason: "note" });
        }
      }
    });
  };

  const smartSetEntitlements = (fn) => {
    const newItems = typeof fn === "function" ? fn(entitlements) : fn;

    newItems.forEach((item) => {
      const exists = entitlements.find((e) => e.id === item.id);

      if (!exists) {
        const { id, ...rest } = item;
        addItem(COL.entitlements, sanitize(rest));
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        updateItem(COL.entitlements, item.id, sanitize(item));
      }
    });
  };

  return (
    <DataContext.Provider
      value={{
        recurring,
        onetime,
        entitlements,
        auditLog,
        notifications: myNotifications,
        allNotifications: notifications,
        permissions,
        deptConfig,
        allUsers,
        unreadCount,

        addRecurring,
        updateRecurring,
        deleteRecurring,
        addOnetime,
        updateOnetime,
        addEntitlement,
        updateEntitlement,

        setRecurring: smartSetRecurring,
        setOnetime: smartSetOnetime,
        setEntitlements: smartSetEntitlements,

        logAudit,
        addNotification,
        dismissNotification,
        dismissAllNotifications,
        setPermissions: savePerms,
        setDeptConfig: saveDepts,
        setFirebaseUserRole,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}
 
export const useData = () => useContext(DataContext);