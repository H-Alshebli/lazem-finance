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
      finance: "",
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

  // ── Basic Firestore wrappers ─────────────────────────────
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

  const addNotification = (type, title, body) =>
    addItem(COL.notifications, {
      type,
      title,
      body,
      read: false,
    });

  const dismissNotification = (id) =>
    updateItem(COL.notifications, id, { read: true });

  const dismissAllNotifications = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => dismissNotification(n.id)));
  };

  const savePerms = (perms) => {
    setPermissions_(perms);
    savePermissions(perms);
  };

  const saveDepts = (depts) => {
    setDeptConfig_(depts);
    saveDeptConfig(depts);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const setFirebaseUserRole = async (userId, newRole) => {
    await updateUserRole(userId, newRole);
  };

  // ── File sanitize / restore helpers ──────────────────────
  const cacheFileData = (files) => {
    if (!files) return [];

    return files.map((f) => {
      if (f.dataUrl && f.id) {
        try {
          sessionStorage.setItem(`file_${f.id}`, f.dataUrl);
        } catch (e) {
          console.warn("Failed to cache file dataUrl:", e);
        }
      }

      return {
        id: f.id || "",
        name: f.name || "",
        size: f.size || 0,
        type: f.type || "",
        uploadedAt: f.uploadedAt || "",
        downloadUrl: f.downloadUrl || "",
      };
    });
  };

  const restoreFileData = (files) => {
    if (!files) return [];

    return files.map((f) => {
      const cached = f.id ? sessionStorage.getItem(`file_${f.id}`) : null;
      return {
        ...f,
        ...(cached ? { dataUrl: cached } : {}),
      };
    });
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

  // ── Smart setters used by existing pages ─────────────────
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

  const smartSetOnetime = (fn) => {
    const newItems = typeof fn === "function" ? fn(onetime) : fn;

    newItems.forEach((item) => {
      const exists = onetime.find((o) => o.id === item.id);

      if (!exists) {
        const { id, ...rest } = item;
        addItem(COL.onetime, sanitize(rest));
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        updateItem(COL.onetime, item.id, sanitize(item));
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
        // Data
        recurring,
        onetime,
        entitlements,
        auditLog,
        notifications,
        permissions,
        deptConfig,
        allUsers,
        unreadCount,

        // Direct mutations
        addRecurring,
        updateRecurring,
        deleteRecurring,
        addOnetime,
        updateOnetime,
        addEntitlement,
        updateEntitlement,

        // Backward-compatible setters
        setRecurring: smartSetRecurring,
        setOnetime: smartSetOnetime,
        setEntitlements: smartSetEntitlements,

        // System actions
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