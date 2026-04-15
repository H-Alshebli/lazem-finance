import { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth } from "../firebase/config";
import { getUserProfile, setUserProfile, listenUserProfile } from "../firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]   = useState(null);
  const [userProfile, setUserProfile_]  = useState(null);
  const [loading, setLoading]           = useState(true);

  // Register new user → create Firebase Auth account + Firestore profile
  const register = async (email, password, name) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setUserProfile(cred.user.uid, {
      name,
      email: email.toLowerCase(),
      role: "staff",        // all new accounts start as Staff
      avatar: name[0].toUpperCase(),
      createdAt: new Date().toISOString(),
    });
    return cred;
  };

  const login  = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const profile = await getUserProfile(user.uid);
        setUserProfile_(profile);
      } else {
        setUserProfile_(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Keep profile in sync live (role changes from Permissions page)
  useEffect(() => {
    if (!currentUser) return;
    const unsub = listenUserProfile(currentUser.uid, setUserProfile_);
    return unsub;
  }, [currentUser?.uid]);

  const value = {
    currentUser,
    userProfile,          // { name, email, role, avatar, ... }
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
