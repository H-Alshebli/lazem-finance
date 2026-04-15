import { useEffect } from "react";
import { useAuth } from "./context/AuthContext";
import { useData } from "./context/DataContext";
import AppCore, { AuthGate } from "./AppCore";

export default function App() {
  const auth = useAuth();
  const data = useData();

  // Inject Firebase auth functions into AuthGate so the login page uses Firebase
  useEffect(() => {
    AuthGate._firebaseLogin    = auth.login;
    AuthGate._firebaseRegister = auth.register;
  }, [auth.login, auth.register]);

  if (auth.isLoading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0B0F1A",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#6B7A99", fontFamily: "IBM Plex Sans, sans-serif", fontSize: 14
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>Loading Lazem Finance Portal...</div>
        </div>
      </div>
    );
  }

  const authUser = auth.currentUser && auth.userProfile
    ? { ...auth.userProfile, uid: auth.currentUser.uid, email: auth.currentUser.email }
    : null;

  return (
    <AppCore
      firebaseUser={authUser}
      firebaseLogout={auth.logout}
      firebaseData={data}
      firebaseAllUsers={data.allUsers}
      firebaseSetAuthUsers={data.setFirebaseUserRole}
    />
  );
}