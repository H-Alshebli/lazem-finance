import { useEffect, useState } from "react";
import { C, ROLE_CONFIG, DEFAULT_PERMISSIONS, DEPARTMENTS } from "./utils/constants";
import { daysUntil, today } from "./utils/helpers";

const SEED_RECURRING = [];
const INITIAL_ONETIME = [];

const buildRenewalNotifs = (recurring) => {
  const notifs = [];
  (recurring || []).forEach((r) => {
    const d = Math.ceil((new Date(r.renewalDate) - new Date()) / 86400000);
    if ([7, 14, 30].includes(d)) {
      notifs.push({
        id: r.id + "_renew",
        type: "renewal_reminder",
        title: `Renewal in ${d} days`,
        body: `${r.title} renews on ${r.renewalDate}`,
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
  });
  return notifs;
};

import Sidebar from "./components/Sidebar";

// Pages
import Dashboard from "./pages/Dashboard";
import Forecast from "./pages/Forecast";
import Recurring from "./pages/Recurring";
import OneTime from "./pages/OneTime";
import Entitlements from "./pages/Entitlements";
import Approvals from "./pages/Approvals";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import AuditLog from "./pages/AuditLog";
import Notifications from "./pages/Notifications";
import Permissions from "./pages/Permissions";
import Departments from "./pages/Departments";

// Seed users for standalone/demo mode
const SEED_USERS = {
  "admin@lazem.sa": { id: "u1", name: "Admin User", email: "admin@lazem.sa", password: "admin123", role: "admin", avatar: "A" },
  "finance@lazem.sa": { id: "u2", name: "Reem Al-Dossari", email: "finance@lazem.sa", password: "finance123", role: "finance", avatar: "R" },
  "ceo@lazem.sa": { id: "u3", name: "Mohammed Al-Saud", email: "ceo@lazem.sa", password: "ceo123", role: "ceo", avatar: "M" },
  "manager@lazem.sa": { id: "u4", name: "Sara Al-Otaibi", email: "manager@lazem.sa", password: "manager123", role: "manager", avatar: "S" },
  "staff@lazem.sa": { id: "u5", name: "Ahmed Al-Zahrani", email: "staff@lazem.sa", password: "staff123", role: "staff", avatar: "A" },
  "vp@lazem.sa": { id: "u6", name: "Khalid Al-Rashidi", email: "vp@lazem.sa", password: "vp123", role: "vp", avatar: "K" },
  "hr@lazem.sa": { id: "u7", name: "Nora Al-Shammari", email: "hr@lazem.sa", password: "hr123", role: "hr", avatar: "N" },
};

export function AuthGate({ children }) {
  const [authUsers, setAuthUsers] = useState(SEED_USERS);
  const [currentUser, setCurrentUser] = useState(null);

  const [recurring, setRecurring] = useState(SEED_RECURRING);
  const [onetime, setOnetime] = useState(INITIAL_ONETIME);
  const [entitlements, setEntitlements] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [notifications, setNotifications] = useState(() => buildRenewalNotifs(SEED_RECURRING));
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [deptConfig, setDeptConfig] = useState(() =>
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

  const [screen, setScreen] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loginErr, setLoginErr] = useState("");
  const [regErr, setRegErr] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [showPass, setShowPass] = useState(false);

  const isFirebaseMode = !!import.meta.env.VITE_FIREBASE_API_KEY;

  const handleLogin = async () => {
    setLoginErr("");

    if (isFirebaseMode && AuthGate._firebaseLogin) {
      try {
        await AuthGate._firebaseLogin(loginForm.email.trim(), loginForm.password);
      } catch (e) {
        const msg =
          e.code === "auth/user-not-found" ||
          e.code === "auth/invalid-credential" ||
          e.code === "auth/wrong-password"
            ? "Incorrect email or password."
            : e.code === "auth/invalid-email"
            ? "Invalid email address."
            : "Sign in failed: " + (e.message || e.code);
        setLoginErr(msg);
      }
      return;
    }

    if (isFirebaseMode && !AuthGate._firebaseLogin) {
      setLoginErr("Loading... please try again in a moment.");
      return;
    }

    const key = loginForm.email.toLowerCase().trim();
    const user = authUsers[key];
    if (!user) return setLoginErr("No account found with this email.");
    if (user.password !== loginForm.password) return setLoginErr("Incorrect password.");
    setCurrentUser(user);
  };

  const handleRegister = async () => {
    setRegErr("");
    setRegSuccess("");

    if (!regForm.name.trim()) return setRegErr("Full name is required.");
    if (!regForm.email.includes("@")) return setRegErr("Enter a valid email address.");
    if (regForm.password.length < 6) return setRegErr("Password must be at least 6 characters.");
    if (regForm.password !== regForm.confirm) return setRegErr("Passwords do not match.");

    if (isFirebaseMode && AuthGate._firebaseRegister) {
      try {
        await AuthGate._firebaseRegister(
          regForm.email.trim(),
          regForm.password,
          regForm.name.trim()
        );
        setRegSuccess("Account created! Signing you in...");
        setRegForm({ name: "", email: "", password: "", confirm: "" });
        setTimeout(() => {
          setScreen("login");
          setRegSuccess("");
        }, 1500);
      } catch (e) {
        const msg =
          e.code === "auth/email-already-in-use"
            ? "An account with this email already exists."
            : "Registration failed: " + (e.message || e.code);
        setRegErr(msg);
      }
      return;
    }

    if (isFirebaseMode && !AuthGate._firebaseRegister) {
      setRegErr("Loading... please try again in a moment.");
      return;
    }

    const key = regForm.email.toLowerCase().trim();
    if (authUsers[key]) return setRegErr("An account with this email already exists.");

    const newUser = {
      id: "u" + Date.now(),
      name: regForm.name.trim(),
      email: key,
      password: regForm.password,
      role: "staff",
      avatar: regForm.name.trim()[0].toUpperCase(),
    };

    setAuthUsers((prev) => ({ ...prev, [key]: newUser }));
    setRegSuccess("Account created! You can now log in.");
    setRegForm({ name: "", email: "", password: "", confirm: "" });
    setTimeout(() => {
      setScreen("login");
      setRegSuccess("");
    }, 1800);
  };

  const logout = () => {
    setCurrentUser(null);
    setLoginForm({ email: "", password: "" });
    setScreen("login");
  };

  if (currentUser) {
    return children(currentUser, logout, authUsers, setAuthUsers, {
      recurring,
      setRecurring,
      onetime,
      setOnetime,
      entitlements,
      setEntitlements,
      auditLog,
      notifications,
      setNotifications,
      permissions,
      setPermissions,
      deptConfig,
      setDeptConfig,
      unreadCount: notifications.filter((n) => !n.read).length,
      logAudit: (action, entity, entityId, title, detail = "", amount = null) =>
        setAuditLog((prev) => [
          {
            id: String(Date.now()),
            userId: currentUser.id,
            userName: currentUser.name,
            userRole: currentUser.role,
            action,
            entity,
            entityId,
            title,
            detail,
            amount,
            timestamp: new Date().toISOString(),
          },
          ...(prev || []),
        ]),
      addNotification: (type, title, body) =>
        setNotifications((prev) => [
          {
            id: String(Date.now() + Math.random()),
            type,
            title,
            body,
            timestamp: new Date().toISOString(),
            read: false,
          },
          ...(prev || []),
        ]),
      dismissNotification: (id) =>
        setNotifications((prev) =>
          (prev || []).map((n) => (n.id === id ? { ...n, read: true } : n))
        ),
      dismissAllNotifications: () =>
        setNotifications((prev) =>
          (prev || []).map((n) => ({ ...n, read: true }))
        ),
    });
  }

  const BG = "#0B0F1A";
  const CARD = "#131929";
  const BORDER = "#253047";
  const ACCENT = "#3B82F6";
  const TEXT = "#E8EDF5";
  const MUTED = "#6B7A99";
  const GREEN = "#10B981";
  const RED = "#EF4444";

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        background: BG,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Sans', sans-serif",
        color: TEXT,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        .auth-inp{background:#2A3655;border:1px solid ${BORDER};color:${TEXT};padding:11px 14px;border-radius:9px;width:100%;font-size:14px;outline:none;font-family:inherit;transition:border .2s}
        .auth-inp:focus{border-color:${ACCENT}}
        .auth-btn{background:${ACCENT};color:#fff;border:none;padding:12px;border-radius:9px;font-weight:700;font-size:14px;width:100%;cursor:pointer;transition:opacity .2s;font-family:inherit}
        .auth-btn:hover{opacity:.88}
        .auth-link{color:${ACCENT};cursor:pointer;font-weight:600;text-decoration:underline;background:none;border:none;font-size:13px;font-family:inherit}
        .auth-link:hover{opacity:.8}
      `}</style>

      <div style={{ width: "100%", maxWidth: 460, padding: "0 16px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
            Lazem Finance Portal
          </div>
          <div style={{ fontSize: 13, color: MUTED }}>
            {screen === "login" ? "Sign in to your account" : "Create a new account"}
          </div>
        </div>

        <div
          style={{
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: "32px 36px",
          }}
        >
          {screen === "login" ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
                Welcome back
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                      letterSpacing: 1,
                    }}
                  >
                    EMAIL ADDRESS
                  </label>
                  <input
                    className="auth-inp"
                    type="email"
                    placeholder="you@lazem.sa"
                    value={loginForm.email}
                    onChange={(e) =>
                      setLoginForm((f) => ({ ...f, email: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                      letterSpacing: 1,
                    }}
                  >
                    PASSWORD
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="auth-inp"
                      type={showPass ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={(e) =>
                        setLoginForm((f) => ({ ...f, password: e.target.value }))
                      }
                      onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                      style={{ paddingRight: 42 }}
                    />
                    <button
                      onClick={() => setShowPass((p) => !p)}
                      style={{
                        position: "absolute",
                        right: 12,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: MUTED,
                        cursor: "pointer",
                        fontSize: 16,
                      }}
                    >
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>

                {loginErr && (
                  <div
                    style={{
                      background: RED + "18",
                      border: `1px solid ${RED}44`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: RED,
                    }}
                  >
                    ⚠ {loginErr}
                  </div>
                )}

                <button className="auth-btn" onClick={handleLogin}>
                  Sign In →
                </button>
              </div>

              {!isFirebaseMode && (
                <div
                  style={{
                    marginTop: 24,
                    padding: "16px",
                    background: "#3B82F608",
                    border: `1px solid ${ACCENT}22`,
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      fontWeight: 700,
                      letterSpacing: 1,
                      marginBottom: 10,
                    }}
                  >
                    DEMO ACCOUNTS
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 6,
                    }}
                  >
                    {[
                      ["admin@lazem.sa", "admin123", "#EF4444", "Admin"],
                      ["finance@lazem.sa", "finance123", "#F59E0B", "Finance"],
                      ["ceo@lazem.sa", "ceo123", "#EC4899", "CEO"],
                      ["manager@lazem.sa", "manager123", "#F97316", "Manager"],
                      ["vp@lazem.sa", "vp123", "#14B8A6", "VP"],
                      ["hr@lazem.sa", "hr123", "#A78BFA", "HR"],
                      ["staff@lazem.sa", "staff123", "#6B7A99", "Staff"],
                    ].map(([email, pass, color, label]) => (
                      <button
                        key={email}
                        onClick={() => setLoginForm({ email, password: pass })}
                        style={{
                          background: color + "15",
                          border: `1px solid ${color}33`,
                          borderRadius: 8,
                          padding: "7px 10px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color }}>
                          {label}
                        </div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                          {email}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  textAlign: "center",
                  marginTop: 20,
                  fontSize: 13,
                  color: MUTED,
                }}
              >
                Don't have an account?{" "}
                <button
                  className="auth-link"
                  onClick={() => {
                    setScreen("register");
                    setLoginErr("");
                  }}
                >
                  Create one
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>
                Create account
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                      letterSpacing: 1,
                    }}
                  >
                    FULL NAME *
                  </label>
                  <input
                    className="auth-inp"
                    placeholder="Your full name"
                    value={regForm.name}
                    onChange={(e) =>
                      setRegForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: MUTED,
                      display: "block",
                      marginBottom: 6,
                      fontWeight: 600,
                      letterSpacing: 1,
                    }}
                  >
                    EMAIL ADDRESS *
                  </label>
                  <input
                    className="auth-inp"
                    type="email"
                    placeholder="you@company.com"
                    value={regForm.email}
                    onChange={(e) =>
                      setRegForm((f) => ({ ...f, email: e.target.value }))
                    }
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 13px",
                    background: "#3B82F610",
                    border: "1px solid #3B82F630",
                    borderRadius: 8,
                  }}
                >
                  <span style={{ fontSize: 15 }}>👤</span>
                  <span style={{ fontSize: 12, color: "#6B7A99" }}>
                    New accounts start as <strong style={{ color: "#E8EDF5" }}>Staff</strong>
                    {" "}— an Admin can update your role after sign-up.
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        color: MUTED,
                        display: "block",
                        marginBottom: 6,
                        fontWeight: 600,
                        letterSpacing: 1,
                      }}
                    >
                      PASSWORD *
                    </label>
                    <input
                      className="auth-inp"
                      type={showPass ? "text" : "password"}
                      placeholder="Min 6 chars"
                      value={regForm.password}
                      onChange={(e) =>
                        setRegForm((f) => ({ ...f, password: e.target.value }))
                      }
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        fontSize: 11,
                        color: MUTED,
                        display: "block",
                        marginBottom: 6,
                        fontWeight: 600,
                        letterSpacing: 1,
                      }}
                    >
                      CONFIRM *
                    </label>
                    <input
                      className="auth-inp"
                      type={showPass ? "text" : "password"}
                      placeholder="Repeat password"
                      value={regForm.confirm}
                      onChange={(e) =>
                        setRegForm((f) => ({ ...f, confirm: e.target.value }))
                      }
                    />
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    id="showpw"
                    checked={showPass}
                    onChange={(e) => setShowPass(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label
                    htmlFor="showpw"
                    style={{ fontSize: 12, color: MUTED, cursor: "pointer" }}
                  >
                    Show password
                  </label>
                </div>

                {regErr && (
                  <div
                    style={{
                      background: RED + "18",
                      border: `1px solid ${RED}44`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: RED,
                    }}
                  >
                    ⚠ {regErr}
                  </div>
                )}

                {regSuccess && (
                  <div
                    style={{
                      background: GREEN + "18",
                      border: `1px solid ${GREEN}44`,
                      borderRadius: 8,
                      padding: "10px 14px",
                      fontSize: 13,
                      color: GREEN,
                    }}
                  >
                    ✓ {regSuccess}
                  </div>
                )}

                <button className="auth-btn" onClick={handleRegister}>
                  Create Account →
                </button>
              </div>

              <div
                style={{
                  textAlign: "center",
                  marginTop: 20,
                  fontSize: 13,
                  color: MUTED,
                }}
              >
                Already have an account?{" "}
                <button
                  className="auth-link"
                  onClick={() => {
                    setScreen("login");
                    setRegErr("");
                    setRegSuccess("");
                  }}
                >
                  Sign in
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: MUTED }}>
          Lazem Finance Portal · Internal Use Only
        </div>
      </div>
    </div>
  );
}

export default function AppCore({
  firebaseUser,
  firebaseLogout,
  firebaseData,
  firebaseAllUsers,
  firebaseSetAuthUsers,
} = {}) {
  if (firebaseUser && firebaseData) {
    const authUsers = {};
    (firebaseAllUsers || []).forEach((u) => {
      authUsers[u.email] = u;
    });

    const shared = {
      recurring: firebaseData.recurring || [],
      onetime: firebaseData.onetime || [],
      entitlements: firebaseData.entitlements || [],
      auditLog: firebaseData.auditLog || [],
      notifications: firebaseData.notifications || [],
      unreadCount: firebaseData.unreadCount || 0,
      permissions: firebaseData.permissions || {},
      deptConfig: firebaseData.deptConfig || [],
      setRecurring: firebaseData.setRecurring,
      setOnetime: firebaseData.setOnetime,
      setEntitlements: firebaseData.setEntitlements,
      setPermissions: firebaseData.setPermissions,
      setDeptConfig: firebaseData.setDeptConfig,
      logAudit: firebaseData.logAudit,
      addNotification: firebaseData.addNotification,
      dismissNotification: firebaseData.dismissNotification,
      dismissAllNotifications: firebaseData.dismissAllNotifications,
    };

    const setAuthUsers = (updater) => {
      const prev = {};
      (firebaseAllUsers || []).forEach((u) => {
        prev[u.email] = u;
      });

      const next = typeof updater === "function" ? updater(prev) : updater;

      Object.entries(next).forEach(([email, user]) => {
        const original = prev[email];
        if (original && original.role !== user.role && firebaseSetAuthUsers) {
          firebaseSetAuthUsers(user.id, user.role);
        }
      });
    };

    return (
      <AppInner
        currentUser={firebaseUser}
        logout={firebaseLogout}
        authUsers={authUsers}
        setAuthUsers={setAuthUsers}
        shared={shared}
      />
    );
  }

  return (
    <AuthGate>
      {(currentUser, logout, authUsers, setAuthUsers, shared) => (
        <AppInner
          currentUser={currentUser}
          logout={logout}
          authUsers={authUsers}
          setAuthUsers={setAuthUsers}
          shared={shared}
        />
      )}
    </AuthGate>
  );
}

function AppInner({ currentUser, logout, authUsers, setAuthUsers, shared }) {
  const getDefaultView = (role) => {
    const pages = DEFAULT_PERMISSIONS[role]?.pages || ROLE_CONFIG[role]?.pages || [];
    if (pages.includes("dashboard")) return "dashboard";
    return pages[0] || "recurring";
  };

  const userRole = currentUser.role;
  const [view, setView] = useState(() => getDefaultView(userRole));
  const [notification, setNotification] = useState(null);

  const {
    recurring,
    setRecurring,
    onetime,
    setOnetime,
    entitlements,
    setEntitlements,
    auditLog,
    notifications,
    unreadCount,
    permissions,
    setPermissions,
    deptConfig,
    setDeptConfig,
    logAudit,
    addNotification,
    dismissNotification,
    dismissAllNotifications,
  } = shared;

  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const logAction = (action, entity, entityId, title, detail = "", amount = null) => {
    if (!logAudit) return;
    logAudit(action, entity, entityId, title, detail, amount);
  };

  const addNotif = (type, title, body) => {
    if (!addNotification) return;
    addNotification(type, title, body);
  };

  const dismissNotif = (id) => {
    if (!dismissNotification) return;
    dismissNotification(id);
  };

  const dismissAll = () => {
    if (!dismissAllNotifications) return;
    dismissAllNotifications();
  };

  // Phase 3: auto-approve CEO schedule after 2 days
  useEffect(() => {
    if (!setOnetime) return;
    if (!Array.isArray(onetime) || onetime.length === 0) return;

    const now = new Date();
    let changed = false;

    const updated = onetime.map((item) => {
      if (item.status !== "pending_schedule_ceo") return item;
      if (item.ceoScheduleApproval?.date) return item;

      const sourceDate =
        item.financeSchedule?.scheduledAt ||
        item.history
          ?.slice()
          .reverse()
          .find((h) => h.status === "pending_schedule_ceo")?.date;

      if (!sourceDate) return item;

      const scheduledAt = new Date(sourceDate);
      if (Number.isNaN(scheduledAt.getTime())) return item;

      const diffMs = now.getTime() - scheduledAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays < 2) return item;

      changed = true;

      return {
        ...item,
        status: "pending_bank",
        ceoScheduleApproval: {
          by: "System",
          date: today(),
          autoApproved: true,
        },
        history: [
          ...(item.history || []),
          {
            status: "pending_bank",
            by: "System",
            date: today(),
            note: "CEO schedule approval auto-approved after 2 days",
          },
        ],
      };
    });

    if (changed) {
      setOnetime(updated);

      if (addNotification) {
        addNotification(
          "approval_required",
          "Schedule Auto-Approved",
          "One or more CEO schedule approvals were automatically approved after 2 days"
        );
      }

      if (logAudit) {
        updated.forEach((item, index) => {
          const oldItem = onetime[index];
          if (
            oldItem?.status === "pending_schedule_ceo" &&
            item?.status === "pending_bank" &&
            item?.ceoScheduleApproval?.autoApproved
          ) {
            logAudit(
              "auto_approve",
              "one-time",
              item.id,
              item.title,
              "CEO schedule auto-approved after 2 days"
            );
          }
        });
      }
    }
  }, [onetime, setOnetime, addNotification, logAudit]);

  const role = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const activePages = permissions?.[userRole]?.pages || role.pages || [];

  const overdueCount =
    (recurring || []).filter(
      (r) => r.status !== "paid" && daysUntil(r.renewalDate) < 0
    ).length +
    (onetime || []).filter((o) => {
      const due = o.requestedPaymentDate || o.dueDate;
      return (
        due &&
        daysUntil(due) < 0 &&
        ![
          "paid_onetime",
          "rejected",
          "pending_bank",
          "pending_receipt",
          "pending_invoice",
        ].includes(o.status)
      );
    }).length;

  const dueThisWeek = (recurring || []).filter((r) => {
    const d = daysUntil(r.renewalDate);
    return d >= 0 && d <= 7 && r.status !== "paid";
  }).length;

  const totalPendingApproval =
    (onetime || []).filter((o) => o.status?.startsWith("pending")).length +
    (entitlements || []).filter((e) => e.status?.startsWith("pending")).length +
    (recurring || []).filter((r) => r.status === "pending_approval").length;

  const highPriority = [...(recurring || []), ...(onetime || [])].filter(
    (i) => i.priority === "high"
  ).length;

  const myManagedDepts = (deptConfig || [])
    .filter(
      (d) =>
        d.manager === currentUser?.id ||
        d.manager === currentUser?.email ||
        d.manager === currentUser?.uid
    )
    .map((d) => d.id);

  const deptFilter = (item) =>
    myManagedDepts.length === 0 ||
    myManagedDepts.includes(item.department) ||
    item.department === "All Company";

  const roleApprovalCount = (() => {
    if (userRole === "admin") return totalPendingApproval;

    if (userRole === "manager") {
      return (
        (onetime || []).filter((o) => o.status === "pending_manager" && deptFilter(o)).length +
        (entitlements || []).filter((e) => e.status === "pending_manager" && deptFilter(e)).length +
        (recurring || []).filter((r) => r.status === "pending_approval" && deptFilter(r)).length
      );
    }

    if (userRole === "ceo") {
      return (
        (onetime || []).filter((o) =>
          ["pending_ceo_1", "pending_schedule_ceo"].includes(o.status)
        ).length +
        (entitlements || []).filter((e) =>
          ["pending_ceo_1", "pending_ceo_2"].includes(e.status)
        ).length +
        (recurring || []).filter((r) =>
          ["pending_ceo_1_rec", "pending_ceo_2_rec"].includes(r.status)
        ).length
      );
    }

    if (userRole === "finance") {
      return (
        (onetime || []).filter((o) =>
          [
            "pending_finance",
            "pending_schedule_finance",
            "pending_bank",
            "pending_receipt",
            "pending_invoice",
          ].includes(o.status)
        ).length +
        (entitlements || []).filter((e) =>
          ["pending_finance", "pending_pay"].includes(e.status)
        ).length +
        (recurring || []).filter((r) =>
          ["pending_finance_rec", "pending_pay_rec"].includes(r.status)
        ).length
      );
    }

    if (userRole === "vp") {
      return (entitlements || []).filter((e) => e.status === "pending_vp").length;
    }

    if (userRole === "hr") {
      return (entitlements || []).filter((e) => e.status === "pending_hr").length;
    }

    return 0;
  })();

  const pageProps = {
    recurring,
    setRecurring,
    onetime,
    setOnetime,
    entitlements,
    setEntitlements,
    userRole,
    username: currentUser.name,
    showNotif,
    logAction,
    addNotif,
    deptConfig,
    setDeptConfig,
    currentUser,
    permissions,
    setPermissions,
    authUsers,
    setAuthUsers,
    notifs: notifications,
    notifications,
    unreadCount,
    onDismiss: dismissNotif,
    onDismissAll: dismissAll,
    dismissNotification: dismissNotif,
    dismissAllNotifications: dismissAll,
    logs: auditLog,
    overdueCount,
    dueThisWeek,
    totalPendingApproval,
    highPriority,
    setView,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        flex: 1,
        width: "100%",
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        fontFamily: "'IBM Plex Sans',sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg}}
        .btn-primary{background:${C.accent};color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}
        .btn-primary:hover{opacity:.88}
        .btn-ghost{background:${C.subtle};color:${C.text};border:1px solid ${C.border};padding:8px 16px;border-radius:8px;font-weight:500;font-size:13px;cursor:pointer;font-family:inherit}
        .btn-green{background:#10B981;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;font-family:inherit}
        .inp{background:${C.subtle};border:1px solid ${C.border};color:${C.text};padding:9px 12px;border-radius:8px;font-size:13px;outline:none;font-family:inherit;width:100%}
        .inp:focus{border-color:${C.accent}}
        select.inp{cursor:pointer}
        .overlay{position:fixed;inset:0;background:#00000088;display:flex;align-items:center;justify-content:center;z-index:999;padding:16px}
        .modal{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:28px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
        .tab-btn{padding:7px 16px;border-radius:8px;border:1px solid ${C.border};background:transparent;color:${C.muted};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}
        .tab-btn.active{background:${C.accentGlow};border-color:${C.accent}55;color:${C.accent}}
        .import-zone{border:2px dashed ${C.border};border-radius:10px;padding:32px;text-align:center;cursor:pointer;transition:border-color .2s}
        .import-zone:hover{border-color:${C.accent}}
      `}</style>

      <Sidebar
        view={view}
        setView={setView}
        userRole={userRole}
        activePages={activePages}
        currentUser={currentUser}
        logout={logout}
        unreadCount={unreadCount || 0}
        pendingCount={roleApprovalCount}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px", minWidth: 0, width: "100%" }}>
        {notification && (
          <div
            style={{
              position: "fixed",
              top: 20,
              right: 20,
              zIndex: 999,
              background: notification.type === "success" ? "#10B981" : "#EF4444",
              color: "#fff",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 13,
              boxShadow: "0 8px 24px #00000055",
            }}
          >
            {notification.msg}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 20,
            padding: "10px 18px",
            background: role.color + "12",
            border: `1px solid ${role.color}33`,
            borderRadius: 12,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: role.color + "22",
              border: `2px solid ${role.color}55`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: role.color,
              flexShrink: 0,
            }}
          >
            {currentUser.avatar || currentUser.name?.[0]}
          </div>

          <div>
            <div style={{ fontSize: 13, color: role.color, fontWeight: 700 }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: 11, color: "#6B7A99" }}>
              {role.label} — {role.desc}
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 5, flexWrap: "wrap" }}>
            {role.canSubmit && (
              <span
                style={{
                  fontSize: 10,
                  background: "#10B98122",
                  color: "#10B981",
                  border: "1px solid #10B98133",
                  borderRadius: 5,
                  padding: "2px 8px",
                  fontWeight: 600,
                }}
              >
                ✓ Submit
              </span>
            )}

            {role.canPay && (
              <span
                style={{
                  fontSize: 10,
                  background: "#F59E0B22",
                  color: "#F59E0B",
                  border: "1px solid #F59E0B33",
                  borderRadius: 5,
                  padding: "2px 8px",
                  fontWeight: 600,
                }}
              >
                ✓ Pay
              </span>
            )}

            {(role.canApprove || []).length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  background: role.color + "22",
                  color: role.color,
                  border: `1px solid ${role.color}33`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  fontWeight: 600,
                }}
              >
                ✓ Approve
              </span>
            )}

            {role.canViewAll && (
              <span
                style={{
                  fontSize: 10,
                  background: "#3B82F622",
                  color: "#3B82F6",
                  border: "1px solid #3B82F633",
                  borderRadius: 5,
                  padding: "2px 8px",
                  fontWeight: 600,
                }}
              >
                ✓ All Data
              </span>
            )}
          </div>
        </div>

        {view === "dashboard" && <Dashboard {...pageProps} />}
        {view === "forecast" && <Forecast {...pageProps} />}
        {view === "recurring" && <Recurring {...pageProps} />}
        {view === "onetime" && <OneTime {...pageProps} currentUser={currentUser} />}
        {view === "entitlements" && <Entitlements {...pageProps} />}
        {view === "approvals" && <Approvals {...pageProps} currentUser={currentUser} />}
        {view === "analytics" && <Analytics {...pageProps} />}
        {view === "reports" && <Reports {...pageProps} />}
        {view === "audit" && <AuditLog {...pageProps} />}
        {view === "notifications" && <Notifications {...pageProps} />}
        {view === "permissions" && <Permissions {...pageProps} />}
        {view === "departments" && <Departments {...pageProps} />}
      </div>
    </div>
  );
}