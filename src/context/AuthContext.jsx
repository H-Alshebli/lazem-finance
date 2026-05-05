import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../firebase/config";
import {
  getUserProfile,
  setUserProfile,
  listenUserProfile,
  addItem,
  COL,
} from "../firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile_] = useState(null);
  const [loading, setLoading] = useState(true);

  // Register new user -> create Firebase Auth account + Firestore profile
  const register = async (email, password, name, department = "") => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const normalizedEmail = email.toLowerCase();
    const createdAt = new Date().toISOString();

    await setUserProfile(cred.user.uid, {
      name,
      email: normalizedEmail,
      role: "staff",
      department,
      avatar: name?.[0]?.toUpperCase() || "U",
      createdAt,
    });

    // Notify Admin when a new account is created.
    // The notification appears in the system Notifications page.
    await addItem(COL.notifications, {
      type: "new_account",
      title: "New user account created",
      body: `${name || "New user"} (${normalizedEmail}) created a new account${department ? ` for ${department}` : ""} and is waiting for review / role assignment.`,
      read: false,
      userId: cred.user.uid,
      userName: name || "New user",
      userEmail: normalizedEmail,
      userRole: "staff",
      userDepartment: department,
      targetRoles: ["admin"],
      createdBy: cred.user.uid,
      eventAt: createdAt,
      timestamp: createdAt,
    });

    return cred;
  };

  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        try {
          const profile = await getUserProfile(user.uid);
          setUserProfile_(profile || null);
        } catch (error) {
          console.error("Failed to load user profile:", error);
          setUserProfile_(null);
        }
      } else {
        setUserProfile_(null);
      }

      setLoading(false);
    });

    return unsub;
  }, []);

  // Keep profile in sync live (role changes from Permissions page)
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsub = listenUserProfile(currentUser.uid, (profile) => {
      setUserProfile_(profile || null);
    });

    return unsub;
  }, [currentUser?.uid]);

  const value = {
    currentUser,
    userProfile,
    register,
    login,
    logout,
    isLoading: loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
