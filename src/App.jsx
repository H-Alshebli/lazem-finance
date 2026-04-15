import { useAuth } from "./context/AuthContext";
import { useData } from "./context/DataContext";
import AppCore from "./AppCore";

// Inject useData hook so AppCore can access Firestore data
window.__lazem_useData = useData;

export default function App() {
  const { currentUser, userProfile, logout, isLoading } = useAuth();

  if (isLoading) {
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

  const authUser = currentUser && userProfile
    ? { ...userProfile, uid: currentUser.uid, email: currentUser.email }
    : null;

  return <AppCore firebaseUser={authUser} firebaseLogout={logout} />;
}
