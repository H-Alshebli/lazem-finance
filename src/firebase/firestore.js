import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "./config";

// ─── Collection / doc names ───────────────────────────────
export const COL = {
  users: "users",
  recurring: "recurring",
  onetime: "onetime",
  entitlements: "entitlements",
  auditLog: "auditLog",
  notifications: "notifications",
  permissions: "permissions",
  deptConfig: "deptConfig",
  config: "config",
};

// ─── Generic real-time listener ───────────────────────────
export function listenCol(colName, callback, orderField = "createdAt") {
  const q = query(collection(db, colName), orderBy(orderField, "desc"));

  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error(`listenCol failed for "${colName}":`, error);
      callback([]);
    }
  );
}

// ─── Generic add ──────────────────────────────────────────
export async function addItem(colName, data) {
  return addDoc(collection(db, colName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── Generic update ───────────────────────────────────────
export async function updateItem(colName, id, data) {
  return updateDoc(doc(db, colName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Generic delete ───────────────────────────────────────
export async function deleteItem(colName, id) {
  return deleteDoc(doc(db, colName, id));
}

// ─── User profile ─────────────────────────────────────────
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, COL.users, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function setUserProfile(uid, data) {
  return setDoc(
    doc(db, COL.users, uid),
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function updateUserRole(uid, role) {
  return setDoc(
    doc(db, COL.users, uid),
    {
      role,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function listenUserProfile(uid, callback) {
  return onSnapshot(
    doc(db, COL.users, uid),
    (snap) => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    (error) => {
      console.error(`listenUserProfile failed for "${uid}":`, error);
      callback(null);
    }
  );
}

export function listenAllUsers(callback) {
  return onSnapshot(
    collection(db, COL.users),
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (error) => {
      console.error("listenAllUsers failed:", error);
      callback([]);
    }
  );
}

// ─── Permissions config ───────────────────────────────────
export async function getPermissions() {
  const snap = await getDoc(doc(db, COL.config, COL.permissions));
  return snap.exists() ? snap.data() : null;
}

export function listenPermissions(callback) {
  return onSnapshot(
    doc(db, COL.config, COL.permissions),
    (snap) => {
      callback(snap.exists() ? snap.data() : null);
    },
    (error) => {
      console.error("listenPermissions failed:", error);
      callback(null);
    }
  );
}

export async function savePermissions(perms) {
  return setDoc(
    doc(db, COL.config, COL.permissions),
    {
      ...perms,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// ─── Department config ────────────────────────────────────
export function listenDeptConfig(callback) {
  return onSnapshot(
    doc(db, COL.config, "departments"),
    (snap) => {
      callback(snap.exists() ? snap.data().depts || [] : []);
    },
    (error) => {
      console.error("listenDeptConfig failed:", error);
      callback([]);
    }
  );
}

export async function saveDeptConfig(depts) {
  return setDoc(
    doc(db, COL.config, "departments"),
    {
      depts,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}