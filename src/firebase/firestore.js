import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, setDoc, getDoc
} from "firebase/firestore";
import { db } from "./config";

// ─── Collection names ────────────────────────────────────
export const COL = {
  users:       "users",
  recurring:   "recurring",
  onetime:     "onetime",
  entitlements:"entitlements",
  auditLog:    "auditLog",
  notifications:"notifications",
  permissions: "permissions",
  deptConfig:  "deptConfig",
};

// ─── Generic real-time listener ──────────────────────────
export function listenCol(colName, callback, orderField = "createdAt") {
  const q = query(collection(db, colName), orderBy(orderField, "desc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── Generic add ─────────────────────────────────────────
export async function addItem(colName, data) {
  return addDoc(collection(db, colName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── Generic update ──────────────────────────────────────
export async function updateItem(colName, id, data) {
  return updateDoc(doc(db, colName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Generic delete ──────────────────────────────────────
export async function deleteItem(colName, id) {
  return deleteDoc(doc(db, colName, id));
}

// ─── User profile (stored in Firestore, keyed by Firebase Auth UID) ──
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, COL.users, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function setUserProfile(uid, data) {
  return setDoc(doc(db, COL.users, uid), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function listenUserProfile(uid, callback) {
  return onSnapshot(doc(db, COL.users, uid), snap => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  });
}

export function listenAllUsers(callback) {
  return onSnapshot(collection(db, COL.users), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─── Permissions (single doc, keyed by role) ─────────────
export async function getPermissions() {
  const snap = await getDoc(doc(db, "config", "permissions"));
  return snap.exists() ? snap.data() : null;
}

export function listenPermissions(callback) {
  return onSnapshot(doc(db, "config", "permissions"), snap => {
    if (snap.exists()) callback(snap.data());
  });
}

export async function savePermissions(perms) {
  return setDoc(doc(db, "config", "permissions"), perms);
}

// ─── Dept Config (single doc) ────────────────────────────
export function listenDeptConfig(callback) {
  return onSnapshot(doc(db, "config", "departments"), snap => {
    if (snap.exists()) callback(snap.data().depts || []);
  });
}

export async function saveDeptConfig(depts) {
  return setDoc(doc(db, "config", "departments"), { depts });
}
