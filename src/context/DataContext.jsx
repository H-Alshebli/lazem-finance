import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  listenCol, listenPermissions, listenDeptConfig,
  listenAllUsers, addItem, updateItem, deleteItem,
  savePermissions, saveDeptConfig, COL
} from "../firebase/firestore";
import { DEFAULT_PERMISSIONS, DEPARTMENTS } from "../utils/constants";

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { currentUser, userProfile } = useAuth();

  const [recurring,    setRecurring]    = useState([]);
  const [onetime,      setOnetime]      = useState([]);
  const [entitlements, setEntitlements] = useState([]);
  const [auditLog,     setAuditLog]     = useState([]);
  const [notifications,setNotifications]= useState([]);
  const [permissions,  setPermissions_] = useState(DEFAULT_PERMISSIONS);
  const [deptConfig,   setDeptConfig_]  = useState(() =>
    DEPARTMENTS.filter(d => d !== "All Company").map(d => ({
      id: d, name: d, manager: "", finance: "", vp: "", hr: "", staff: [], notes: ""
    }))
  );
  const [allUsers,     setAllUsers]     = useState([]);

  // ── Firestore real-time listeners ────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const subs = [
      listenCol(COL.recurring,    setRecurring,    "createdAt"),
      listenCol(COL.onetime,      setOnetime,      "createdAt"),
      listenCol(COL.entitlements, setEntitlements, "createdAt"),
      listenCol(COL.auditLog,     setAuditLog,     "createdAt"),
      listenCol(COL.notifications,setNotifications,"createdAt"),
      listenPermissions(p => setPermissions_(prev => ({ ...prev, ...p }))),
      listenDeptConfig(setDeptConfig_),
      listenAllUsers(setAllUsers),
    ];
    return () => subs.forEach(u => u());
  }, [currentUser?.uid]);

  // ── Wrappers that write to Firestore ─────────────────────
  const addRecurring    = (data) => addItem(COL.recurring,    { ...data, submittedBy: userProfile?.name, submittedById: currentUser?.uid });
  const updateRecurring = (id, data) => updateItem(COL.recurring, id, data);
  const deleteRecurring = (id) => deleteItem(COL.recurring, id);

  const addOnetime    = (data) => addItem(COL.onetime,    { ...data, submittedBy: userProfile?.name, submittedById: currentUser?.uid });
  const updateOnetime = (id, data) => updateItem(COL.onetime, id, data);

  const addEntitlement    = (data) => addItem(COL.entitlements, { ...data, submittedBy: userProfile?.name, submittedById: currentUser?.uid });
  const updateEntitlement = (id, data) => updateItem(COL.entitlements, id, data);

  const logAudit = (action, entity, entityId, title, detail = "", amount = null) =>
    addItem(COL.auditLog, {
      userId: currentUser?.uid,
      userName: userProfile?.name,
      userRole: userProfile?.role,
      action, entity, entityId, title, detail, amount,
    });

  const addNotification = (type, title, body) =>
    addItem(COL.notifications, { type, title, body, read: false });

  const dismissNotification = (id) => updateItem(COL.notifications, id, { read: true });
  const dismissAllNotifications = () =>
    notifications.filter(n => !n.read).forEach(n => dismissNotification(n.id));

  const savePerms = (perms) => {
    setPermissions_(perms);
    savePermissions(perms);
  };

  const saveDepts = (depts) => {
    setDeptConfig_(depts);
    saveDeptConfig(depts);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Update a user's role in Firestore
  const setFirebaseUserRole = async (userId, newRole) => {
    const { setDoc, doc } = await import("firebase/firestore");
    const { db } = await import("../firebase/config");
    await setDoc(doc(db, "users", userId), { role: newRole }, { merge: true });
  };

  // Smart setRecurring — detects new items vs updates
  const smartSetRecurring = (fn) => {
    const newItems = typeof fn === "function" ? fn(recurring) : fn;
    newItems.forEach(item => {
      const exists = recurring.find(r => r.id === item.id);
      if (!exists) {
        // New item — add to Firestore (strip local id)
        const { id, ...rest } = item;
        addItem(COL.recurring, rest);
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        // Changed item — update in Firestore
        updateItem(COL.recurring, item.id, item);
      }
    });
  };

  const smartSetOnetime = (fn) => {
    const newItems = typeof fn === "function" ? fn(onetime) : fn;
    newItems.forEach(item => {
      const exists = onetime.find(o => o.id === item.id);
      if (!exists) {
        const { id, ...rest } = item;
        addItem(COL.onetime, rest);
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        updateItem(COL.onetime, item.id, item);
      }
    });
  };

  const smartSetEntitlements = (fn) => {
    const newItems = typeof fn === "function" ? fn(entitlements) : fn;
    newItems.forEach(item => {
      const exists = entitlements.find(e => e.id === item.id);
      if (!exists) {
        const { id, ...rest } = item;
        addItem(COL.entitlements, rest);
      } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
        updateItem(COL.entitlements, item.id, item);
      }
    });
  };

  return (
    <DataContext.Provider value={{
      // Data
      recurring, onetime, entitlements, auditLog, notifications,
      permissions, deptConfig, allUsers, unreadCount,
      // Mutations
      addRecurring, updateRecurring, deleteRecurring,
      addOnetime, updateOnetime,
      addEntitlement, updateEntitlement,
      setRecurring: smartSetRecurring,
      setOnetime: smartSetOnetime,
      setEntitlements: smartSetEntitlements,
      setAuditLog: () => {},
      setNotifs: () => {},
      setUnreadCount: () => {},
      logAudit, addNotification, dismissNotification, dismissAllNotifications,
      setPermissions: savePerms,
      setDeptConfig: saveDepts,
      setFirebaseUserRole,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
