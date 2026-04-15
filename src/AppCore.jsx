import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";

// ─── COLORS ────────────────────────────────────────────────────────
const C = {
  bg: "#0B0F1A", surface: "#131929", card: "#1A2236", border: "#253047",
  accent: "#3B82F6", accentGlow: "#3B82F620", gold: "#F59E0B",
  green: "#10B981", red: "#EF4444", orange: "#F97316",
  text: "#E8EDF5", muted: "#6B7A99", subtle: "#2A3655", purple: "#8B5CF6",
};

// ─── SEED DATA ─────────────────────────────────────────────────────
// category = top-level tab; subcategory = vendor group within Telecom
const SEED_RECURRING = [];

const INITIAL_ONETIME = [];
const DEPARTMENTS = ["All Company", "EMS", "Sales", "HR", "IT", "Operations", "Admin", "Marketing", "Finance", "Legal"];
const CATEGORIES_RECURRING = ["Subscriptions", "Iqama", "Service", "Utility", "Insurance", "Other"];
const CATEGORIES_ONETIME = ["Medical", "Equipment", "Events", "Legal", "Training", "Maintenance", "Vendor Payment", "Other"];

const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d || "—"; } };
const fmtAmt = (n) => isNaN(n) ? "—" : Number(n).toLocaleString("en-SA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const Badge = ({ label, color }) => (
  <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{label}</span>
);

const statusConfig = {
  // Recurring statuses
  upcoming:            { label: "Upcoming",              color: C.accent  },
  overdue:             { label: "Overdue",               color: C.red     },
  paid:                { label: "Paid",                  color: C.green   },
  pending_approval:    { label: "Pending Approval",      color: C.orange  },
  // General one-time workflow
  pending_manager:     { label: "Pending Manager",       color: C.orange  },
  pending_ceo_1:       { label: "Pending CEO",           color: "#EC4899" },
  pending_finance:     { label: "Pending Finance",       color: C.gold    },
  pending_ceo_2:       { label: "Pending CEO – Release", color: "#EC4899" },
  approved:            { label: "Awaiting Payment",      color: C.purple  },
  pending_pay:         { label: "Pay & Docs",            color: C.purple  },
  paid_onetime:        { label: "Paid",                  color: C.green   },
  rejected:            { label: "Rejected",              color: C.red     },
  // Entitlements extra steps
  pending_vp:          { label: "Pending VP",            color: "#14B8A6" },
  pending_hr:          { label: "Pending HR",            color: "#A78BFA" },
  // Recurring pay step
  pending_pay_rec:     { label: "Pay & Docs",            color: C.purple  },
};
const priorityConfig = {
  high: { label: "High", color: C.red },
  medium: { label: "Medium", color: C.gold },
  low: { label: "Low", color: C.green },
};

function parseExcelToRecurring(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const mapped = rows.map((r, i) => {
        const get = (...keys) => { for (const k of keys) { const found = Object.keys(r).find(rk => rk.toLowerCase().trim() === k.toLowerCase()); if (found && r[found] !== "") return String(r[found]).trim(); } return ""; };
        const rawAmt = get("Total Cost", "Cost", "Amount");
        const amount = parseFloat(rawAmt.replace(/[^0-9.]/g, "")) || 0;
        const currency = rawAmt.includes("$") ? "USD" : rawAmt.toLowerCase().includes("dinar") || rawAmt.includes("KWD") ? "KWD" : "SAR";
        const rawDate = get("Renewal Date", "Due Date", "RenewalDate");
        let renewalDate = "";
        if (rawDate) { try { const d = new Date(rawDate); if (!isNaN(d)) renewalDate = d.toISOString().split("T")[0]; else renewalDate = rawDate; } catch { renewalDate = rawDate; } }
        const rawCategory = get("Category", "Type", "Cat");
        const validCategories = ["Subscriptions", "Iqama", "Service", "Utility", "Insurance", "Other"];
        const category = validCategories.find(c => c.toLowerCase() === rawCategory.toLowerCase()) || (rawCategory ? "Other" : "Subscriptions");
        const rawStatus = get("Status");
        const status = ["upcoming","overdue","paid"].find(s => s.toLowerCase() === rawStatus.toLowerCase()) || "upcoming";
        const rawPriority = get("Priority");
        const priority = ["high","medium","low"].find(p => p.toLowerCase() === rawPriority.toLowerCase()) || "medium";
        return {
          id: Date.now() + i,
          title: get("Subscription Name", "Name", "Title"),
          details: get("Details", "Description"),
          purpose: get("Purpose") || "",
          department: get("Department") || "All Company",
          subcategory: get("Sub-Group", "SubGroup", "Subcategory") || "",
          frequency: get("Billing Cycle", "Frequency") || "Monthly",
          licenses: parseInt(get("Number of Users / Licenses", "Licenses", "Users")) || 1,
          amount, currency, renewalDate,
          category, status, priority,
          paymentMethod: get("Payment Method"),
          notes: get("Notes"),
        };
      }).filter(r => r.title);
      onDone(mapped);
    } catch (err) { onError(err.message); }
  };
  reader.readAsBinaryString(file);
}

// ─── Role definitions ────────────────────────────────────────────
const ROLE_CONFIG = {
  staff: {
    label: "Staff", username: "Ahmed Al-Zahrani",
    color: "#6B7A99",
    desc: "Submit requests only",
    pages: ["recurring","onetime","entitlements"],
    canApprove: [], canSubmit: true, canPay: false, canViewAll: false,
  },
  manager: {
    label: "Manager", username: "Sara Al-Otaibi",
    color: "#F97316",
    desc: "Approve Level 1 — sees own submissions + pending queue",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_manager","pending_approval"], canSubmit: true, canPay: false, canViewAll: false,
  },
  vp: {
    label: "VP", username: "Khalid Al-Rashidi",
    color: "#14B8A6",
    desc: "Approve Entitlements Level 2",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_vp"], canSubmit: true, canPay: false, canViewAll: false,
  },
  hr: {
    label: "HR", username: "Nora Al-Shammari",
    color: "#A78BFA",
    desc: "Approve Entitlements Level 3",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_hr"], canSubmit: true, canPay: false, canViewAll: false,
  },
  ceo: {
    label: "CEO", username: "Mohammed Al-Saud",
    color: "#EC4899",
    desc: "Review & Release — sees pending CEO queues",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_ceo_1","pending_ceo_2","pending_ceo_1_rec","pending_ceo_2_rec"],
    canSubmit: false, canPay: false, canViewAll: false,
  },
  finance: {
    label: "Finance", username: "Reem Al-Dossari",
    color: "#F59E0B",
    desc: "Full access — all requests, payments, approvals",
    pages: ["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports"],
    canApprove: ["pending_finance","pending_finance_rec","pending_pay","pending_pay_rec"],
    canSubmit: true, canPay: true, canViewAll: true,
  },
  executive: {
    label: "Executive", username: "Faisal Al-Ghamdi",
    color: "#8B5CF6",
    desc: "Read-only full overview",
    pages: ["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","permissions"],
    canApprove: [], canSubmit: false, canPay: false, canViewAll: true,
  },
  admin: {
    label: "Admin", username: "Admin User",
    color: "#EF4444",
    desc: "Full system access — all pages, all permissions",
    pages: ["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","audit","notifications","permissions","departments"],
    canApprove: ["pending_manager","pending_approval","pending_vp","pending_hr","pending_ceo_1","pending_ceo_2","pending_ceo_1_rec","pending_ceo_2_rec","pending_finance","pending_finance_rec","pending_pay","pending_pay_rec"],
    canSubmit: true, canPay: true, canViewAll: true,
  },
};

const ALL_NAV = [
  { id: "dashboard",    label: "Dashboard",    icon: "◼",  section: "main"    },
  { id: "forecast",     label: "Forecast",     icon: "📈", section: "main"    },
  { id: "recurring",    label: "Recurring",    icon: "↻",  section: "main"    },
  { id: "onetime",      label: "One-Time",     icon: "≡",  section: "main"    },
  { id: "entitlements", label: "Entitlements", icon: "👤", section: "main"    },
  { id: "approvals",    label: "Approvals",    icon: "✓",  section: "main"    },
  { id: "analytics",    label: "Analytics",    icon: "📊", section: "insight"  },
  { id: "reports",      label: "Reports",      icon: "⬇",  section: "insight"  },
  { id: "audit",        label: "Audit Log",    icon: "🗒",  section: "admin"   },
  { id: "notifications",label: "Notifications",icon: "🔔", section: "admin"   },
  { id: "permissions",  label: "Permissions",  icon: "🔑", section: "admin"   },
  { id: "departments",  label: "Departments",  icon: "🏢", section: "admin"   },
];

// ─── Helper: generate unique ID ──────────────────────────────────
const uid = () => Date.now() + Math.random();

// ─── Renewal reminder seeding ────────────────────────────────────
const buildRenewalNotifs = (recurring) => {
  const notifs = [];
  const now = new Date();
  recurring.forEach(r => {
    if (!r.renewalDate || r.status === "paid") return;
    const d = Math.ceil((new Date(r.renewalDate) - now) / 86400000);
    if ([30,14,7].includes(d)) {
      notifs.push({
        id: `ren-${r.id}-${d}`,
        type: "renewal_reminder",
        title: `Renewal in ${d} days: ${r.title}`,
        body: `${r.title} (${r.department}) renews on ${fmtDate(r.renewalDate)} — ${r.currency} ${fmtAmt(r.amount)}`,
        timestamp: new Date().toISOString(),
        read: false,
      });
    }
  });
  return notifs;
};


// ═══════════════════════════════════════════════════════════════════
// AUTH SYSTEM
// ═══════════════════════════════════════════════════════════════════

// Seed accounts — keyed by email (lowercase)
const SEED_USERS = {
  "admin@lazem.sa":   { id: "u1", name: "Admin User",        email: "admin@lazem.sa",   password: "admin123",    role: "admin",     avatar: "A" },
  "finance@lazem.sa": { id: "u2", name: "Reem Al-Dossari",   email: "finance@lazem.sa", password: "finance123",  role: "finance",   avatar: "R" },
  "ceo@lazem.sa":     { id: "u3", name: "Mohammed Al-Saud",  email: "ceo@lazem.sa",     password: "ceo123",      role: "ceo",       avatar: "M" },
  "manager@lazem.sa": { id: "u4", name: "Sara Al-Otaibi",    email: "manager@lazem.sa", password: "manager123",  role: "manager",   avatar: "S" },
  "staff@lazem.sa":   { id: "u5", name: "Ahmed Al-Zahrani",  email: "staff@lazem.sa",   password: "staff123",    role: "staff",     avatar: "A" },
  "vp@lazem.sa":      { id: "u6", name: "Khalid Al-Rashidi", email: "vp@lazem.sa",       password: "vp123",       role: "vp",        avatar: "K" },
  "hr@lazem.sa":      { id: "u7", name: "Nora Al-Shammari",  email: "hr@lazem.sa",       password: "hr123",       role: "hr",        avatar: "N" },
};

export function AuthGate({ children }) {
  const [authUsers, setAuthUsers] = useState(SEED_USERS);
  const [currentUser, setCurrentUser] = useState(null);

  // ── Shared app data — lives outside login cycle so it persists across account switches ──
  const [recurring, setRecurring] = useState(SEED_RECURRING);
  const [onetime, setOnetime] = useState(INITIAL_ONETIME);
  const [entitlements, setEntitlements] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [notifs, setNotifs] = useState(() => buildRenewalNotifs(SEED_RECURRING));
  const [unreadCount, setUnreadCount] = useState(() => buildRenewalNotifs(SEED_RECURRING).filter(n => !n.read).length);
  const [permissions, setPermissions] = useState(DEFAULT_PERMISSIONS);
  const [deptConfig, setDeptConfig] = useState(() =>
    DEPARTMENTS.filter(d => d !== "All Company").map(d => ({
      id: d, name: d, manager: "", finance: "", vp: "", hr: "", staff: [], notes: "",
    }))
  );
  const [screen, setScreen] = useState("login"); // "login" | "register"
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [regForm, setRegForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [loginErr, setLoginErr] = useState("");
  const [regErr, setRegErr] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    setLoginErr("");
    // Firebase mode — use injected login function
    if (AuthGate._firebaseLogin) {
      try {
        await AuthGate._firebaseLogin(loginForm.email.trim(), loginForm.password);
        // Firebase auth state change will handle the rest via App.jsx
      } catch(e) {
        const msg = e.code === "auth/user-not-found" || e.code === "auth/invalid-credential" || e.code === "auth/wrong-password"
          ? "Incorrect email or password." : e.code === "auth/invalid-email"
          ? "Invalid email address." : "Sign in failed: " + (e.message || e.code);
        setLoginErr(msg);
      }
      return;
    }
    // Standalone mode — internal auth
    const key = loginForm.email.toLowerCase().trim();
    const user = authUsers[key];
    if (!user) return setLoginErr("No account found with this email.");
    if (user.password !== loginForm.password) return setLoginErr("Incorrect password.");
    setCurrentUser(user);
  };

  const handleRegister = async () => {
    setRegErr(""); setRegSuccess("");
    if (!regForm.name.trim()) return setRegErr("Full name is required.");
    if (!regForm.email.includes("@")) return setRegErr("Enter a valid email address.");
    if (regForm.password.length < 6) return setRegErr("Password must be at least 6 characters.");
    if (regForm.password !== regForm.confirm) return setRegErr("Passwords do not match.");
    // Firebase mode
    if (AuthGate._firebaseRegister) {
      try {
        await AuthGate._firebaseRegister(regForm.email.trim(), regForm.password, regForm.name.trim());
        setRegSuccess("Account created! Signing you in...");
        setRegForm({ name: "", email: "", password: "", confirm: "" });
        setTimeout(() => { setScreen("login"); setRegSuccess(""); }, 1500);
      } catch(e) {
        const msg = e.code === "auth/email-already-in-use"
          ? "An account with this email already exists."
          : "Registration failed: " + (e.message || e.code);
        setRegErr(msg);
      }
      return;
    }
    // Standalone mode
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
    setAuthUsers(prev => ({ ...prev, [key]: newUser }));
    setRegSuccess("Account created! You can now log in.");
    setRegForm({ name: "", email: "", password: "", confirm: "" });
    setTimeout(() => { setScreen("login"); setRegSuccess(""); }, 1800);
  };

  const logout = () => { setCurrentUser(null); setLoginForm({ email: "", password: "" }); setScreen("login"); };

  if (currentUser) {
    return children(currentUser, logout, authUsers, setAuthUsers, {
      recurring, setRecurring, onetime, setOnetime, entitlements, setEntitlements,
      auditLog, setAuditLog, notifs, setNotifs, unreadCount, setUnreadCount,
      permissions, setPermissions, deptConfig, setDeptConfig,
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
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Sans', sans-serif", color: TEXT }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
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

        {/* Logo + brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <svg viewBox="0 0 157.94 163.96" style={{ width: 72, display: "inline-block", marginBottom: 12 }} xmlns="http://www.w3.org/2000/svg">
            <defs><style>{`.la1{fill:#43748e}.la2{fill:url(#lalg)}.la3{fill:#eb0045}.la4{fill:#fff}`}</style><linearGradient id="lalg" x1="75.67" y1="16.4" x2="75.67" y2="80.74" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#5ec8da"/><stop offset="1" stopColor="#284d5a"/></linearGradient></defs>
            <path className="la1" d="M19.15,144.55H11.24v-17.8c0-2.83,3.91-2.48,3.91-2.48v16.85h6.58S22.25,144.55,19.15,144.55Z"/><path className="la1" d="M32,142s-2.58,2.83-4.8,2.83a4,4,0,0,1-4.27-4.27c0-3.54,3.39-5.19,8.62-5.19v-.55c0-1.8-.69-2.61-2.67-2.61a10.27,10.27,0,0,0-2.23.29,13,13,0,0,0-2.28.73,2.65,2.65,0,0,1,2.11-3.7h0a16.57,16.57,0,0,1,2.91-.26c4.63,0,6,1.92,6,5.25v6.16c0,1.2,0,2.62.12,3.85C35.49,144.55,32,145.39,32,142Zm-.45-4.11c-3.87,0-4.92,1-4.92,2.25a1.7,1.7,0,0,0,1.8,1.74,3.41,3.41,0,0,0,3.12-3.6Z"/><path className="la1" d="M40,129.62H50.47l-7.76,11.44c.63,0,3.47,0,4.58,0h2.62s.41,3.52-2.72,3.52h-11L44,133H36.84C36.84,129.09,40,129.62,40,129.62Z"/><path className="la1" d="M61.11,144.56a11.55,11.55,0,0,1-3.07.38c-4.71,0-7.27-2.47-7.27-7.72,0-4.48,2.64-7.9,7.09-7.9s6.19,2.79,6.19,6.33a13.82,13.82,0,0,1-.15,2.17H54.68c0,2.64,1.23,4,4.11,4a11.74,11.74,0,0,0,4.33-.87A2.8,2.8,0,0,1,61.11,144.56Zm-3.46-12.42c-1.59,0-2.73,1.17-2.94,3.13h5.52C60.29,133.22,59.27,132.14,57.65,132.14Z"/><path className="la1" d="M69.57,129.62c0,.43-.06,1.7,0,2.67l0,0a5.37,5.37,0,0,1,4.93-3,3.84,3.84,0,0,1,4.12,3,5.32,5.32,0,0,1,4.86-3c2.89,0,4.48,1.59,4.48,5v8s0,2.52-3.84,2.52v-9.66c0-1.6-.37-2.59-1.78-2.59-1.68,0-3.42,2-3.42,4.87v5s.41,2.42-3.79,2.42v-9.7c0-1.47-.3-2.55-1.77-2.55-1.77,0-3.42,2.08-3.42,4.87v4.76s.44,2.62-3.85,2.62V132C66.11,129.38,69.57,129.62,69.57,129.62Z"/><path className="la1" d="M128.84,144.55h11.47v-17.8c0-2.83-3.91-2.48-3.91-2.48v16.85H126.26S125.74,144.55,128.84,144.55Z"/><path className="la1" d="M130.62,126l3.78,13.57h-3.94l-4.34-15.35S129.92,123.64,130.62,126Z"/><path className="la1" d="M117.2,151.21c-3.34.36-3.16-3-3.16-3h2.36c2,0,3.16-.94,3.16-4.1V129.27s3.86-.31,3.86,2.33v12.34c0,3.52-1.16,6.71-6.22,7.27Z"/><path className="la1" d="M119.56,124.73v3.89h3.86v-1.56C123.42,124.42,119.56,124.73,119.56,124.73Z"/><path className="la1" d="M96.24,151.1l-.47-2.94-1-6.33c-.64-4.15.85-7.05,5.53-7.05H101c.67-3,3.15-5.41,7.34-5.41,4.59,0,6.61,2.63,6.61,6.72v8.46h-6.41c-6.66,0-7.34-3.25-7.72-6.73h-.64c-1.7,0-2.17,1-1.73,3.72l.91,5.61S100.37,150.62,96.24,151.1Zm15-14.54c0-2.92-1.17-4.15-3.13-4.15-2.19,0-3.48,1.67-3.48,4,0,2.75.09,5.15,4.39,5.15h2.22Z"/>
            <path className="la2" d="M125.72,16.82a38.45,38.45,0,0,0-50,1.64,38.44,38.44,0,0,0-55.95,52.4c8.13,9.57,22.22,16,41.66,8.87,9.82-3.63,15-4.87,26.33,1.41l1.83,1c1.35.6,3.25,1.4,4.83,2,3,1.12,6.47,2.4,3.34,4.57-1.47,1-4.27,2.81-11.58.22,4.28,1.63,5.34,1.91,5.34,1.91a28.13,28.13,0,0,0,11.2.59c6.93-1.07,17.93-8,25.66-16.48.18-.19.36-.39.53-.59l.92-1a40.88,40.88,0,0,0,4.28-5.78A38.45,38.45,0,0,0,125.72,16.82Z"/>
            <path className="la3" d="M75.67,86.14a15.66,15.66,0,0,0-6.37,1.72c-5.59,2.68-10.21,5.83-18.07,8.77-3,1.12-6.47,2.4-3.34,4.58,1.61,1.11,4.33,3.3,13.31-.5C69.32,97.28,75,95.4,82.7,99.33c0,0,2.32,1.15,2.56,3.27.15,1.24-1,2.37-5.69,2.48a11,11,0,0,0-5.13,2.11c-2.21,1.83-4,1.74-6.16,2.1-2.75.46-4.25,1.67-4.19,3.14,0,.95.39,1.85,2.29,2.8a19.22,19.22,0,0,0,6.69,1.44,31.12,31.12,0,0,0,4.09-.25,44.68,44.68,0,0,0,27.52-13.75C110.74,96.08,130,73.06,130,73.06c-7.75,9.23-19.86,17.17-27.29,18.32a28.13,28.13,0,0,1-11.2-.59s-1.41-.37-7.54-2.76C83.93,88,79.25,86.11,75.67,86.14Z"/>
            <path className="la4" d="M72,57.65A1.63,1.63,0,1,1,70.37,56,1.63,1.63,0,0,1,72,57.65"/><path className="la4" d="M80.84,28.53a1.63,1.63,0,1,1-1.63-1.63,1.63,1.63,0,0,1,1.63,1.63"/><path className="la4" d="M71.51,54.06a1.63,1.63,0,1,1-1.63-1.62,1.63,1.63,0,0,1,1.63,1.62"/><path className="la4" d="M70.93,50.19,69.7,46.36l0-.12c-.06-.32-.36-1.19-.92-1.25a1.46,1.46,0,0,0-1.41.91l-.18.32c-.17.3-.47.82-.74,1.25L50,48.29V49.9l16,.81c1,0,1.63-1.63,1.63-1.63l.09,1.63A1.58,1.58,0,0,0,69.37,52a1.14,1.14,0,0,0,.26,0A1.58,1.58,0,0,0,70.93,50.19Z"/><path className="la4" d="M50.94,49.09a.81.81,0,0,1-1.62,0,.81.81,0,0,1,1.62,0Z"/><path className="la4" d="M103.75,44.38a.78.78,0,1,1-.78-.78A.78.78,0,0,1,103.75,44.38Z"/><path className="la4" d="M102.92,43.6l-16.66-.82c-.13-.25-.34-.65-.59-1.23-.32-.85-.57-1.21-1-1.19-.58,0-.88,1.34-1.16,1.85l-1.36-8.66a2.7,2.7,0,0,0-5.4,0l-3.84,31L72.65,61a1.58,1.58,0,0,0-1.86-1.26,1.59,1.59,0,0,0-1.25,1.87l.74,3.75A2.7,2.7,0,0,0,73,67.92a2.66,2.66,0,0,0,2.69-2.54L79.54,35l1.22,9.82,0,.26a1.79,1.79,0,0,0,1.79,1.45,2.22,2.22,0,0,0,.72-.12c.44-.16.93-.6,1.28-2.5.29.33.41,2.05,2.18,2.05h.13l16-.79Z"/>
          </svg>
          <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Lazem Finance Portal</div>
          <div style={{ fontSize: 13, color: MUTED }}>{screen === "login" ? "Sign in to your account" : "Create a new account"}</div>
        </div>

        {/* Card */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "32px 36px" }}>

          {screen === "login" ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Welcome back</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: MUTED, display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>EMAIL ADDRESS</label>
                  <input className="auth-inp" type="email" placeholder="you@lazem.sa" value={loginForm.email}
                    onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && handleLogin()} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: MUTED, display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>PASSWORD</label>
                  <div style={{ position: "relative" }}>
                    <input className="auth-inp" type={showPass ? "text" : "password"} placeholder="••••••••" value={loginForm.password}
                      onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleLogin()}
                      style={{ paddingRight: 42 }} />
                    <button onClick={() => setShowPass(p => !p)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:MUTED, cursor:"pointer", fontSize:16 }}>
                      {showPass ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                {loginErr && <div style={{ background: RED+"18", border:`1px solid ${RED}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: RED }}>⚠ {loginErr}</div>}
                <button className="auth-btn" onClick={handleLogin}>Sign In →</button>
              </div>

              {/* Demo accounts */}
              <div style={{ marginTop: 24, padding: "16px", background: "#3B82F608", border: `1px solid ${ACCENT}22`, borderRadius: 10 }}>
                <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>DEMO ACCOUNTS</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    ["admin@lazem.sa",   "admin123",   "#EF4444", "Admin"],
                    ["finance@lazem.sa", "finance123", "#F59E0B", "Finance"],
                    ["ceo@lazem.sa",     "ceo123",     "#EC4899", "CEO"],
                    ["manager@lazem.sa", "manager123", "#F97316", "Manager"],
                    ["vp@lazem.sa",      "vp123",      "#14B8A6", "VP"],
                    ["hr@lazem.sa",      "hr123",      "#A78BFA", "HR"],
                    ["staff@lazem.sa",   "staff123",   "#6B7A99", "Staff"],
                  ].map(([email, pass, color, label]) => (
                    <button key={email} onClick={() => setLoginForm({ email, password: pass })}
                      style={{ background: color+"15", border:`1px solid ${color}33`, borderRadius: 8, padding: "7px 10px", cursor:"pointer", textAlign:"left", transition:"all .15s" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color }}>{label}</div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{email}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: MUTED }}>
                Don't have an account?{" "}
                <button className="auth-link" onClick={() => { setScreen("register"); setLoginErr(""); }}>Create one</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24 }}>Create account</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, color: MUTED, display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>FULL NAME *</label>
                  <input className="auth-inp" placeholder="Your full name" value={regForm.name}
                    onChange={e => setRegForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: MUTED, display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>EMAIL ADDRESS *</label>
                  <input className="auth-inp" type="email" placeholder="you@company.com" value={regForm.email}
                    onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 13px", background:"#3B82F610", border:"1px solid #3B82F630", borderRadius:8 }}>
                  <span style={{ fontSize:15 }}>👤</span>
                  <span style={{ fontSize:12, color:"#6B7A99" }}>New accounts start as <strong style={{ color:"#E8EDF5" }}>Staff</strong> — an Admin can update your role after sign-up.</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: MUTED, display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>PASSWORD *</label>
                    <input className="auth-inp" type={showPass ? "text" : "password"} placeholder="Min 6 chars" value={regForm.password}
                      onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: MUTED, display: "block", marginBottom: 6, fontWeight: 600, letterSpacing: 1 }}>CONFIRM *</label>
                    <input className="auth-inp" type={showPass ? "text" : "password"} placeholder="Repeat password" value={regForm.confirm}
                      onChange={e => setRegForm(f => ({ ...f, confirm: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <input type="checkbox" id="showpw" checked={showPass} onChange={e => setShowPass(e.target.checked)} style={{ cursor:"pointer" }} />
                  <label htmlFor="showpw" style={{ fontSize:12, color:MUTED, cursor:"pointer" }}>Show password</label>
                </div>
                {regErr     && <div style={{ background:RED+"18",   border:`1px solid ${RED}44`,   borderRadius:8, padding:"10px 14px", fontSize:13, color:RED   }}>⚠ {regErr}</div>}
                {regSuccess && <div style={{ background:GREEN+"18", border:`1px solid ${GREEN}44`, borderRadius:8, padding:"10px 14px", fontSize:13, color:GREEN }}>✓ {regSuccess}</div>}
                <button className="auth-btn" onClick={handleRegister}>Create Account →</button>
              </div>

              <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: MUTED }}>
                Already have an account?{" "}
                <button className="auth-link" onClick={() => { setScreen("login"); setRegErr(""); setRegSuccess(""); }}>Sign in</button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:16, fontSize:11, color:MUTED }}>
          Lazem Finance Portal · Internal Use Only
        </div>
      </div>
    </div>
  );
}

export default function AppCore({ firebaseUser, firebaseLogout, firebaseData, firebaseAllUsers, firebaseSetAuthUsers } = {}) {
  if (firebaseUser && firebaseData) {
    // ── FIREBASE / PRODUCTION MODE ──
    const authUsers = {};
    (firebaseAllUsers || []).forEach(u => { authUsers[u.email] = u; });

    const shared = {
      recurring:       firebaseData.recurring      || [],
      onetime:         firebaseData.onetime        || [],
      entitlements:    firebaseData.entitlements   || [],
      auditLog:        firebaseData.auditLog       || [],
      notifs:          firebaseData.notifications  || [],
      unreadCount:     firebaseData.unreadCount    || 0,
      permissions:     firebaseData.permissions    || {},
      deptConfig:      firebaseData.deptConfig     || [],
      setRecurring:    firebaseData.setRecurring,
      setOnetime:      firebaseData.setOnetime,
      setEntitlements: firebaseData.setEntitlements,
      setAuditLog:     () => {},
      setNotifs:       () => {},
      setUnreadCount:  () => {},
      setPermissions:  firebaseData.setPermissions,
      setDeptConfig:   firebaseData.setDeptConfig,
    };

    const setAuthUsers = (updater) => {
      // Handle role changes from Permissions page
      const prev = {};
      (firebaseAllUsers || []).forEach(u => { prev[u.email] = u; });
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

  // ── STANDALONE MODE (claude.ai artifact) ──
  return (
    <AuthGate>
      {(currentUser, logout, authUsers, setAuthUsers, shared) => (
        <AppInner
          currentUser={currentUser} logout={logout}
          authUsers={authUsers} setAuthUsers={setAuthUsers} shared={shared}
        />
      )}
    </AuthGate>
  );
}


// ═══════════════════════════════════════════════════════════════════
// FIREBASE MODE WRAPPER — uses DataContext instead of in-memory state
// ═══════════════════════════════════════════════════════════════════

function AppInner({ currentUser, logout, authUsers, setAuthUsers, shared }) {
  const [view, setView] = useState("dashboard");
  const [userRole, setUserRole] = useState(currentUser.role);
  const [notification, setNotification] = useState(null);

  // ── Shared persistent state (lives in AuthGate, survives account switches) ──
  const {
    recurring, setRecurring, onetime, setOnetime, entitlements, setEntitlements,
    auditLog, setAuditLog, notifs, setNotifs, unreadCount, setUnreadCount,
    permissions, setPermissions, deptConfig, setDeptConfig,
  } = shared;

  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // ── Audit logger ─────────────────────────────────────────────────
  const logAction = (action, entity, entityId, title, detail = "", amount = null) => {
    const role = ROLE_CONFIG[userRole];
    setAuditLog(prev => [{
      id: uid(),
      userId: role.username,
      userRole,
      action,
      entity,
      entityId,
      title,
      detail,
      amount,
      timestamp: new Date().toISOString(),
    }, ...prev]);
  };

  // ── In-app notification adder ────────────────────────────────────
  const addNotif = (type, title, body) => {
    const n = { id: uid(), type, title, body, timestamp: new Date().toISOString(), read: false };
    setNotifs(prev => [n, ...prev]);
    setUnreadCount(c => c + 1);
  };

  const dismissNotif = (id) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const dismissAllNotifs = () => { setNotifs([]); setUnreadCount(0); };

  const role = ROLE_CONFIG[userRole];
  const activePages = permissions[userRole]?.pages || role.pages;
  const visibleNav = ALL_NAV.filter(n => activePages.includes(n.id));

  const switchRole = (r) => {
    setUserRole(r);
    const newPages = permissions[r]?.pages || ROLE_CONFIG[r].pages;
    if (!newPages.includes(view)) setView("dashboard");
  };

  const overdueCount = recurring.filter(r => r.status !== "paid" && r.status !== "pending_approval" && daysUntil(r.renewalDate) < 0).length
    + onetime.filter(o => o.dueDate && daysUntil(o.dueDate) < 0 && !["approved","pending_pay","paid_onetime","rejected"].includes(o.status)).length;
  const dueThisWeek = recurring.filter(r => { const d = daysUntil(r.renewalDate); return d >= 0 && d <= 7 && r.status !== "paid"; }).length;
  const totalPendingApproval = onetime.filter(o => o.status.startsWith("pending")).length
    + entitlements.filter(e => e.status.startsWith("pending")).length
    + recurring.filter(r => r.status === "pending_approval").length;
  const highPriority = [...recurring, ...onetime].filter(i => i.priority === "high").length;

  const navSections = [
    { key: "main",    label: "MAIN"    },
    { key: "insight", label: "INSIGHTS" },
    { key: "admin",   label: "ADMIN"   },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F1A", color: "#E8EDF5", fontFamily: "'IBM Plex Sans', sans-serif", display: "flex" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#131929}::-webkit-scrollbar-thumb{background:#253047;border-radius:4px}
        input,select,textarea{font-family:inherit}button{cursor:pointer;font-family:inherit}
        .nav-btn:hover{background:#2A365544!important}
        .card-row:hover{background:#2A365544!important;transition:background .15s}
        .btn-primary{background:#3B82F6;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;transition:opacity .2s;cursor:pointer}
        .btn-primary:hover{opacity:.85}
        .btn-green{background:#10B981;color:#fff;border:none;padding:9px 18px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer}
        .btn-ghost{background:transparent;color:#6B7A99;border:1px solid #253047;padding:7px 14px;border-radius:8px;font-size:13px;transition:all .2s;cursor:pointer}
        .btn-ghost:hover{border-color:#3B82F6;color:#3B82F6}
        .inp{background:#2A3655;border:1px solid #253047;color:#E8EDF5;padding:9px 12px;border-radius:8px;width:100%;font-size:13px;outline:none;transition:border .2s}
        .inp:focus{border-color:#3B82F6}
        .overlay{position:fixed;inset:0;background:#00000099;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px}
        .modal{background:#1A2236;border:1px solid #253047;border-radius:16px;width:100%;max-width:580px;max-height:92vh;overflow-y:auto;padding:28px}
        .tab-btn{background:transparent;color:#6B7A99;border:1px solid #253047;padding:5px 12px;border-radius:20px;font-size:12px;transition:all .2s;white-space:nowrap;cursor:pointer}
        .tab-btn.active{background:#3B82F620;border-color:#3B82F666;color:#3B82F6;font-weight:600}
        .import-zone{border:2px dashed #253047;border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:all .2s}
        .import-zone:hover{border-color:#3B82F6;background:#3B82F620}
        .invoice-drop{border:2px dashed #253047;border-radius:8px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;font-size:12px;color:#6B7A99}
        .invoice-drop:hover{border-color:#3B82F6;color:#3B82F6}
        .nav-section-label{font-size:9px;font-weight:700;letter-spacing:2px;color:#6B7A9966;padding:8px 12px 4px;margin-top:4px}
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 230, background: "#131929", borderRight: "1px solid #253047", display: "flex", flexDirection: "column", padding: "16px 10px", gap: 2, flexShrink: 0, overflowY: "auto" }}>
        {/* Logo */}
        <div style={{ padding: "0 8px 14px", borderBottom: "1px solid #253047", marginBottom: 8 }}>
          <svg viewBox="0 0 157.94 163.96" style={{ width: 88, display: "block", marginBottom: 8 }} xmlns="http://www.w3.org/2000/svg">
            <defs><style>{`.cls-1{fill:#43748e}.cls-2{fill:url(#lg1)}.cls-3{fill:#eb0045}.cls-4{fill:#fff}`}</style><linearGradient id="lg1" x1="75.67" y1="16.4" x2="75.67" y2="80.74" gradientUnits="userSpaceOnUse"><stop offset="0" stopColor="#5ec8da"/><stop offset="1" stopColor="#284d5a"/></linearGradient></defs>
            <path className="cls-1" d="M19.15,144.55H11.24v-17.8c0-2.83,3.91-2.48,3.91-2.48v16.85h6.58S22.25,144.55,19.15,144.55Z"/><path className="cls-1" d="M32,142s-2.58,2.83-4.8,2.83a4,4,0,0,1-4.27-4.27c0-3.54,3.39-5.19,8.62-5.19v-.55c0-1.8-.69-2.61-2.67-2.61a10.27,10.27,0,0,0-2.23.29,13,13,0,0,0-2.28.73,2.65,2.65,0,0,1,2.11-3.7h0a16.57,16.57,0,0,1,2.91-.26c4.63,0,6,1.92,6,5.25v6.16c0,1.2,0,2.62.12,3.85C35.49,144.55,32,145.39,32,142Zm-.45-4.11c-3.87,0-4.92,1-4.92,2.25a1.7,1.7,0,0,0,1.8,1.74,3.41,3.41,0,0,0,3.12-3.6Z"/><path className="cls-1" d="M40,129.62H50.47l-7.76,11.44c.63,0,3.47,0,4.58,0h2.62s.41,3.52-2.72,3.52h-11L44,133H36.84C36.84,129.09,40,129.62,40,129.62Z"/><path className="cls-1" d="M61.11,144.56a11.55,11.55,0,0,1-3.07.38c-4.71,0-7.27-2.47-7.27-7.72,0-4.48,2.64-7.9,7.09-7.9s6.19,2.79,6.19,6.33a13.82,13.82,0,0,1-.15,2.17H54.68c0,2.64,1.23,4,4.11,4a11.74,11.74,0,0,0,4.33-.87A2.8,2.8,0,0,1,61.11,144.56Zm-3.46-12.42c-1.59,0-2.73,1.17-2.94,3.13h5.52C60.29,133.22,59.27,132.14,57.65,132.14Z"/><path className="cls-1" d="M69.57,129.62c0,.43-.06,1.7,0,2.67l0,0a5.37,5.37,0,0,1,4.93-3,3.84,3.84,0,0,1,4.12,3,5.32,5.32,0,0,1,4.86-3c2.89,0,4.48,1.59,4.48,5v8s0,2.52-3.84,2.52v-9.66c0-1.6-.37-2.59-1.78-2.59-1.68,0-3.42,2-3.42,4.87v5s.41,2.42-3.79,2.42v-9.7c0-1.47-.3-2.55-1.77-2.55-1.77,0-3.42,2.08-3.42,4.87v4.76s.44,2.62-3.85,2.62V132C66.11,129.38,69.57,129.62,69.57,129.62Z"/><path className="cls-1" d="M128.84,144.55h11.47v-17.8c0-2.83-3.91-2.48-3.91-2.48v16.85H126.26S125.74,144.55,128.84,144.55Z"/><path className="cls-1" d="M130.62,126l3.78,13.57h-3.94l-4.34-15.35S129.92,123.64,130.62,126Z"/><path className="cls-1" d="M117.2,151.21c-3.34.36-3.16-3-3.16-3h2.36c2,0,3.16-.94,3.16-4.1V129.27s3.86-.31,3.86,2.33v12.34c0,3.52-1.16,6.71-6.22,7.27Z"/><path className="cls-1" d="M119.56,124.73v3.89h3.86v-1.56C123.42,124.42,119.56,124.73,119.56,124.73Z"/><path className="cls-1" d="M96.24,151.1l-.47-2.94-1-6.33c-.64-4.15.85-7.05,5.53-7.05H101c.67-3,3.15-5.41,7.34-5.41,4.59,0,6.61,2.63,6.61,6.72v8.46h-6.41c-6.66,0-7.34-3.25-7.72-6.73h-.64c-1.7,0-2.17,1-1.73,3.72l.91,5.61S100.37,150.62,96.24,151.1Zm15-14.54c0-2.92-1.17-4.15-3.13-4.15-2.19,0-3.48,1.67-3.48,4,0,2.75.09,5.15,4.39,5.15h2.22Z"/>
            <path className="cls-2" d="M125.72,16.82a38.45,38.45,0,0,0-50,1.64,38.44,38.44,0,0,0-55.95,52.4c8.13,9.57,22.22,16,41.66,8.87,9.82-3.63,15-4.87,26.33,1.41l1.83,1c1.35.6,3.25,1.4,4.83,2,3,1.12,6.47,2.4,3.34,4.57-1.47,1-4.27,2.81-11.58.22,4.28,1.63,5.34,1.91,5.34,1.91a28.13,28.13,0,0,0,11.2.59c6.93-1.07,17.93-8,25.66-16.48.18-.19.36-.39.53-.59l.92-1a40.88,40.88,0,0,0,4.28-5.78A38.45,38.45,0,0,0,125.72,16.82Z"/>
            <path className="cls-3" d="M75.67,86.14a15.66,15.66,0,0,0-6.37,1.72c-5.59,2.68-10.21,5.83-18.07,8.77-3,1.12-6.47,2.4-3.34,4.58,1.61,1.11,4.33,3.3,13.31-.5C69.32,97.28,75,95.4,82.7,99.33c0,0,2.32,1.15,2.56,3.27.15,1.24-1,2.37-5.69,2.48a11,11,0,0,0-5.13,2.11c-2.21,1.83-4,1.74-6.16,2.1-2.75.46-4.25,1.67-4.19,3.14,0,.95.39,1.85,2.29,2.8a19.22,19.22,0,0,0,6.69,1.44,31.12,31.12,0,0,0,4.09-.25,44.68,44.68,0,0,0,27.52-13.75C110.74,96.08,130,73.06,130,73.06c-7.75,9.23-19.86,17.17-27.29,18.32a28.13,28.13,0,0,1-11.2-.59s-1.41-.37-7.54-2.76C83.93,88,79.25,86.11,75.67,86.14Z"/>
            <path className="cls-4" d="M72,57.65A1.63,1.63,0,1,1,70.37,56,1.63,1.63,0,0,1,72,57.65"/><path className="cls-4" d="M80.84,28.53a1.63,1.63,0,1,1-1.63-1.63,1.63,1.63,0,0,1,1.63,1.63"/><path className="cls-4" d="M71.51,54.06a1.63,1.63,0,1,1-1.63-1.62,1.63,1.63,0,0,1,1.63,1.62"/><path className="cls-4" d="M70.93,50.19,69.7,46.36l0-.12c-.06-.32-.36-1.19-.92-1.25a1.46,1.46,0,0,0-1.41.91l-.18.32c-.17.3-.47.82-.74,1.25L50,48.29V49.9l16,.81c1,0,1.63-1.63,1.63-1.63l.09,1.63A1.58,1.58,0,0,0,69.37,52a1.14,1.14,0,0,0,.26,0A1.58,1.58,0,0,0,70.93,50.19Z"/><path className="cls-4" d="M50.94,49.09a.81.81,0,0,1-1.62,0,.81.81,0,0,1,1.62,0Z"/><path className="cls-4" d="M103.75,44.38a.78.78,0,1,1-.78-.78A.78.78,0,0,1,103.75,44.38Z"/><path className="cls-4" d="M102.92,43.6l-16.66-.82c-.13-.25-.34-.65-.59-1.23-.32-.85-.57-1.21-1-1.19-.58,0-.88,1.34-1.16,1.85l-1.36-8.66a2.7,2.7,0,0,0-5.4,0l-3.84,31L72.65,61a1.58,1.58,0,0,0-1.86-1.26,1.59,1.59,0,0,0-1.25,1.87l.74,3.75A2.7,2.7,0,0,0,73,67.92a2.66,2.66,0,0,0,2.69-2.54L79.54,35l1.22,9.82,0,.26a1.79,1.79,0,0,0,1.79,1.45,2.22,2.22,0,0,0,.72-.12c.44-.16.93-.6,1.28-2.5.29.33.41,2.05,2.18,2.05h.13l16-.79Z"/>
          </svg>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: "#6B7A99" }}>FINANCE PORTAL</div>
        </div>

        {/* Sectioned Nav */}
        {navSections.map(sec => {
          const secItems = visibleNav.filter(n => n.section === sec.key);
          if (secItems.length === 0) return null;
          return (
            <div key={sec.key}>
              <div className="nav-section-label">{sec.label}</div>
              {secItems.map(n => {
                const isActive = view === n.id;
                const badge = n.id === "notifications" && unreadCount > 0 ? unreadCount : null;
                return (
                  <button key={n.id} className="nav-btn" onClick={() => { setView(n.id); if (n.id === "notifications") setUnreadCount(0); }} style={{
                    width: "100%", background: isActive ? "#3B82F620" : "transparent",
                    border: isActive ? "1px solid #3B82F644" : "1px solid transparent",
                    color: isActive ? "#3B82F6" : "#6B7A99",
                    padding: "8px 12px", borderRadius: 8, textAlign: "left", fontSize: 13,
                    fontWeight: isActive ? 600 : 400, display: "flex", alignItems: "center", gap: 10, marginBottom: 1,
                  }}>
                    <span style={{ fontSize: 13 }}>{n.icon}</span>
                    <span style={{ flex: 1 }}>{n.label}</span>
                    {badge && <span style={{ background: "#EF4444", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>{badge}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}

        {/* Quick stats */}
        <div style={{ margin: "8px 0", padding: "10px 8px", background: "#1A2236", borderRadius: 10, border: "1px solid #253047" }}>
          <div style={{ fontSize: 10, color: "#6B7A99", marginBottom: 7, letterSpacing: 1 }}>QUICK STATS</div>
          {[["Subscriptions", recurring.length, "#3B82F6"],["Overdue", overdueCount, "#EF4444"],["Due This Week", dueThisWeek, "#F59E0B"],["Pending", totalPendingApproval, "#F97316"]].map(([l,v,col]) => (
            <div key={l} style={{ display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:11 }}>
              <span style={{ color:"#6B7A99" }}>{l}</span>
              <span style={{ fontWeight:700, color:col, fontFamily:"monospace" }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Logged-in user + Logout */}
        <div style={{ borderTop: "1px solid #253047", paddingTop: 12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:9, padding:"8px 10px", background: role.color+"12", border:`1px solid ${role.color}33`, borderRadius:10, marginBottom:8 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:role.color+"22", border:`2px solid ${role.color}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:role.color, flexShrink:0 }}>
              {currentUser.avatar || currentUser.name[0]}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:11, fontWeight:700, color:role.color, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize:10, color:"#6B7A99", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentUser.email}</div>
            </div>
          </div>
          <button onClick={logout} style={{ width:"100%", padding:"9px 12px", background:"#EF444418", border:"1px solid #EF444433", borderRadius:9, color:"#EF4444", fontSize:12, fontWeight:600, cursor:"pointer", textAlign:"center" }}>
            ⇠ Sign Out
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex:1, overflow:"auto", padding:"28px 32px" }}>
        {notification && (
          <div style={{ position:"fixed", top:20, right:20, zIndex:999, background: notification.type==="success" ? "#10B981" : "#EF4444", color:"#fff", padding:"12px 22px", borderRadius:10, fontWeight:600, fontSize:13, boxShadow:"0 8px 24px #00000055" }}>
            {notification.msg}
          </div>
        )}

        {/* Role banner */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, padding:"10px 18px", background:role.color+"12", border:`1px solid ${role.color}33`, borderRadius:12 }}>
          <div style={{ width:34, height:34, borderRadius:"50%", background:role.color+"22", border:`2px solid ${role.color}55`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:role.color, flexShrink:0 }}>{role.label[0]}</div>
          <div>
            <div style={{ fontSize:13, color:role.color, fontWeight:700 }}>{role.username}</div>
            <div style={{ fontSize:11, color:"#6B7A99" }}>{role.label} — {role.desc}</div>
          </div>
          <div style={{ marginLeft:"auto", display:"flex", gap:5, flexWrap:"wrap" }}>
            {role.canSubmit  && <span style={{ fontSize:10, background:"#10B98122", color:"#10B981", border:"1px solid #10B98133", borderRadius:5, padding:"2px 8px", fontWeight:600 }}>✓ Submit</span>}
            {role.canPay     && <span style={{ fontSize:10, background:"#F59E0B22", color:"#F59E0B", border:"1px solid #F59E0B33", borderRadius:5, padding:"2px 8px", fontWeight:600 }}>✓ Pay</span>}
            {role.canApprove.length>0 && <span style={{ fontSize:10, background:role.color+"22", color:role.color, border:`1px solid ${role.color}33`, borderRadius:5, padding:"2px 8px", fontWeight:600 }}>✓ Approve</span>}
            {role.canViewAll && <span style={{ fontSize:10, background:"#3B82F622", color:"#3B82F6", border:"1px solid #3B82F633", borderRadius:5, padding:"2px 8px", fontWeight:600 }}>✓ All Data</span>}
          </div>
        </div>

        {/* ── Views ── */}
        {view==="dashboard"     && <Dashboard recurring={recurring} onetime={onetime} entitlements={entitlements} overdueCount={overdueCount} highPriority={highPriority} dueThisWeek={dueThisWeek} totalPendingApproval={totalPendingApproval} setView={setView} userRole={userRole} />}
        {view==="forecast"      && <ForecastDashboard recurring={recurring} onetime={onetime} entitlements={entitlements} />}
        {view==="recurring"     && <RecurringView recurring={recurring} setRecurring={setRecurring} showNotif={showNotif} userRole={userRole} username={role.username} logAction={logAction} addNotif={addNotif} />}
        {view==="onetime"       && <OnetimeView onetime={onetime} setOnetime={setOnetime} showNotif={showNotif} userRole={userRole} username={role.username} logAction={logAction} addNotif={addNotif} />}
        {view==="entitlements"  && <EntitlementsView entitlements={entitlements} setEntitlements={setEntitlements} showNotif={showNotif} userRole={userRole} username={role.username} logAction={logAction} addNotif={addNotif} />}
        {view==="approvals"     && <ApprovalsView onetime={onetime} setOnetime={setOnetime} entitlements={entitlements} setEntitlements={setEntitlements} recurring={recurring} setRecurring={setRecurring} userRole={userRole} showNotif={showNotif} logAction={logAction} addNotif={addNotif} deptConfig={deptConfig} currentUser={currentUser} />}
        {view==="analytics"     && <AnalyticsView recurring={recurring} onetime={onetime} entitlements={entitlements} />}
        {view==="reports"       && <ReportsView recurring={recurring} onetime={onetime} entitlements={entitlements} />}
        {view==="audit"         && <AuditLogView logs={auditLog} />}
        {view==="notifications" && <NotificationsView notifs={notifs} onDismiss={dismissNotif} onDismissAll={dismissAllNotifs} />}
        {view==="permissions"   && <PermissionsView showNotif={showNotif} permissions={permissions} setPermissions={setPermissions} authUsers={authUsers} setAuthUsers={setAuthUsers} />}
        {view==="departments"   && <DepartmentsView deptConfig={deptConfig} setDeptConfig={setDeptConfig} showNotif={showNotif} authUsers={authUsers} />}
      </div>
    </div>
  );
}

function Dashboard({ recurring, onetime, overdueCount, highPriority, dueThisWeek, totalPendingApproval, setView }) {
  const deptTotals = useMemo(() => { const m = {}; recurring.forEach(r => { m[r.department] = (m[r.department]||0)+(r.amount||0); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,7); }, [recurring]);
  const catTotals = useMemo(() => { const m = {}; recurring.forEach(r => { m[r.category] = (m[r.category]||0)+(r.amount||0); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); }, [recurring]);
  const urgentItems = recurring.filter(r => { const d = daysUntil(r.renewalDate); return d >= 0 && d <= 14 && r.status !== "paid"; }).sort((a,b) => daysUntil(a.renewalDate)-daysUntil(b.renewalDate)).slice(0,8);
  const overdueItems = recurring.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0).slice(0,6);
  const maxDept = deptTotals[0]?.[1]||1;
  const barColors = [C.accent,C.green,C.orange,C.gold,C.purple,C.red,"#06B6D4"];

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>OVERVIEW</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Finance Dashboard</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{recurring.length} subscriptions tracked across all departments</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 13, marginBottom: 22 }}>
        {[
          { label: "SUBSCRIPTIONS", val: recurring.length, sub: "Total tracked", color: C.accent, click: () => setView("recurring") },
          { label: "DUE THIS WEEK", val: dueThisWeek, sub: "Within 7 days", color: C.gold, click: () => setView("recurring") },
          { label: "OVERDUE", val: overdueCount, sub: "Act immediately", color: C.red, click: () => setView("recurring") },
          { label: "HIGH PRIORITY", val: highPriority, sub: "Across all items", color: C.orange },
          { label: "PENDING APPROVALS", val: totalPendingApproval, sub: "One-time requests", color: C.purple, click: () => setView("approvals") },
        ].map(k => (
          <div key={k.label} onClick={k.click} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.color}`, borderRadius: 12, padding: "16px 18px", cursor: k.click ? "pointer" : "default" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 600, marginBottom: 5 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 12 }}>DUE IN NEXT 14 DAYS</div>
          {urgentItems.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>✓ Nothing due in the next 14 days</div>
            : urgentItems.map(r => { const d = daysUntil(r.renewalDate); return (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div><div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 11, color: C.muted }}>{r.department}</div></div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: C.gold }}>{r.currency} {fmtAmt(r.amount)}</div>
                  <div style={{ fontSize: 10, color: d <= 3 ? C.red : C.gold, fontWeight: 600 }}>{d}d left</div>
                </div>
              </div>
            );})}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.red}33`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: 1, marginBottom: 12 }}>⚠ OVERDUE</div>
          {overdueItems.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>✓ No overdue items</div>
            : overdueItems.map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                <div><div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div><div style={{ fontSize: 11, color: C.muted }}>{r.department} · {fmtDate(r.renewalDate)}</div>{r.notes && <div style={{ fontSize: 10, color: C.gold }}>{r.notes}</div>}</div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: C.red }}>{r.currency} {fmtAmt(r.amount)}</div>
              </div>
            ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>SPEND BY DEPARTMENT</div>
          {deptTotals.map(([dept, amt], i) => (
            <div key={dept} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{dept}</span><span style={{ color: C.muted, fontFamily: "monospace" }}>{fmtAmt(Math.round(amt))}</span>
              </div>
              <div style={{ height: 5, background: C.subtle, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${(amt/maxDept)*100}%`, background: barColors[i%barColors.length], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>SPEND BY CATEGORY</div>
          {catTotals.map(([cat, amt], i) => (
            <div key={cat} style={{ marginBottom: 9 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span>{cat}</span><span style={{ color: C.muted, fontFamily: "monospace" }}>{fmtAmt(Math.round(amt))}</span>
              </div>
              <div style={{ height: 5, background: C.subtle, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${(amt/(catTotals[0]?.[1]||1))*100}%`, background: barColors[i%barColors.length], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-group colors ─────────────────────────────────────────────
const SUBCAT_COLORS = {
  "STC Business Holding": "#06B6D4",
  "STC Business Medical": "#8B5CF6",
  "Mobile Business":      "#F97316",
};


function downloadRecurringTemplate() {
  const headers = ["Name","Category","Details","Department","Purpose","Billing Cycle","Number of Users / Licenses","Total Cost","Payment Method","Renewal Date","Status","Priority","Notes"];
  const sample = [
    ["Microsoft 365","Subscriptions","Business Basic licenses","IT","Email and productivity","Monthly",50,2500,"Credit Card","2026-05-01","upcoming","high","Renewed annually"],
    ["AWS Hosting","Subscriptions","Production servers","IT","Cloud infrastructure","Monthly",1,"","Bank Transfer","2026-04-15","upcoming","high",""],
    ["Iqama Renewal - Ahmed","Iqama","","HR","Employee Iqama","Yearly",1,400,"","2026-09-01","upcoming","medium",""],
    ["Office Rent","Service","HQ Building","Admin","Monthly rent","Monthly",1,15000,"Bank Transfer","2026-04-01","upcoming","high",""],
    ["Electricity","Utility","Main office","Admin","","Monthly",1,800,"","2026-04-05","upcoming","low",""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recurring Payments");
  XLSX.writeFile(wb, "recurring_payments_template.xlsx");
}

function downloadEntitlementsTemplate() {
  const headers = ["Employee Name","Title","Type","Department","Period","Hours","Rate per Hour","Amount","Currency","Priority","Documents","Notes"];
  const sample = [
    ["Ahmed Al-Zahrani","Software Engineer","Overtime","IT","March 2026",20,75,1500,"SAR","medium","","Weekend work"],
    ["Sara Al-Otaibi","Manager","Travel Allowance","Sales","March 2026","","",800,"SAR","low","","Business trip to Jeddah"],
    ["Khalid Al-Rashidi","VP","Medical Reimbursement","HR","","","",2200,"SAR","high","receipt.pdf",""],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Entitlements");
  XLSX.writeFile(wb, "entitlements_template.xlsx");
}

function RecurringView({ recurring, setRecurring, showNotif, userRole, username, logAction, addNotif }) {
  const [showAdd, setShowAdd]       = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab]   = useState("Subscriptions");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch]         = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const fileRef = useRef();
  const [form, setForm] = useState({
    title:"", details:"", purpose:"", category:"Subscriptions", subcategory:"",
    department:"All Company", frequency:"Monthly", licenses:"", amount:"",
    currency:"SAR", renewalDate:"", priority:"medium", paymentMethod:"", notes:""
  });

  // filter by top-level tab + status + search
  const tabItems = useMemo(() => {
    let list = recurring.filter(r => r.category === activeTab);
    if (filterStatus === "overdue") list = list.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0);
    else if (filterStatus === "due14") list = list.filter(r => { const d = daysUntil(r.renewalDate); return d >= 0 && d <= 14 && r.status !== "paid"; });
    else if (filterStatus !== "all") list = list.filter(r => r.status === filterStatus);
    if (search) list = list.filter(r => [r.title, r.details, r.department, r.purpose, r.notes].join(" ").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [recurring, activeTab, filterStatus, search]);

  // group by subcategory; items without subcategory go into ""
  const groups = useMemo(() => {
    const map = {};
    tabItems.forEach(r => {
      const key = r.subcategory || "";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    // sort each group by renewalDate
    Object.values(map).forEach(g => g.sort((a,b) => new Date(a.renewalDate||"9999") - new Date(b.renewalDate||"9999")));
    return map;
  }, [tabItems]);

  const groupKeys = useMemo(() => {
    const keys = Object.keys(groups);
    // "" (no subcat) first, then alphabetical
    return ["", ...keys.filter(k => k !== "").sort()];
  }, [groups]);

  const markPaid     = (id) => { setRecurring(p => p.map(r => r.id===id ? {...r,status:"paid"}    : r)); showNotif("Marked as paid!"); };
  const markUpcoming = (id) => { setRecurring(p => p.map(r => r.id===id ? {...r,status:"upcoming"}: r)); };
  const deleteItem   = (id) => { if (window.confirm("Remove this item?")) { setRecurring(p => p.filter(r => r.id!==id)); showNotif("Removed."); } };
  const toggleGroup  = (key) => setCollapsedGroups(p => ({...p, [key]: !p[key]}));

  const addItem = () => {
    if (!form.title || !form.renewalDate) return showNotif("Name and Renewal Date required", "error");
    setRecurring(p => [...p, { ...form, id:Date.now(), amount:+form.amount||0, licenses:+form.licenses||1, status:"upcoming" }]);
    setShowAdd(false);
    setForm({ title:"", details:"", purpose:"", category:"Subscriptions", subcategory:"", department:"All Company", frequency:"Monthly", licenses:"", amount:"", currency:"SAR", renewalDate:"", priority:"medium", paymentMethod:"", notes:"" });
    showNotif("Added!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError("");
    parseExcelToRecurring(file, rows => setImportRows(rows), err => setImportError("Error: " + err));
    e.target.value = "";
  };

  const confirmImport = () => {
    setRecurring(p => [...p, ...importRows.map(r => ({...r}))]);
    setImportRows([]); setShowImport(false);
    showNotif(`${importRows.length} items imported!`);
  };

  // tab summary counts
  const tabSummary = useMemo(() => {
    const res = {};
    CATEGORIES_RECURRING.forEach(cat => {
      const items = recurring.filter(r => r.category === cat);
      res[cat] = {
        total: items.length,
        overdue: items.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0).length,
      };
    });
    return res;
  }, [recurring]);

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontSize:10, color:C.muted, letterSpacing:2, marginBottom:3 }}>MANAGEMENT</div>
          <div style={{ fontSize:22, fontWeight:700 }}>Recurring Payments</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{tabItems.length} items in <span style={{ color:C.accent }}>{activeTab}</span></div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn-ghost" onClick={() => setShowImport(true)}>⬆ Import Excel</button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>+ Add Item</button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
        {CATEGORIES_RECURRING.map(cat => {
          const s = tabSummary[cat] || {};
          const active = activeTab === cat;
          return (
            <button key={cat} onClick={() => { setActiveTab(cat); setFilterStatus("all"); setSearch(""); }}
              style={{
                background: active ? C.accentGlow : C.card,
                border: `1px solid ${active ? C.accent+"66" : C.border}`,
                color: active ? C.accent : C.muted,
                padding:"8px 16px", borderRadius:10, fontSize:13,
                fontWeight: active ? 700 : 400, cursor:"pointer", display:"flex", alignItems:"center", gap:8, transition:"all .2s"
              }}>
              {cat}
              <span style={{ background: active ? C.accent : C.subtle, color: active ? "#fff" : C.muted, borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{s.total||0}</span>
              {s.overdue > 0 && <span style={{ background:C.red+"22", color:C.red, borderRadius:10, padding:"1px 7px", fontSize:10, fontWeight:700 }}>⚠{s.overdue}</span>}
            </button>
          );
        })}
      </div>

      {/* Search + status filters */}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        <input className="inp" placeholder="Search name, account, details..." value={search} onChange={e=>setSearch(e.target.value)} style={{ width:270 }} />
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {[["all","All"],["overdue","Overdue"],["due14","Due 14d"],["upcoming","Upcoming"],["paid","Paid"]].map(([v,l]) => (
            <button key={v} className={`tab-btn${filterStatus===v?" active":""}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div style={{ background:C.surface, borderRadius:"8px 8px 0 0", border:`1px solid ${C.border}`, padding:"8px 14px", display:"grid", gridTemplateColumns:"2.8fr 0.9fr 1fr 1.1fr 0.9fr 0.7fr 0.8fr", gap:8, fontSize:10, fontWeight:700, color:C.muted, letterSpacing:1 }}>
        <span>NAME / DETAILS</span><span>DEPT</span><span>PURPOSE</span><span>RENEWAL DATE</span><span>AMOUNT</span><span>STATUS</span><span>ACTIONS</span>
      </div>
      <div style={{ border:`1px solid ${C.border}`, borderTop:"none", borderRadius:"0 0 10px 10px", overflow:"hidden", marginBottom:24 }}>
        {tabItems.length === 0 && <div style={{ padding:36, textAlign:"center", color:C.muted }}>No items found in {activeTab}</div>}

        {groupKeys.map(gKey => {
          const items = groups[gKey];
          if (!items?.length) return null;
          const isCollapsed = collapsedGroups[gKey];
          const subColor = SUBCAT_COLORS[gKey] || C.accent;
          const groupTotal = items.filter(r => r.status !== "paid").reduce((s,r)=>(s+(r.amount||0)),0);
          const groupOverdue = items.filter(r => r.status !== "paid" && daysUntil(r.renewalDate) < 0).length;

          return (
            <div key={gKey}>
              {/* Sub-group header (only if has a name) */}
              {gKey && (
                <div onClick={() => toggleGroup(gKey)} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"10px 14px", background:subColor+"15",
                  borderBottom:`1px solid ${subColor}33`, cursor:"pointer",
                  borderLeft:`4px solid ${subColor}`
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:subColor }}>{gKey}</span>
                    <span style={{ fontSize:11, color:C.muted }}>{items.length} lines</span>
                    {groupOverdue > 0 && <Badge label={`${groupOverdue} overdue`} color={C.red} />}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:12, fontWeight:700, fontFamily:"monospace", color:subColor }}>SAR {fmtAmt(Math.round(groupTotal))} / mo</span>
                    <span style={{ color:C.muted, fontSize:14 }}>{isCollapsed ? "▶" : "▼"}</span>
                  </div>
                </div>
              )}

              {/* Rows */}
              {!isCollapsed && items.map((r, idx) => {
                const days     = r.renewalDate ? daysUntil(r.renewalDate) : null;
                const isOvrd   = r.status !== "paid" && days !== null && days < 0;
                const isUrgent = !isOvrd && days !== null && days <= 7 && r.status !== "paid";
                return (
                  <div key={r.id} className="card-row" style={{
                    display:"grid", gridTemplateColumns:"2.8fr 0.9fr 1fr 1.1fr 0.9fr 0.7fr 0.8fr",
                    gap:8, padding:"10px 14px", alignItems:"center",
                    background: isOvrd ? C.red+"08" : idx%2===0 ? C.card : C.card+"99",
                    borderBottom:`1px solid ${C.border}`,
                    borderLeft: isOvrd ? `3px solid ${C.red}` : isUrgent ? `3px solid ${C.gold}` : gKey ? `3px solid ${subColor}44` : "3px solid transparent",
                  }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{r.title}</div>
                      {r.details && <div style={{ fontSize:11, color:C.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:280 }} title={r.details}>{r.details}</div>}
                      {r.notes && <div style={{ fontSize:10, color:C.gold, marginTop:1 }}>⚠ {r.notes}</div>}
                    </div>
                    <div style={{ fontSize:12, color:C.muted }}>{r.department || "—"}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{r.purpose || "—"}</div>
                    <div>
                      {r.renewalDate
                        ? <><div style={{ fontSize:12, fontWeight: isOvrd||isUrgent?700:400, color:isOvrd?C.red:isUrgent?C.gold:C.text }}>{fmtDate(r.renewalDate)}</div>
                            <div style={{ fontSize:10, color:isOvrd?C.red:isUrgent?C.gold:C.muted }}>{isOvrd?`${Math.abs(days)}d overdue`:`${days}d left`} · {r.frequency}</div></>
                        : <div style={{ fontSize:11, color:C.muted }}>— · {r.frequency}</div>
                      }
                    </div>
                    <div>
                      {r.amount > 0
                        ? <><div style={{ fontSize:13, fontWeight:700, fontFamily:"monospace" }}>{r.currency} {fmtAmt(r.amount)}</div>
                            {r.licenses > 0 && <div style={{ fontSize:10, color:C.muted }}>{r.licenses} seat{r.licenses!==1?"s":""}</div>}</>
                        : <div style={{ fontSize:11, color:C.muted }}>TBD</div>
                      }
                    </div>
                    <div>
                      <Badge
                        label={isOvrd ? "Overdue" : statusConfig[r.status]?.label || r.status}
                        color={isOvrd ? C.red : statusConfig[r.status]?.color || C.muted}
                      />
                    </div>
                    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                      {(r.status === "upcoming" || r.status === "overdue") && (
                        <button className="btn-ghost" onClick={()=>{ setRecurring(p=>p.map(x=>x.id===r.id?{...x,status:"pending_approval"}:x)); showNotif("Submitted for approval!"); }} style={{ fontSize:11, padding:"3px 10px", color:C.orange, borderColor:C.orange+"44" }}>→ Submit</button>
                      )}
                      {r.status === "pending_approval" && (
                        <span style={{ fontSize:10, color:C.orange, fontWeight:600 }}>⏳ Pending</span>
                      )}
                      {(r.status === "pending_ceo_1_rec" || r.status === "pending_finance_rec" || r.status === "pending_ceo_2_rec" || r.status === "pending_pay_rec") && (
                        <span style={{ fontSize:10, color:C.accent, fontWeight:600 }}>🔄 In Review</span>
                      )}
                      {r.status === "paid" && (
                        <span style={{ fontSize:10, color:C.green, fontWeight:600 }}>✓ Paid</span>
                      )}
                      <button className="btn-ghost" onClick={()=>deleteItem(r.id)} style={{ fontSize:11, padding:"3px 8px", color:C.red, borderColor:C.red+"33" }}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="overlay" onClick={()=>setShowAdd(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:20 }}>Add Recurring Item</div>
            <div style={{ display:"grid", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NAME *</label><input className="inp" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. STC Business" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CATEGORY</label><select className="inp" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES_RECURRING.map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DETAILS (account #, plan, etc.)</label><input className="inp" value={form.details} onChange={e=>setForm({...form,details:e.target.value})} placeholder="Account number, domain name, plan..." /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DEPARTMENT</label><select className="inp" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PURPOSE</label><input className="inp" value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} placeholder="e.g. Tablet SIM card for project" /></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>SUB-GROUP (optional, e.g. "STC Business Medical")</label><input className="inp" value={form.subcategory} onChange={e=>setForm({...form,subcategory:e.target.value})} placeholder="Groups similar items together" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>AMOUNT</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CURRENCY</label><select className="inp" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["SAR","USD","EUR","KWD","AED"].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>SEATS / LINES</label><input className="inp" type="number" value={form.licenses} onChange={e=>setForm({...form,licenses:e.target.value})} placeholder="1" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>BILLING CYCLE</label><select className="inp" value={form.frequency} onChange={e=>setForm({...form,frequency:e.target.value})}>{["Monthly","Quarterly","Semi-Annual","Yearly"].map(f=><option key={f}>{f}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>RENEWAL DATE *</label><input className="inp" type="date" value={form.renewalDate} onChange={e=>setForm({...form,renewalDate:e.target.value})} /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PRIORITY</label><select className="inp" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT METHOD</label><input className="inp" value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})} placeholder="Credit card, bank transfer..." /></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NOTES</label><textarea className="inp" rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Any additional notes (Arabic supported)" /></div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex:1 }}>Add Item</button>
              <button className="btn-ghost" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="overlay" onClick={()=>{ setShowImport(false); setImportRows([]); setImportError(""); }}>
          <div className="modal" style={{ maxWidth:640 }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ fontSize:17, fontWeight:700 }}>⬆ Import from Excel / CSV</div>
              <button onClick={downloadRecurringTemplate} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#10B98118", border:"1px solid #10B98144", borderRadius:8, color:"#10B981", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇ Download Template
              </button>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:18 }}>
              Expected columns: <span style={{ color:C.accent }}>Name · <strong style={{color:"#10B981"}}>Category</strong> · Details · Department · Purpose · Billing Cycle · Number of Users / Licenses · Total Cost · Payment Method · Renewal Date · Status · Priority · Notes</span>
              <br/><span style={{ color:C.muted, fontSize:11 }}>Category values: Subscriptions · Iqama · Service · Utility · Insurance · Other (defaults to Subscriptions if blank)</span>
            </div>
            <div className="import-zone" onClick={()=>fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleFileChange} />
              <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Click to upload .xlsx, .xls or .csv</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Your existing spreadsheet format is supported</div>
            </div>
            {importError && <div style={{ color:C.red, fontSize:12, marginTop:10, padding:"8px 12px", background:C.red+"11", borderRadius:6 }}>⚠ {importError}</div>}
            {importRows.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, color:C.green, fontWeight:600, marginBottom:10 }}>✓ {importRows.length} rows detected — preview (first 10):</div>
                <div style={{ maxHeight:220, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:8 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:8, padding:"6px 12px", background:"#2A3655", fontSize:10, fontWeight:700, color:"#6B7A99", letterSpacing:1 }}>
                    <span>ITEM</span><span>CATEGORY</span><span>DEPT</span><span>AMOUNT</span><span>RENEWAL</span>
                  </div>
                  {importRows.slice(0,10).map((r,i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:8, padding:"8px 12px", borderBottom:`1px solid #253047`, fontSize:12 }}>
                      <span style={{ fontWeight:600 }}>{r.title}</span>
                      <span style={{ color:"#3B82F6", fontWeight:600 }}>{r.category}</span>
                      <span style={{ color:"#6B7A99" }}>{r.department}</span>
                      <span style={{ color:"#F59E0B", fontFamily:"monospace" }}>{r.currency} {fmtAmt(r.amount)}</span>
                      <span style={{ color:"#6B7A99" }}>{fmtDate(r.renewalDate)}</span>
                    </div>
                  ))}
                  {importRows.length > 10 && <div style={{ padding:"8px 12px", fontSize:11, color:C.muted }}>...and {importRows.length-10} more rows</div>}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:12 }}>
                  <button className="btn-green" onClick={confirmImport} style={{ flex:1 }}>Import All {importRows.length} Items</button>
                  <button className="btn-ghost" onClick={()=>setImportRows([])}>Clear</button>
                </div>
              </div>
            )}
            <button className="btn-ghost" onClick={()=>{ setShowImport(false); setImportRows([]); setImportError(""); }} style={{ marginTop:12, width:"100%", textAlign:"center" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Workflow configs ──────────────────────────────────────────────
const GENERAL_STEPS = [
  { key: "pending_manager", label: "Manager",      color: C.orange  },
  { key: "pending_ceo_1",   label: "CEO Review",   color: "#EC4899" },
  { key: "pending_finance", label: "Finance",      color: C.gold    },
  { key: "pending_ceo_2",   label: "CEO Release",  color: "#EC4899" },
  { key: "pending_pay",     label: "Pay & Docs",   color: C.purple  },
  { key: "paid_onetime",    label: "Paid",         color: C.green   },
];

const ENTITLEMENT_STEPS = [
  { key: "pending_manager", label: "Manager",      color: C.orange  },
  { key: "pending_vp",      label: "VP",           color: "#14B8A6" },
  { key: "pending_hr",      label: "HR",           color: "#A78BFA" },
  { key: "pending_ceo_1",   label: "CEO Review",   color: "#EC4899" },
  { key: "pending_finance", label: "Finance",      color: C.gold    },
  { key: "pending_ceo_2",   label: "CEO Release",  color: "#EC4899" },
  { key: "pending_pay",     label: "Pay & Docs",   color: C.purple  },
  { key: "paid_onetime",    label: "Paid",         color: C.green   },
];

const RECURRING_STEPS = [
  { key: "pending_approval",    label: "Manager",      color: C.orange  },
  { key: "pending_ceo_1_rec",   label: "CEO Review",   color: "#EC4899" },
  { key: "pending_finance_rec", label: "Finance",      color: C.gold    },
  { key: "pending_ceo_2_rec",   label: "CEO Release",  color: "#EC4899" },
  { key: "pending_pay_rec",     label: "Pay & Docs",   color: C.purple  },
  { key: "paid",                label: "Paid",         color: C.green   },
];

// ─── Invoice Attachment Component ────────────────────────────────
function InvoiceUpload({ invoices, onChange }) {
  const fileRef = useRef(null);
  const ACCEPT = ".pdf,.jpg,.jpeg,.png";

  const handleFiles = (files) => {
    const newInvoices = Array.from(files).map(f => ({
      id: Date.now() + Math.random(),
      name: f.name,
      size: f.size,
      type: f.type,
      dataUrl: null,
      uploadedAt: new Date().toISOString(),
    }));
    // Read as dataUrl for in-memory storage
    newInvoices.forEach((inv, i) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const updated = [...(invoices || [])];
        if (i === 0) {
          newInvoices[i].dataUrl = e.target.result;
          onChange([...updated, ...newInvoices.filter((_,j)=>j===i)]);
        } else {
          onChange(prev => prev.map(p => p.id === inv.id ? {...p, dataUrl: e.target.result} : p));
        }
      };
      reader.readAsDataURL(files[i]);
    });
    if (newInvoices.length > 0) onChange([...(invoices||[]), ...newInvoices]);
  };

  const remove = (id) => onChange((invoices||[]).filter(i => i.id !== id));
  const fmtSize = (b) => b > 1024*1024 ? `${(b/1024/1024).toFixed(1)}MB` : `${Math.round(b/1024)}KB`;
  const getIcon = (type) => type?.includes("pdf") ? "📄" : type?.includes("image") ? "🖼" : "📎";

  return (
    <div>
      <label style={{ fontSize:11, color:"#6B7A99", display:"block", marginBottom:5 }}>INVOICE / ATTACHMENTS</label>
      <div className="invoice-drop" onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor="#3B82F6"; }}
        onDragLeave={e => { e.currentTarget.style.borderColor="#253047"; }}
        onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor="#253047"; handleFiles(e.dataTransfer.files); }}>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple style={{ display:"none" }} onChange={e => handleFiles(e.target.files)} />
        <div style={{ fontSize:20, marginBottom:4 }}>📎</div>
        <div style={{ fontSize:12 }}>Drop PDF, JPG or PNG here · or <span style={{ color:"#3B82F6" }}>click to browse</span></div>
      </div>
      {(invoices||[]).length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:8 }}>
          {invoices.map(inv => (
            <div key={inv.id} style={{ display:"flex", alignItems:"center", gap:6, background:"#2A3655", border:"1px solid #3B82F644", borderRadius:8, padding:"5px 10px", fontSize:11 }}>
              <span>{getIcon(inv.type)}</span>
              <span style={{ color:"#E8EDF5", maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{inv.name}</span>
              <span style={{ color:"#6B7A99" }}>{fmtSize(inv.size)}</span>
              <button onClick={() => remove(inv.id)} style={{ background:"none", border:"none", color:"#EF4444", cursor:"pointer", fontSize:14, padding:0, lineHeight:1 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PayInvoiceUpload({ payInvoices, onChange }) {
  return <InvoiceUpload invoices={payInvoices} onChange={onChange} />;
}

function WorkflowTimeline({ status, steps }) {
  const activeIdx  = steps.findIndex(s => s.key === status);
  const lastKey    = steps[steps.length - 1].key;
  const isPaid     = status === lastKey;
  const isRejected = status === "rejected";
  return (
    <div style={{ display:"flex", alignItems:"center", gap:0, marginBottom:10, flexWrap:"wrap", rowGap:6 }}>
      {steps.map((step, i) => {
        const done    = isPaid || (activeIdx > i && activeIdx >= 0);
        const active  = !isRejected && activeIdx === i;
        const col     = done ? C.green : active ? step.color : C.muted+"44";
        const textCol = done ? C.green : active ? step.color : C.muted;
        return (
          <div key={step.key + i} style={{ display:"flex", alignItems:"center" }}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:done||active?col+"22":"transparent", border:`2px solid ${col}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:col, fontWeight:700 }}>
                {done ? "✓" : i+1}
              </div>
              <div style={{ fontSize:9, color:textCol, fontWeight:active?700:400, whiteSpace:"nowrap" }}>{step.label}</div>
            </div>
            {i < steps.length-1 && <div style={{ width:18, height:2, background:done?C.green+"66":C.border, marginBottom:14, flexShrink:0 }} />}
          </div>
        );
      })}
      {isRejected && <Badge label="Rejected" color={C.red} />}
    </div>
  );
}

function OnetimeView({ onetime, setOnetime, showNotif, userRole, username, logAction, addNotif }) {
  const [showAdd, setShowAdd]   = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [payModal, setPayModal] = useState(null);
  const [payRef, setPayRef]     = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [payDoc, setPayDoc]     = useState("");
  const [payInvoices, setPayInvoices] = useState([]);
  const [form, setForm] = useState({ title:"", category:"Equipment", department:"All Company", submittedBy:"", amount:"", currency:"SAR", priority:"medium", dueDate:"", notes:"" });

  const role = ROLE_CONFIG[userRole];

  // Finance & executive see all; others see only their own
  const myRequests = role.canViewAll
    ? onetime
    : onetime.filter(o => o.submittedBy === username);

  const statusTabs = [
    ["all","All"], ["pending_manager","Pending Manager"], ["pending_ceo_1","Pending CEO"],
    ["pending_finance","Pending Finance"], ["pending_ceo_2","CEO Release"],
    ["pending_pay","Pay & Docs"], ["paid_onetime","Paid"], ["rejected","Rejected"],
  ];
  const filtered = filterStatus === "all" ? myRequests : myRequests.filter(o => o.status === filterStatus);

  const addItem = () => {
    if (!form.title || !form.amount) return showNotif("Title and Amount required", "error");
    const submitter = username;
    const newId = Date.now();
    setOnetime(p => [{
      ...form, id: newId, amount:+form.amount,
      submittedBy: submitter,
      requestDate: new Date().toISOString().split("T")[0],
      status:"pending_manager",
      invoices:[],
      managerApproval:null, ceo1Approval:null, financeApproval:null, ceo2Approval:null,
    }, ...p]);
    setShowAdd(false);
    setForm({ title:"", category:"Equipment", department:"All Company", submittedBy:"", amount:"", currency:"SAR", priority:"medium", dueDate:"", notes:"" });
    logAction && logAction("create","one-time",newId,form.title,`${form.category} · ${form.department}`,+form.amount);
    addNotif && addNotif("new_submission",`New Request: ${form.title}`,`Submitted by ${submitter} — awaiting Manager approval`);
    showNotif("Request submitted for Manager approval!");
  };

  const markPaid = (id) => {
    if (!payRef.trim()) return showNotif("Payment reference required", "error");
    const item = onetime.find(o => o.id === id);
    setOnetime(p => p.map(o => o.id===id ? {...o, status:"paid_onetime", paymentInfo:{ ref:payRef, method:payMethod, doc:payDoc, date:new Date().toISOString().split("T")[0] }} : o));
    setPayModal(null); setPayRef(""); setPayMethod("Bank Transfer"); setPayDoc("");
    logAction && logAction("pay","one-time",id,item?.title,`Ref: ${payRef}`,item?.amount);
    showNotif("Payment recorded with full audit trail!");
  };

  // Approval trail display
  const trailSteps = [
    { key:"managerApproval",  label:"Manager"      },
    { key:"ceo1Approval",     label:"CEO (Review)" },
    { key:"financeApproval",  label:"Finance"      },
    { key:"ceo2Approval",     label:"CEO (Release)"},
  ];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, color:C.muted, letterSpacing:2, marginBottom:3 }}>REQUESTS</div>
          <div style={{ fontSize:22, fontWeight:700 }}>One-Time Requests</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>
            {role.canViewAll ? `Showing all ${onetime.length} requests` : `Showing your ${myRequests.length} request${myRequests.length!==1?"s":""} · submitted as ${username}`}
          </div>
        </div>
        {role.canSubmit && <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New Request</button>}
      </div>

      {/* Status filter tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {statusTabs.map(([v,l]) => (
          <button key={v} className={`tab-btn${filterStatus===v?" active":""}`} onClick={() => setFilterStatus(v)}>{l}
            {v!=="all" && myRequests.filter(o=>o.status===v).length > 0 &&
              <span style={{ marginLeft:5, background:C.accent+"44", color:C.accent, borderRadius:8, padding:"0 5px", fontSize:10 }}>
                {myRequests.filter(o=>o.status===v).length}
              </span>}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display:"grid", gap:12 }}>
        {filtered.length === 0 && <div style={{ color:C.muted, textAlign:"center", padding:40 }}>
          {role.canViewAll ? "No requests found" : "You haven't submitted any requests yet"}
        </div>}
        {filtered.map(r => {
          const isOverdue = r.dueDate && daysUntil(r.dueDate)<0 && !["approved","pending_pay","paid_onetime","rejected"].includes(r.status);
          const sc = statusConfig[r.status];
          return (
            <div key={r.id} style={{ background:C.card, border:`1px solid ${isOverdue ? C.red+"55" : sc?.color+"33" || C.border}`, borderRadius:14, padding:"18px 20px", borderLeft:`4px solid ${sc?.color||C.border}` }}>
              {/* Timeline */}
              <WorkflowTimeline status={r.status} steps={GENERAL_STEPS} />

              <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:15, fontWeight:700 }}>{r.title}</span>
                    {isOverdue && <Badge label="Overdue" color={C.red} />}
                    <Badge label={sc?.label||r.status} color={sc?.color||C.muted} />
                    <Badge label={priorityConfig[r.priority]?.label} color={priorityConfig[r.priority]?.color} />
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:8, display:"flex", gap:10, flexWrap:"wrap" }}>
                    <span>{r.department}</span><span>·</span><span>{r.category}</span><span>·</span>
                    <span>By: <strong style={{ color:C.text }}>{r.submittedBy}</strong></span><span>·</span>
                    <span>{fmtDate(r.requestDate)}</span>
                    {r.dueDate && <><span>·</span><span style={{ color:isOverdue?C.red:C.gold, fontWeight:600 }}>Due: {fmtDate(r.dueDate)}</span></>}
                  </div>
                  {r.notes && <div style={{ fontSize:12, color:C.text+"99", background:C.subtle, padding:"7px 12px", borderRadius:8, marginBottom:8 }}>{r.notes}</div>}
                  {r.rejectionReason && <div style={{ fontSize:12, color:C.red, background:C.red+"11", border:`1px solid ${C.red}33`, padding:"7px 12px", borderRadius:8, marginBottom:8 }}>❌ Rejected: {r.rejectionReason}</div>}

                  {/* Approval trail */}
                  <div style={{ display:"flex", gap:16, flexWrap:"wrap", fontSize:11, marginTop:4 }}>
                    {trailSteps.map(s => (
                      <span key={s.key} style={{ color: r[s.key] ? C.green : C.muted }}>
                        {r[s.key] ? `✓ ${s.label}: ${r[s.key].by} (${fmtDate(r[s.key].date)})` : `○ ${s.label}`}
                      </span>
                    ))}
                    {r.paymentInfo && <span style={{ color:C.green }}>✓ Paid {fmtDate(r.paymentInfo.date)} · Ref: {r.paymentInfo.ref}{r.paymentInfo.doc ? ` · Doc: ${r.paymentInfo.doc}` : ""}</span>}
                  </div>
                </div>

                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", marginBottom:10 }}>{r.currency||"SAR"} {fmtAmt(r.amount)}</div>
                  {r.status==="pending_pay" && userRole==="finance" && (
                    <button className="btn-green" onClick={() => setPayModal(r.id)} style={{ fontSize:12, padding:"8px 16px" }}>💳 Upload & Pay</button>
                  )}
                  {r.status==="pending_pay" && userRole!=="finance" && (
                    <div style={{ fontSize:11, color:C.purple, fontWeight:600, maxWidth:140 }}>⏳ Awaiting finance payment & docs</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Submit modal */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>New One-Time Request</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:20 }}>Will go through: Manager → CEO → Finance → CEO Release</div>
            <div style={{ display:"grid", gap:12 }}>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>TITLE *</label><input className="inp" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What is this payment for?" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CATEGORY</label><select className="inp" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES_ONETIME.map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DEPARTMENT</label><select className="inp" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>AMOUNT *</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CURRENCY</label><select className="inp" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["SAR","USD","EUR","KWD","AED"].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PRIORITY</label><select className="inp" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>SUBMITTED BY *</label><input className="inp" value={form.submittedBy} onChange={e=>setForm({...form,submittedBy:e.target.value})} placeholder="Your name" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT DUE DATE</label><input className="inp" type="date" value={form.dueDate} onChange={e=>setForm({...form,dueDate:e.target.value})} /></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NOTES / JUSTIFICATION</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Why is this payment needed?" /></div>
              <InvoiceUpload invoices={form.invoices||[]} onChange={invs=>setForm(f=>({...f,invoices:invs}))} />
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex:1 }}>Submit Request</button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Payment + Document modal */}
      {payModal && (
        <div className="overlay" onClick={() => setPayModal(null)}>
          <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4, color:C.green }}>💳 Record Payment & Upload Documents</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:18 }}>{onetime.find(o=>o.id===payModal)?.title}</div>
            <div style={{ display:"grid", gap:12 }}>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT METHOD</label>
                <select className="inp" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
                  {["Bank Transfer","Cheque","Cash","Online Payment","Credit Card"].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>REFERENCE / TRANSACTION ID *</label>
                <input className="inp" value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="e.g. TRX-2026-00123" />
              </div>
              <div>
                <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DOCUMENT / RECEIPT</label>
                <input className="inp" value={payDoc} onChange={e=>setPayDoc(e.target.value)} placeholder="e.g. Invoice_April2026.pdf" style={{marginBottom:6}} />
                <PayInvoiceUpload payInvoices={payInvoices||[]} onChange={setPayInvoices} />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-green" onClick={() => markPaid(payModal)} style={{ flex:1 }}>Confirm Payment & Save</button>
              <button className="btn-ghost" onClick={() => setPayModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Entitlements View ────────────────────────────────────────────
function parseExcelToEntitlements(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const mapped = rows.map((r, i) => {
        const get = (...keys) => { for (const k of keys) { const found = Object.keys(r).find(rk => rk.toLowerCase().trim() === k.toLowerCase()); if (found && r[found] !== "") return String(r[found]).trim(); } return ""; };
        const rawAmt = get("Amount","Total","Cost","amount");
        const amount = parseFloat(rawAmt.replace(/[^0-9.]/g,"")) || 0;
        return {
          id: Date.now() + i,
          title:           get("Title","Request","title") || "Untitled",
          employeeName:    get("Employee Name","Employee","Name","name"),
          entitlementType: get("Type","Entitlement Type","EntitlementType") || "Overtime",
          department:      get("Department","Dept") || "All Company",
          period:          get("Period","Month","period"),
          amount,
          currency:        get("Currency","currency") || "SAR",
          priority:        get("Priority","priority") || "medium",
          notes:           get("Notes","Details","notes"),
          documents:       get("Documents","Docs","Attachments") || "",
          hoursWorked:     get("Hours","Hours Worked","hoursWorked") || "",
          ratePerHour:     get("Rate","Rate per Hour","ratePerHour") || "",
        };
      }).filter(r => r.employeeName);
      onDone(mapped);
    } catch (err) { onError(err.message); }
  };
  reader.readAsBinaryString(file);
}

function EntitlementsView({ entitlements, setEntitlements, showNotif, userRole, username, logAction, addNotif }) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const fileRef = useRef(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [payModal, setPayModal] = useState(null);
  const [payRef, setPayRef] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [payDoc, setPayDoc] = useState("");
  const [form, setForm] = useState({ title:"", employeeName:"", department:"All Company", amount:"", currency:"SAR", priority:"medium", entitlementType:"Overtime", period:"", hoursWorked:"", ratePerHour:"", documents:"", notes:"" });

  const ENTITLEMENT_TYPES = ["Overtime", "Part-Time Work", "Allowance", "Bonus", "Commission", "Other"];
  const role = ROLE_CONFIG[userRole];

  const myEntitlements = role.canViewAll
    ? entitlements
    : entitlements.filter(e => e.submittedBy === username);

  const statusTabs = [
    ["all","All"],["pending_manager","Manager"],["pending_vp","VP"],["pending_hr","HR"],
    ["pending_ceo_1","CEO Review"],["pending_finance","Finance"],["pending_ceo_2","CEO Release"],
    ["pending_pay","Pay & Docs"],["paid_onetime","Paid"],["rejected","Rejected"],
  ];

  const filtered = filterStatus === "all" ? myEntitlements : myEntitlements.filter(e => e.status === filterStatus);

  const makeRecord = (f, sub) => ({
    ...f, id: Date.now() + Math.random(), amount: +f.amount,
    submittedBy: sub || username,
    requestDate: new Date().toISOString().split("T")[0],
    requestType: "entitlement",
    status: "pending_manager",
    managerApproval:null, vpApproval:null, hrApproval:null,
    ceo1Approval:null, financeApproval:null, ceo2Approval:null,
  });

  const addItem = () => {
    if (!form.title || !form.amount || !form.employeeName) return showNotif("Title, Employee and Amount required", "error");
    const newRec = makeRecord(form);
    setEntitlements(p => [newRec, ...p]);
    setShowAdd(false);
    setForm({ title:"", employeeName:"", department:"All Company", amount:"", currency:"SAR", priority:"medium", entitlementType:"Overtime", period:"", hoursWorked:"", ratePerHour:"", documents:"", notes:"" });
    logAction && logAction("create","entitlement",newRec.id,form.title,`${form.entitlementType} · ${form.employeeName}`,+form.amount);
    addNotif && addNotif("new_submission",`Entitlement: ${form.title}`,`By ${form.employeeName} — awaiting Manager approval`);
    showNotif("Entitlement submitted for Manager approval!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setImportError(""); setImportRows([]);
    parseExcelToEntitlements(file, setImportRows, setImportError);
    e.target.value = "";
  };
  const confirmImport = () => {
    const records = importRows.map(r => makeRecord(r));
    setEntitlements(p => [...records, ...p]);
    setShowImport(false); setImportRows([]);
    showNotif(`${records.length} entitlements imported!`);
  };

  const markPaid = (id) => {
    if (!payRef.trim()) return showNotif("Payment reference required", "error");
    const item = entitlements.find(e => e.id === id);
    setEntitlements(p => p.map(e => e.id===id ? {...e, status:"paid_onetime", paymentInfo:{ ref:payRef, method:payMethod, doc:payDoc, date:new Date().toISOString().split("T")[0] }} : e));
    setPayModal(null); setPayRef(""); setPayMethod("Bank Transfer"); setPayDoc("");
    logAction && logAction("pay","entitlement",id,item?.title,`Ref: ${payRef}`,item?.amount);
    showNotif("Entitlement payment recorded!");
  };

  const trailSteps = [
    { key:"managerApproval", label:"Manager" }, { key:"vpApproval", label:"VP" },
    { key:"hrApproval", label:"HR" }, { key:"ceo1Approval", label:"CEO" },
    { key:"financeApproval", label:"Finance" }, { key:"ceo2Approval", label:"CEO Release" },
  ];

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, color:C.muted, letterSpacing:2, marginBottom:3 }}>EMPLOYEE</div>
          <div style={{ fontSize:22, fontWeight:700 }}>Entitlements</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>
            {role.canViewAll ? `Showing all ${entitlements.length} requests` : `Showing your ${myEntitlements.length} request${myEntitlements.length!==1?"s":""} · submitted as ${username}`}
          </div>
        </div>
        {role.canSubmit && (
          <div style={{ display:"flex", gap:8 }}>
            <button className="btn-ghost" onClick={() => setShowImport(true)} style={{ fontSize:13 }}>⬆ Import Excel</button>
            <button className="btn-primary" onClick={() => setShowAdd(true)}>+ New Entitlement</button>
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        {statusTabs.map(([v,l]) => (
          <button key={v} className={`tab-btn${filterStatus===v?" active":""}`} onClick={() => setFilterStatus(v)}>{l}
            {v!=="all" && myEntitlements.filter(e=>e.status===v).length > 0 &&
              <span style={{ marginLeft:5, background:"#14B8A644", color:"#14B8A6", borderRadius:8, padding:"0 5px", fontSize:10 }}>
                {myEntitlements.filter(e=>e.status===v).length}
              </span>}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gap:12 }}>
        {filtered.length === 0 && <div style={{ color:C.muted, textAlign:"center", padding:40 }}>
          {role.canViewAll ? "No entitlement requests found" : "You haven't submitted any entitlements yet"}
        </div>}
        {filtered.map(e => {
          const sc = statusConfig[e.status];
          return (
            <div key={e.id} style={{ background:C.card, border:`1px solid ${sc?.color+"33"||C.border}`, borderRadius:14, padding:"18px 20px", borderLeft:`4px solid ${sc?.color||C.border}` }}>
              <WorkflowTimeline status={e.status} steps={ENTITLEMENT_STEPS} />
              <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                    <span style={{ fontSize:15, fontWeight:700 }}>{e.title}</span>
                    <Badge label={e.entitlementType} color="#14B8A6" />
                    <Badge label={sc?.label||e.status} color={sc?.color||C.muted} />
                    <Badge label={priorityConfig[e.priority]?.label} color={priorityConfig[e.priority]?.color} />
                  </div>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:8, display:"flex", gap:10, flexWrap:"wrap" }}>
                    <span>👤 <strong style={{ color:C.text }}>{e.employeeName}</strong></span><span>·</span>
                    <span>{e.department}</span><span>·</span>
                    <span>By: {e.submittedBy}</span><span>·</span>
                    <span>{fmtDate(e.requestDate)}</span>
                    {e.period && <><span>·</span><span style={{ color:C.gold }}>Period: {e.period}</span></>}
                    {e.hoursWorked && <><span>·</span><span style={{ color:C.accent }}>⏱ {e.hoursWorked} hrs</span></>}
                  </div>
                  {e.notes && <div style={{ fontSize:12, color:C.text+"99", background:C.subtle, padding:"7px 12px", borderRadius:8, marginBottom:8 }}>{e.notes}</div>}
                  {e.documents && <div style={{ fontSize:11, color:C.accent, marginBottom:6 }}>📎 {e.documents}</div>}
                  {e.rejectionReason && <div style={{ fontSize:12, color:C.red, background:C.red+"11", border:`1px solid ${C.red}33`, padding:"7px 12px", borderRadius:8, marginBottom:8 }}>❌ Rejected: {e.rejectionReason}</div>}
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:11 }}>
                    {trailSteps.map(s => (
                      <span key={s.key} style={{ color:e[s.key]?C.green:C.muted }}>
                        {e[s.key] ? `✓ ${s.label}: ${e[s.key].by}` : `○ ${s.label}`}
                      </span>
                    ))}
                    {e.paymentInfo && <span style={{ color:C.green }}>✓ Paid {fmtDate(e.paymentInfo.date)} · {e.paymentInfo.ref}</span>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", marginBottom:10 }}>{e.currency||"SAR"} {fmtAmt(e.amount)}</div>
                  {e.ratePerHour && <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Rate: {e.currency} {e.ratePerHour}/hr</div>}
                  {e.status==="pending_pay" && userRole==="finance" && (
                    <button className="btn-green" onClick={() => setPayModal(e.id)} style={{ fontSize:12, padding:"8px 14px" }}>💳 Pay & Upload</button>
                  )}
                  {e.status==="pending_pay" && userRole!=="finance" && (
                    <div style={{ fontSize:11, color:C.purple, fontWeight:600 }}>⏳ Awaiting finance</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>New Entitlement Request</div>
            <div style={{ fontSize:12, color:"#14B8A6", marginBottom:18 }}>Flow: Manager → VP → HR → CEO → Finance → CEO Release</div>
            <div style={{ display:"grid", gap:12 }}>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>TITLE *</label><input className="inp" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Overtime – March 2026" /></div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>EMPLOYEE NAME *</label><input className="inp" value={form.employeeName} onChange={e=>setForm({...form,employeeName:e.target.value})} placeholder="Full name" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>ENTITLEMENT TYPE</label><select className="inp" value={form.entitlementType} onChange={e=>setForm({...form,entitlementType:e.target.value})}>{ENTITLEMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DEPARTMENT</label><select className="inp" value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PERIOD</label><input className="inp" value={form.period} onChange={e=>setForm({...form,period:e.target.value})} placeholder="e.g. 01–31 March 2026" /></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>HOURS WORKED</label><input className="inp" type="number" value={form.hoursWorked} onChange={e=>setForm({...form,hoursWorked:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>RATE PER HOUR</label><input className="inp" type="number" value={form.ratePerHour} onChange={e=>setForm({...form,ratePerHour:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>CURRENCY</label><select className="inp" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})}>{["SAR","USD","EUR"].map(c=><option key={c}>{c}</option>)}</select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>TOTAL AMOUNT *</label><input className="inp" type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0" /></div>
                <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PRIORITY</label><select className="inp" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
              </div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DOCUMENTS / ATTACHMENTS</label><input className="inp" value={form.documents} onChange={e=>setForm({...form,documents:e.target.value})} placeholder="e.g. Timesheet_March2026.pdf, Approval_Form.pdf" /></div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>NOTES / JUSTIFICATION</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Hours breakdown, project details, justification..." /></div>
              <InvoiceUpload invoices={form.invoices||[]} onChange={invs=>setForm(f=>({...f,invoices:invs}))} />
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex:1 }}>Submit Entitlement</button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="overlay" onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); }}>
          <div className="modal" style={{ maxWidth:660 }} onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <div style={{ fontSize:17, fontWeight:700 }}>⬆ Import Entitlements from Excel</div>
              <button onClick={downloadEntitlementsTemplate} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", background:"#10B98118", border:"1px solid #10B98144", borderRadius:8, color:"#10B981", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                ⬇ Download Template
              </button>
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>Expected columns:</div>
            <div style={{ fontSize:11, color:C.accent, background:C.subtle, padding:"8px 12px", borderRadius:8, marginBottom:16, lineHeight:1.8 }}>
              <strong>Employee Name</strong> · <strong>Title</strong> · <strong>Type</strong> · <strong>Department</strong> · <strong>Period</strong> · <strong>Hours</strong> · <strong>Rate per Hour</strong> · <strong>Amount</strong> · <strong>Currency</strong> · <strong>Priority</strong> · <strong>Documents</strong> · <strong>Notes</strong>
            </div>
            <div className="import-zone" onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleFileChange} />
              <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
              <div style={{ fontSize:14, fontWeight:600, color:C.text }}>Click to upload .xlsx, .xls or .csv</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>All rows will be submitted as pending_manager</div>
            </div>
            {importError && <div style={{ color:C.red, fontSize:12, marginTop:10, padding:"8px 12px", background:C.red+"11", borderRadius:6 }}>⚠ {importError}</div>}
            {importRows.length > 0 && (
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:13, color:C.green, fontWeight:600, marginBottom:10 }}>✓ {importRows.length} rows detected — preview (first 8):</div>
                <div style={{ maxHeight:240, overflowY:"auto", border:`1px solid ${C.border}`, borderRadius:8 }}>
                  {importRows.slice(0,8).map((r,i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr", gap:8, padding:"8px 12px", borderBottom:`1px solid ${C.border}`, fontSize:11 }}>
                      <span style={{ fontWeight:600 }}>{r.employeeName}</span>
                      <span style={{ color:"#14B8A6" }}>{r.entitlementType}</span>
                      <span style={{ color:C.muted }}>{r.period||"—"}</span>
                      <span style={{ color:r.hoursWorked?C.accent:C.muted }}>{r.hoursWorked ? `${r.hoursWorked}h` : "—"}</span>
                      <span style={{ color:C.gold, fontFamily:"monospace" }}>{r.currency} {fmtAmt(r.amount)}</span>
                    </div>
                  ))}
                  {importRows.length > 8 && <div style={{ padding:"8px 12px", fontSize:11, color:C.muted }}>...and {importRows.length-8} more</div>}
                </div>
                <div style={{ display:"flex", gap:10, marginTop:12 }}>
                  <button className="btn-green" onClick={confirmImport} style={{ flex:1 }}>Import All {importRows.length} Entitlements</button>
                  <button className="btn-ghost" onClick={() => setImportRows([])}>Clear</button>
                </div>
              </div>
            )}
            <button className="btn-ghost" onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); }} style={{ marginTop:12, width:"100%", textAlign:"center" }}>Close</button>
          </div>
        </div>
      )}

      {payModal && (
        <div className="overlay" onClick={() => setPayModal(null)}>
          <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4, color:C.green }}>💳 Record Entitlement Payment</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:18 }}>{entitlements.find(e=>e.id===payModal)?.title} — {entitlements.find(e=>e.id===payModal)?.employeeName}</div>
            <div style={{ display:"grid", gap:12 }}>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT METHOD</label><select className="inp" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>{["Bank Transfer","Cheque","Cash","Online Payment"].map(m=><option key={m}>{m}</option>)}</select></div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>REFERENCE *</label><input className="inp" value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="e.g. TRX-2026-00456" /></div>
              <div><label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DOCUMENT / RECEIPT</label><input className="inp" value={payDoc} onChange={e=>setPayDoc(e.target.value)} placeholder="e.g. Payslip_March2026.pdf" /></div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-green" onClick={() => markPaid(payModal)} style={{ flex:1 }}>Confirm & Save</button>
              <button className="btn-ghost" onClick={() => setPayModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ r, steps, canApprove, onApprove, btnLabel, next, onReject, onOpenReject, isPay, onPay }) {
  const [expanded, setExpanded] = useState(false);
  const trailKeys = r.requestType === "entitlement"
    ? [["managerApproval","Manager"],["vpApproval","VP"],["hrApproval","HR"],["ceo1Approval","CEO"],["financeApproval","Finance"],["ceo2Approval","CEO Release"]]
    : [["managerApproval","Manager"],["ceo1Approval","CEO Review"],["financeApproval","Finance"],["ceo2Approval","CEO Release"]];
  return (
    <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, marginBottom:10, overflow:"hidden" }}>
      <div style={{ padding:"16px 20px" }}>
        <WorkflowTimeline status={r.status} steps={steps} />
        <div style={{ display:"flex", justifyContent:"space-between", gap:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
              <span style={{ fontSize:14, fontWeight:700 }}>{r.title}</span>
              {r.entitlementType && <Badge label={r.entitlementType} color="#14B8A6" />}
              {r.employeeName && <span style={{ fontSize:12, color:C.text }}>👤 <strong>{r.employeeName}</strong></span>}
              <Badge label={priorityConfig[r.priority]?.label} color={priorityConfig[r.priority]?.color} />
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:4, display:"flex", gap:10, flexWrap:"wrap" }}>
              <span>{r.department}{r.category ? ` · ${r.category}` : ""}</span>
              <span>·</span><span>By: <strong style={{ color:C.text }}>{r.submittedBy || "System"}</strong></span>
              <span>·</span><span>{fmtDate(r.requestDate)}</span>
              {r.period && <><span>·</span><span style={{ color:C.gold }}>Period: {r.period}</span></>}
              {r.frequency && <><span>·</span><span style={{ color:C.accent }}>{r.frequency}</span></>}
            </div>
            {r.notes && <div style={{ fontSize:12, color:C.text+"88", background:C.subtle, padding:"6px 10px", borderRadius:6, marginBottom:6 }}>{r.notes}</div>}
            {r.documents && <div style={{ fontSize:11, color:C.accent, marginBottom:4 }}>📎 {r.documents}</div>}
            <button onClick={() => setExpanded(x => !x)} style={{ marginTop:6, background:"none", border:`1px solid ${C.border}`, color:C.muted, fontSize:11, padding:"3px 10px", borderRadius:6, cursor:"pointer" }}>
              {expanded ? "▲ Less details" : "▼ Full details"}
            </button>
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:18, fontWeight:700, fontFamily:"monospace", marginBottom:8 }}>{r.currency||"SAR"} {fmtAmt(r.amount)}</div>
            {r.hoursWorked && <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>⏱ {r.hoursWorked}h{r.ratePerHour ? ` @ ${r.currency} ${r.ratePerHour}/h` : ""}</div>}
            {canApprove ? (
              <div style={{ display:"flex", gap:6, flexDirection:"column" }}>
                {isPay ? (
                  <button className="btn-green" onClick={() => onPay(r.id)} style={{ fontSize:12, padding:"7px 14px", whiteSpace:"nowrap" }}>{btnLabel}</button>
                ) : (
                  <button className="btn-primary" onClick={() => onApprove(r.id)} style={{ fontSize:12, padding:"7px 14px", whiteSpace:"nowrap" }}>{btnLabel}</button>
                )}
                <div style={{ fontSize:10, color:C.muted, textAlign:"center" }}>{next}</div>
                {!isPay && <button onClick={() => onOpenReject(r.id, onReject)} style={{ background:C.red+"22", color:C.red, border:`1px solid ${C.red}44`, padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>✗ Reject</button>}
              </div>
            ) : <div style={{ fontSize:11, color:C.muted, fontStyle:"italic" }}>View only</div>}
          </div>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop:`1px solid ${C.border}`, background:C.subtle, padding:"16px 20px", display:"grid", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:12 }}>
            {[
              ["Request Date",  fmtDate(r.requestDate)],
              ["Department",    r.department],
              ["Category",      r.category || r.entitlementType || "—"],
              ["Period",        r.period || "—"],
              ["Priority",      r.priority],
              ["Amount",        `${r.currency||"SAR"} ${fmtAmt(r.amount)}`],
              r.hoursWorked   && ["Hours Worked",    r.hoursWorked + " hrs"],
              r.ratePerHour   && ["Rate / Hour",     `${r.currency||"SAR"} ${r.ratePerHour}`],
              r.frequency     && ["Billing Cycle",   r.frequency],
              r.licenses      && ["Seats",           r.licenses],
              r.paymentMethod && ["Payment Method",  r.paymentMethod],
              r.dueDate       && ["Due Date",        fmtDate(r.dueDate)],
              r.renewalDate   && ["Renewal Date",    fmtDate(r.renewalDate)],
            ].filter(Boolean).map(([label, val]) => (
              <div key={label} style={{ background:C.card, padding:"10px 12px", borderRadius:8, border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:10, color:C.muted, marginBottom:3 }}>{label.toUpperCase()}</div>
                <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{val}</div>
              </div>
            ))}
          </div>
          {r.notes && (
            <div>
              <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:6 }}>NOTES / JUSTIFICATION</div>
              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", fontSize:13, color:C.text, lineHeight:1.6 }}>{r.notes}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:6 }}>ATTACHED DOCUMENTS</div>
            {r.documents ? (
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                {r.documents.split(",").map(d=>d.trim()).filter(Boolean).map((doc,i) => (
                  <div key={i} style={{ background:C.card, border:`1px solid ${C.accent}44`, borderRadius:8, padding:"7px 12px", fontSize:12, color:C.accent }}>📎 {doc}</div>
                ))}
              </div>
            ) : <div style={{ fontSize:12, color:C.muted, fontStyle:"italic" }}>No documents attached</div>}
          </div>
          <div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:1, marginBottom:8 }}>APPROVAL TRAIL</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {trailKeys.map(([key, label]) => (
                <div key={key} style={{ background:r[key]?C.green+"15":C.card, border:`1px solid ${r[key]?C.green+"44":C.border}`, borderRadius:8, padding:"8px 12px", fontSize:11, minWidth:100 }}>
                  <div style={{ color:r[key]?C.green:C.muted, fontWeight:700, marginBottom:2 }}>{r[key]?"✓":"○"} {label}</div>
                  {r[key] ? <><div style={{ color:C.text }}>{r[key].by}</div><div style={{ color:C.muted }}>{fmtDate(r[key].date)}</div></> : <div style={{ color:C.muted, fontStyle:"italic" }}>Pending</div>}
                </div>
              ))}
            </div>
          </div>
          {r.paymentInfo && (
            <div style={{ background:C.green+"10", border:`1px solid ${C.green}33`, borderRadius:8, padding:"10px 14px" }}>
              <div style={{ fontSize:10, color:C.green, letterSpacing:1, marginBottom:6, fontWeight:700 }}>PAYMENT RECORDED</div>
              <div style={{ display:"flex", gap:16, fontSize:12, flexWrap:"wrap" }}>
                <span>💳 {r.paymentInfo.method}</span>
                <span>Ref: <strong>{r.paymentInfo.ref}</strong></span>
                <span>Date: {fmtDate(r.paymentInfo.date)}</span>
                {r.paymentInfo.doc && <span>📎 {r.paymentInfo.doc}</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalsView({ onetime, setOnetime, entitlements, setEntitlements, recurring, setRecurring, userRole, showNotif, logAction, addNotif, deptConfig, currentUser }) {
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeQueue, setActiveQueue] = useState("general");
  const [payModal, setPayModal] = useState(null);   // { id, type }
  const [payInvoices, setPayInvoices] = useState([]); type: "onetime"|"entitlement"|"recurring"
  const [payRef, setPayRef] = useState("");
  const [payMethod, setPayMethod] = useState("Bank Transfer");
  const [payDoc, setPayDoc] = useState("");

  const today = () => new Date().toISOString().split("T")[0];
  const role = ROLE_CONFIG[userRole];

  // Each role only sees the queue stages they can action
  // Finance & executive see all stages (read-only for exec)
  const canSeeAll = role.canViewAll;

  const filterForRole = (items, statusKey) => {
    if (canSeeAll) return items.filter(o => o.status === statusKey);
    return items.filter(o => o.status === statusKey && role.canApprove.includes(statusKey));
  };

  // Department-aware manager check:
  // A manager only sees requests from departments where they are assigned as manager
  const myManagedDepts = (deptConfig || [])
    .filter(d => d.manager === currentUser?.id || d.manager === currentUser?.email)
    .map(d => d.id);
  // If no dept config set yet, fall back to role-based (any manager sees all)
  const isDeptManager = userRole === "manager" || userRole === "admin";
  const canManager = isDeptManager && (
    myManagedDepts.length === 0
      ? true  // no dept assignments yet — show all (fallback)
      : true  // filtering happens at item level below
  );

  // Filter items at manager level to only show ones from my managed departments
  const filterManagerItems = (items) => {
    if (!isDeptManager) return [];
    if (myManagedDepts.length === 0) return items; // no dept config → show all
    return items.filter(item => myManagedDepts.includes(item.department) || item.department === "All Company");
  };

  const canVP       = userRole === "vp";
  const canHR       = userRole === "hr";
  const canCEO      = userRole === "ceo";
  const canFinance  = userRole === "finance";
  const isExec      = userRole === "executive";

  // ── General one-time approvals ──────────────────────────────────
  const gen = {
    pending_manager: filterManagerItems(onetime.filter(o=>o.status==="pending_manager")),
    pending_ceo_1:   onetime.filter(o=>o.status==="pending_ceo_1"),
    pending_finance: onetime.filter(o=>o.status==="pending_finance"),
    pending_ceo_2:   onetime.filter(o=>o.status==="pending_ceo_2"),
    pending_pay:     onetime.filter(o=>o.status==="pending_pay"),
  };
  const markPayGen = (id) => {
    if (!payRef.trim()) return showNotif("Payment reference required", "error");
    setOnetime(p=>p.map(o=>o.id===id?{...o,status:"paid_onetime",paymentInfo:{ref:payRef,method:payMethod,doc:payDoc,date:today()}}:o));
    setPayModal(null); setPayRef(""); setPayMethod("Bank Transfer"); setPayDoc("");
    const paidItem = onetime.find(o=>o.id===id); logAction && logAction("pay","one-time",id,paidItem?.title,`Ref: ${payRef}`,paidItem?.amount);
    showNotif("Payment recorded — marked Paid!");
  };
  const approveGenManager  = id => { const t=onetime.find(o=>o.id===id)?.title; setOnetime(p=>p.map(o=>o.id===id?{...o,status:"pending_ceo_1",managerApproval:{by:"Manager",date:today()}}:o)); logAction&&logAction("approve","one-time",id,t,"Manager → CEO"); addNotif&&addNotif("approval_required","CEO Approval Needed",`"${t}" needs your CEO review`); showNotif("Manager approved → CEO!"); };
  const approveGenCEO1     = id => { setOnetime(p=>p.map(o=>o.id===id?{...o,status:"pending_finance",ceo1Approval:{by:"CEO",date:today()}}:o)); showNotif("CEO approved → Finance!"); };
  const approveGenFinance  = id => { setOnetime(p=>p.map(o=>o.id===id?{...o,status:"pending_ceo_2",financeApproval:{by:"Finance",date:today()}}:o)); showNotif("Finance approved → CEO Release!"); };
  const approveGenCEO2     = id => { const t=onetime.find(o=>o.id===id)?.title; setOnetime(p=>p.map(o=>o.id===id?{...o,status:"pending_pay",ceo2Approval:{by:"CEO",date:today()}}:o)); logAction&&logAction("approve","one-time",id,t,"CEO Release → Pay & Docs"); addNotif&&addNotif("payment_due","Payment Ready",`"${t}" released by CEO — ready for payment`); showNotif("CEO released → Pay & Docs!"); };
  const rejectGen          = id => { const t=onetime.find(o=>o.id===id)?.title; setOnetime(p=>p.map(o=>o.id===id?{...o,status:"rejected",rejectionReason:rejectReason}:o)); setRejectModal(null); setRejectReason(""); logAction&&logAction("reject","one-time",id,t,`Reason: ${rejectReason}`); addNotif&&addNotif("rejected","Request Rejected",`"${t}" was rejected`); showNotif("Rejected."); };

  // ── Entitlement approvals ───────────────────────────────────────
  const ent = {
    pending_manager: filterManagerItems(entitlements.filter(e=>e.status==="pending_manager")),
    pending_vp:      entitlements.filter(e=>e.status==="pending_vp"),
    pending_hr:      entitlements.filter(e=>e.status==="pending_hr"),
    pending_ceo_1:   entitlements.filter(e=>e.status==="pending_ceo_1"),
    pending_finance: entitlements.filter(e=>e.status==="pending_finance"),
    pending_ceo_2:   entitlements.filter(e=>e.status==="pending_ceo_2"),
    pending_pay:     entitlements.filter(e=>e.status==="pending_pay"),
  };
  const markPayEnt = (id) => {
    if (!payRef.trim()) return showNotif("Payment reference required", "error");
    setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"paid_onetime",paymentInfo:{ref:payRef,method:payMethod,doc:payDoc,date:today()}}:e));
    setPayModal(null); setPayRef(""); setPayMethod("Bank Transfer"); setPayDoc("");
    const paidEnt = entitlements.find(e=>e.id===id); logAction && logAction("pay","entitlement",id,paidEnt?.title,`Ref: ${payRef}`,paidEnt?.amount);
    showNotif("Entitlement payment recorded — Paid!");
  };
  const approveEntManager  = id => { setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"pending_vp",managerApproval:{by:"Manager",date:today()}}:e)); showNotif("Manager approved → VP!"); };
  const approveEntVP       = id => { setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"pending_hr",vpApproval:{by:"VP",date:today()}}:e)); showNotif("VP approved → HR!"); };
  const approveEntHR       = id => { setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"pending_ceo_1",hrApproval:{by:"HR",date:today()}}:e)); showNotif("HR approved → CEO!"); };
  const approveEntCEO1     = id => { setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"pending_finance",ceo1Approval:{by:"CEO",date:today()}}:e)); showNotif("CEO approved → Finance!"); };
  const approveEntFinance  = id => { setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"pending_ceo_2",financeApproval:{by:"Finance",date:today()}}:e)); showNotif("Finance approved → CEO Release!"); };
  const approveEntCEO2     = id => { setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"pending_pay",ceo2Approval:{by:"CEO",date:today()}}:e)); showNotif("CEO released → Pay & Docs!"); };
  const rejectEnt          = id => { const t=entitlements.find(e=>e.id===id)?.title; setEntitlements(p=>p.map(e=>e.id===id?{...e,status:"rejected",rejectionReason:rejectReason}:e)); setRejectModal(null); setRejectReason(""); logAction&&logAction("reject","entitlement",id,t,`Reason: ${rejectReason}`); addNotif&&addNotif("rejected","Entitlement Rejected",`"${t}" was rejected`); showNotif("Rejected."); };

  // ── Recurring approvals ─────────────────────────────────────────
  const rec = {
    pending_manager: recurring.filter(r=>r.status==="pending_approval"),
  };
  const approveRecManager  = id => { setRecurring(p=>p.map(r=>r.id===id?{...r,status:"pending_ceo_1_rec",managerApproval:{by:"Manager",date:today()}}:r)); showNotif("Manager approved → CEO!"); };
  // use separate keys for recurring to avoid confusion
  const recFull = {
    pending_approval:    filterManagerItems(recurring.filter(r=>r.status==="pending_approval")),
    pending_ceo_1_rec:   recurring.filter(r=>r.status==="pending_ceo_1_rec"),
    pending_finance_rec: recurring.filter(r=>r.status==="pending_finance_rec"),
    pending_ceo_2_rec:   recurring.filter(r=>r.status==="pending_ceo_2_rec"),
    pending_pay_rec:     recurring.filter(r=>r.status==="pending_pay_rec"),
  };
  const markPayRec = (id) => {
    if (!payRef.trim()) return showNotif("Payment reference required", "error");
    setRecurring(p=>p.map(r=>r.id===id?{...r,status:"paid",paymentInfo:{ref:payRef,method:payMethod,doc:payDoc,date:today()}}:r));
    setPayModal(null); setPayRef(""); setPayMethod("Bank Transfer"); setPayDoc("");
    const paidRec = recurring.find(r=>r.id===id); logAction && logAction("pay","recurring",id,paidRec?.title,`Ref: ${payRef}`,paidRec?.amount);
    showNotif("Recurring payment recorded — Paid!");
  };
  const approveRecM  = id => { setRecurring(p=>p.map(r=>r.id===id?{...r,status:"pending_ceo_1_rec",  managerApproval:{by:"Manager",date:today()}}:r)); showNotif("Manager approved → CEO!"); };
  const approveRecC1 = id => { setRecurring(p=>p.map(r=>r.id===id?{...r,status:"pending_finance_rec",ceo1Approval:{by:"CEO",date:today()}}:r)); showNotif("CEO approved → Finance!"); };
  const approveRecF  = id => { setRecurring(p=>p.map(r=>r.id===id?{...r,status:"pending_ceo_2_rec",  financeApproval:{by:"Finance",date:today()}}:r)); showNotif("Finance approved → CEO Release!"); };
  const approveRecC2 = id => { setRecurring(p=>p.map(r=>r.id===id?{...r,status:"pending_pay_rec",ceo2Approval:{by:"CEO",date:today()}}:r)); showNotif("CEO released → Pay & Docs!"); };
  const rejectRec    = id => { const t=recurring.find(r=>r.id===id)?.title; setRecurring(p=>p.map(r=>r.id===id?{...r,status:"upcoming",rejectionReason:rejectReason}:r)); setRejectModal(null); setRejectReason(""); logAction&&logAction("reject","recurring",id,t,"Rejected — returned to upcoming"); showNotif("Recurring item returned."); };

  const roleHint = {
    staff:"Submit only — no approval access.", manager:"Level 1 approvals (all queues).",
    vp:"VP level for Entitlements.", hr:"HR level for Entitlements.",
    ceo:"CEO Review & Release (all queues).", finance:"Finance level + payment recording.",
    executive:"Read-only."
  };

  // ApprovalCard is defined as a top-level component above ApprovalsView

  // ── Queue definitions — each role sees only their relevant levels ─
  // Staff have no approval levels — they come here to see status of submitted items
  const allGeneralLevels = [
    { statusKey:"pending_manager", label:"LEVEL 1 — MANAGER",     color:C.orange,  items:gen.pending_manager, canApprove:canManager, onApprove:approveGenManager, btnLabel:"✓ Approve",       next:"→ CEO",         onReject:rejectGen },
    { statusKey:"pending_ceo_1",   label:"LEVEL 2 — CEO REVIEW",  color:"#EC4899", items:gen.pending_ceo_1,   canApprove:canCEO,     onApprove:approveGenCEO1,    btnLabel:"✓ Approve",       next:"→ Finance",     onReject:rejectGen },
    { statusKey:"pending_finance", label:"LEVEL 3 — FINANCE",     color:C.gold,    items:gen.pending_finance, canApprove:canFinance, onApprove:approveGenFinance, btnLabel:"✓ Approve",       next:"→ CEO Release", onReject:rejectGen },
    { statusKey:"pending_ceo_2",   label:"LEVEL 4 — CEO RELEASE", color:"#EC4899", items:gen.pending_ceo_2,   canApprove:canCEO,     onApprove:approveGenCEO2,    btnLabel:"✓ Release",       next:"→ Pay & Docs",  onReject:rejectGen },
    { statusKey:"pending_pay",     label:"LEVEL 5 — PAY & DOCS",  color:C.purple,  items:gen.pending_pay,     canApprove:canFinance, onApprove:null,              btnLabel:"💳 Pay & Upload", next:"→ Paid",        onReject:null, isPay:true, onPay:(id)=>setPayModal({id,type:"onetime"}) },
  ];
  const allEntitlementLevels = [
    { statusKey:"pending_manager", label:"LEVEL 1 — MANAGER",     color:C.orange,  items:ent.pending_manager, canApprove:canManager, onApprove:approveEntManager, btnLabel:"✓ Approve",       next:"→ VP",          onReject:rejectEnt },
    { statusKey:"pending_vp",      label:"LEVEL 2 — VP",          color:"#14B8A6", items:ent.pending_vp,      canApprove:canVP,      onApprove:approveEntVP,      btnLabel:"✓ Approve",       next:"→ HR",          onReject:rejectEnt },
    { statusKey:"pending_hr",      label:"LEVEL 3 — HR",          color:"#A78BFA", items:ent.pending_hr,      canApprove:canHR,      onApprove:approveEntHR,      btnLabel:"✓ Approve",       next:"→ CEO",         onReject:rejectEnt },
    { statusKey:"pending_ceo_1",   label:"LEVEL 4 — CEO REVIEW",  color:"#EC4899", items:ent.pending_ceo_1,   canApprove:canCEO,     onApprove:approveEntCEO1,    btnLabel:"✓ Approve",       next:"→ Finance",     onReject:rejectEnt },
    { statusKey:"pending_finance", label:"LEVEL 5 — FINANCE",     color:C.gold,    items:ent.pending_finance, canApprove:canFinance, onApprove:approveEntFinance, btnLabel:"✓ Approve",       next:"→ CEO Release", onReject:rejectEnt },
    { statusKey:"pending_ceo_2",   label:"LEVEL 6 — CEO RELEASE", color:"#EC4899", items:ent.pending_ceo_2,   canApprove:canCEO,     onApprove:approveEntCEO2,    btnLabel:"✓ Release",       next:"→ Pay & Docs",  onReject:rejectEnt },
    { statusKey:"pending_pay",     label:"LEVEL 7 — PAY & DOCS",  color:C.purple,  items:ent.pending_pay,     canApprove:canFinance, onApprove:null,              btnLabel:"💳 Pay & Upload", next:"→ Paid",        onReject:null, isPay:true, onPay:(id)=>setPayModal({id,type:"entitlement"}) },
  ];
  const allRecurringLevels = [
    { statusKey:"pending_approval",    label:"LEVEL 1 — MANAGER",     color:C.orange,  items:recFull.pending_approval,    canApprove:canManager, onApprove:approveRecM,  btnLabel:"✓ Approve",       next:"→ CEO",         onReject:rejectRec },
    { statusKey:"pending_ceo_1_rec",   label:"LEVEL 2 — CEO REVIEW",  color:"#EC4899", items:recFull.pending_ceo_1_rec,   canApprove:canCEO,     onApprove:approveRecC1, btnLabel:"✓ Approve",       next:"→ Finance",     onReject:rejectRec },
    { statusKey:"pending_finance_rec", label:"LEVEL 3 — FINANCE",     color:C.gold,    items:recFull.pending_finance_rec, canApprove:canFinance, onApprove:approveRecF,  btnLabel:"✓ Approve",       next:"→ CEO Release", onReject:rejectRec },
    { statusKey:"pending_ceo_2_rec",   label:"LEVEL 4 — CEO RELEASE", color:"#EC4899", items:recFull.pending_ceo_2_rec,   canApprove:canCEO,     onApprove:approveRecC2, btnLabel:"✓ Release",       next:"→ Pay & Docs",  onReject:rejectRec },
    { statusKey:"pending_pay_rec",     label:"LEVEL 5 — PAY & DOCS",  color:C.purple,  items:recFull.pending_pay_rec,     canApprove:canFinance, onApprove:null,         btnLabel:"💳 Pay & Upload", next:"→ Paid",        onReject:null, isPay:true, onPay:(id)=>setPayModal({id,type:"recurring"}) },
  ];

  // Filter: if canViewAll (finance/exec) show all levels; otherwise show only levels this role can action
  const filterLevels = (levels) => {
    if (canSeeAll) return levels;
    return levels.filter(l => role.canApprove.includes(l.statusKey));
  };

  const generalLevels     = filterLevels(allGeneralLevels);
  const entitlementLevels = filterLevels(allEntitlementLevels);
  const recurringLevels   = filterLevels(allRecurringLevels);

  // Count only items visible to this role
  const myGenTotal  = generalLevels.reduce((s,l) => s + l.items.length, 0);
  const myEntTotal  = entitlementLevels.reduce((s,l) => s + l.items.length, 0);
  const myRecTotal  = recurringLevels.reduce((s,l) => s + l.items.length, 0);

  const queueConfig = {
    general:      { levels: generalLevels,      steps: GENERAL_STEPS,      label:"General Payments",      color:C.orange,  desc:"Manager → CEO → Finance → CEO Release",               total: myGenTotal  },
    entitlements: { levels: entitlementLevels,  steps: ENTITLEMENT_STEPS,  label:"Employee Entitlements", color:"#14B8A6", desc:"Manager → VP → HR → CEO → Finance → CEO Release",     total: myEntTotal  },
    recurring:    { levels: recurringLevels,    steps: RECURRING_STEPS,    label:"Recurring Payments",    color:C.accent,  desc:"Manager → CEO → Finance → CEO Release → Paid",        total: myRecTotal  },
  };

  const activeQ = queueConfig[activeQueue];

  // Staff: show a "no approvals for your role" message
  const hasNoApprovals = !canSeeAll && role.canApprove.length === 0;

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:10, color:C.muted, letterSpacing:2, marginBottom:3 }}>WORKFLOW</div>
        <div style={{ fontSize:22, fontWeight:700 }}>Approvals</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>
          {canSeeAll ? "Full view — all pending items across all queues" :
           hasNoApprovals ? "You can track the status of your submitted requests here" :
           `Showing only items in your approval queue`}
        </div>
      </div>

      {hasNoApprovals ? (
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>No approvals in your role</div>
          <div style={{ fontSize:13, color:C.muted }}>Your role can submit requests. Use One-Time or Entitlements to submit, and track their status here once approved by your manager.</div>
        </div>
      ) : (<>

      {/* Queue type tabs */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        {Object.entries(queueConfig).map(([key, q]) => (
          <button key={key} onClick={() => setActiveQueue(key)} style={{
            background: activeQueue===key ? q.color+"22" : C.card,
            border: `2px solid ${activeQueue===key ? q.color : C.border}`,
            color: activeQueue===key ? q.color : C.muted,
            padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:700,
            cursor:"pointer", transition:"all .2s", textAlign:"left", minWidth:190
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
              <span>{q.label}</span>
              {q.total > 0 && <span style={{ background:q.color, color:"#fff", borderRadius:10, padding:"2px 8px", fontSize:11 }}>{q.total}</span>}
            </div>
            <div style={{ fontSize:10, color:activeQueue===key?q.color:C.muted, fontWeight:400 }}>{q.desc}</div>
          </button>
        ))}
      </div>

      {/* Approval flow diagram */}
      <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 20px", marginBottom:24 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:12 }}>
          {activeQ.label.toUpperCase()} — APPROVAL FLOW
        </div>
        <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", rowGap:10 }}>
          {[{ step:"1", label:"Submit", sub:"Any staff", color:C.accent }, ...activeQ.steps.map((s,i)=>({step:String(i+2), label:s.label, sub:s.label, color:s.color}))].map((s,i,arr) => (
            <div key={i} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ textAlign:"center", padding:"0 4px" }}>
                <div style={{ width:30,height:30,borderRadius:"50%",background:s.color+"22",border:`2px solid ${s.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:s.color,margin:"0 auto 4px" }}>{s.step}</div>
                <div style={{ fontSize:10, fontWeight:600, color:C.text, whiteSpace:"nowrap" }}>{s.label}</div>
              </div>
              {i < arr.length-1 && <div style={{ color:C.muted, fontSize:16, padding:"0 2px", marginBottom:14 }}>→</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Levels */}
      {activeQ.levels.map(({ label, color, items, canApprove, onApprove, btnLabel, next, onReject, isPay, onPay }) => (
        <div key={label} style={{ marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color }}>{label}</div>
            <Badge label={String(items.length)} color={color} />
            {items.length === 0 && <span style={{ fontSize:12, color:C.green }}>✓ Clear</span>}
          </div>
          {items.length === 0
            ? <div style={{ color:C.muted, fontSize:13, paddingLeft:4 }}>No items at this stage</div>
            : items.map(r => <ApprovalCard key={r.id} r={r} steps={activeQ.steps} canApprove={canApprove} onApprove={onApprove} btnLabel={btnLabel} next={next} onReject={onReject} onOpenReject={(id, fn) => setRejectModal({id, fn})} isPay={isPay} onPay={onPay} />)
          }
        </div>
      ))}

      {rejectModal && (
        <div className="overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" style={{ maxWidth:420 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4, color:C.red }}>✗ Reject Request</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>This reason will be visible to the submitter and logged in the audit trail.</div>
            <textarea className="inp" rows={4} value={rejectReason} onChange={e=>setRejectReason(e.target.value)} placeholder="Reason for rejection..." />
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={() => { rejectModal.fn(rejectModal.id); }} style={{ flex:1, background:C.red, color:"#fff", border:"none", padding:10, borderRadius:8, fontWeight:700, cursor:"pointer" }}>Confirm Rejection</button>
              <button className="btn-ghost" onClick={() => setRejectModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="overlay" onClick={() => setPayModal(null)}>
          <div className="modal" style={{ maxWidth:460 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:17, fontWeight:700, marginBottom:4, color:C.green }}>💳 Record Payment & Upload Docs</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:18 }}>
              {payModal.type === "recurring"
                ? recurring.find(r=>r.id===payModal.id)?.title
                : payModal.type === "entitlement"
                  ? entitlements.find(e=>e.id===payModal.id)?.title
                  : onetime.find(o=>o.id===payModal.id)?.title}
            </div>
            <div style={{ display:"grid", gap:12 }}>
              <div>
                <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>PAYMENT METHOD</label>
                <select className="inp" value={payMethod} onChange={e=>setPayMethod(e.target.value)}>
                  {["Bank Transfer","Cheque","Cash","Online Payment"].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>REFERENCE NUMBER *</label>
                <input className="inp" value={payRef} onChange={e=>setPayRef(e.target.value)} placeholder="e.g. TRX-2026-00456" />
              </div>
              <div>
                <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:5 }}>DOCUMENT / RECEIPT</label>
                <input className="inp" value={payDoc} onChange={e=>setPayDoc(e.target.value)} placeholder="e.g. Receipt_March2026.pdf" style={{marginBottom:6}} />
                <PayInvoiceUpload payInvoices={payInvoices||[]} onChange={setPayInvoices} />
              </div>
            </div>
            <div style={{ display:"flex", gap:10, marginTop:18 }}>
              <button className="btn-green" style={{ flex:1 }} onClick={() => {
                if (payModal.type === "recurring") markPayRec(payModal.id);
                else if (payModal.type === "entitlement") markPayEnt(payModal.id);
                else markPayGen(payModal.id);
              }}>Confirm & Mark Paid</button>
              <button className="btn-ghost" onClick={() => setPayModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}


function ForecastDashboard({ recurring, onetime, entitlements }) {
  const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };
  const toSAR = (amt, cur) => (amt || 0) * (SAR_RATES[cur] || 1);

  // Monthly cost: yearly items ÷ 12, monthly items as-is
  const monthlyCommitment = useMemo(() => {
    return recurring
      .filter(r => !["paid","rejected"].includes(r.status))
      .reduce((sum, r) => {
        const sarAmt = toSAR(r.amount, r.currency);
        return sum + (r.frequency === "Yearly" ? sarAmt / 12 : sarAmt);
      }, 0);
  }, [recurring]);

  const yearlyCommitment = useMemo(() => {
    return recurring
      .filter(r => !["paid","rejected"].includes(r.status))
      .reduce((sum, r) => {
        const sarAmt = toSAR(r.amount, r.currency);
        return sum + (r.frequency === "Yearly" ? sarAmt : sarAmt * 12);
      }, 0);
  }, [recurring]);

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86400000);
  const upcoming30 = recurring.filter(r => {
    if (!r.renewalDate || ["paid"].includes(r.status)) return false;
    const d = new Date(r.renewalDate);
    return d >= now && d <= in30;
  }).sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate));

  const upcoming30Total = upcoming30.reduce((s, r) => s + toSAR(r.amount, r.currency), 0);

  // 12-month projection
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), month: d.getMonth(), year: d.getFullYear() };
  });

  const monthlyProjection = months.map(m => {
    let total = 0;
    recurring.filter(r => !["paid","rejected"].includes(r.status)).forEach(r => {
      const sarAmt = toSAR(r.amount, r.currency);
      if (r.frequency === "Monthly") {
        total += sarAmt;
      } else if (r.frequency === "Yearly" && r.renewalDate) {
        const rd = new Date(r.renewalDate);
        if (rd.getMonth() === m.month && rd.getFullYear() === m.year) total += sarAmt;
      }
    });
    return { ...m, total };
  });
  const maxMonth = Math.max(...monthlyProjection.map(m => m.total), 1);

  // By-department monthly
  const deptMonthly = useMemo(() => {
    const m = {};
    recurring.filter(r => !["paid","rejected"].includes(r.status)).forEach(r => {
      const sarAmt = toSAR(r.amount, r.currency);
      const monthly = r.frequency === "Yearly" ? sarAmt / 12 : sarAmt;
      m[r.department] = (m[r.department] || 0) + monthly;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [recurring]);

  const barColors = [C.accent, C.green, C.orange, C.gold, C.purple, C.red, "#06B6D4", "#14B8A6"];

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>FINANCIAL FORECAST</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Commitment Overview</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Based on {recurring.filter(r => r.status !== "paid").length} active recurring items · All amounts in SAR equivalent</div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "MONTHLY COMMITMENT", val: `SAR ${fmtAmt(Math.round(monthlyCommitment))}`, sub: "Average monthly spend", color: C.accent },
          { label: "YEARLY COMMITMENT",  val: `SAR ${fmtAmt(Math.round(yearlyCommitment))}`,  sub: "Annualised total",     color: C.gold   },
          { label: "DUE IN 30 DAYS",     val: `SAR ${fmtAmt(Math.round(upcoming30Total))}`,   sub: `${upcoming30.length} payments`,  color: C.orange },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.color}`, borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color, fontFamily: "monospace" }}>{k.val}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* 12-month bar chart */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>12-MONTH PAYMENT PROJECTION</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
            {monthlyProjection.map((m, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 9, color: C.muted, textAlign: "center", marginBottom: 2 }}>
                  {m.total > 0 ? fmtAmt(Math.round(m.total / 1000)) + "k" : ""}
                </div>
                <div style={{ width: "100%", background: i === 0 ? C.accent : C.subtle, borderRadius: "3px 3px 0 0", height: `${Math.max(4, (m.total / maxMonth) * 110)}px`, transition: "height .3s" }} />
                <div style={{ fontSize: 8, color: C.muted, whiteSpace: "nowrap" }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Dept monthly breakdown */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>MONTHLY BY DEPARTMENT</div>
          {deptMonthly.map(([dept, amt], i) => (
            <div key={dept} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                <span style={{ color: C.text }}>{dept}</span>
                <span style={{ color: barColors[i % barColors.length], fontFamily: "monospace", fontWeight: 600 }}>SAR {fmtAmt(Math.round(amt))}</span>
              </div>
              <div style={{ height: 4, background: C.subtle, borderRadius: 3 }}>
                <div style={{ height: "100%", width: `${(amt / (deptMonthly[0]?.[1] || 1)) * 100}%`, background: barColors[i % barColors.length], borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming 30 days table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>UPCOMING PAYMENTS — NEXT 30 DAYS ({upcoming30.length})</div>
        {upcoming30.length === 0
          ? <div style={{ color: C.muted, fontSize: 13 }}>✓ No payments due in the next 30 days</div>
          : (
            <div style={{ display: "grid", gap: 1 }}>
              {[["Item", "Department", "Frequency", "Renewal Date", "Amount"]].map(h => (
                <div key="h" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "6px 10px", fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>
                  {h.map(c => <div key={c}>{c}</div>)}
                </div>
              ))}
              {upcoming30.map(r => {
                const d = daysUntil(r.renewalDate);
                return (
                  <div key={r.id} className="card-row" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "9px 10px", borderRadius: 8, background: C.subtle }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}<span style={{ fontSize: 10, color: C.muted }}> · {r.details}</span></div>
                    <div style={{ fontSize: 11, color: C.muted }}>{r.department}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{r.frequency}</div>
                    <div style={{ fontSize: 11, color: d <= 7 ? C.red : d <= 14 ? C.orange : C.gold, fontWeight: 600 }}>{fmtDate(r.renewalDate)} ({d}d)</div>
                    <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: C.text }}>{r.currency} {fmtAmt(r.amount)}</div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── 2. AUDIT LOG VIEW ───────────────────────────────────────────────
function AuditLogView({ logs }) {
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [search, setSearch] = useState("");

  const actionColors = { create: C.green, edit: C.accent, delete: C.red, approve: C.gold, reject: C.red, pay: C.purple, submit: C.orange };
  const actionLabels = { create: "Created", edit: "Edited", delete: "Deleted", approve: "Approved", reject: "Rejected", pay: "Paid", submit: "Submitted" };
  const entities = ["all", "one-time", "entitlement", "recurring"];
  const actions = ["all", "create", "edit", "delete", "approve", "reject", "pay", "submit"];

  const filtered = logs.filter(l => {
    if (filterAction !== "all" && l.action !== filterAction) return false;
    if (filterEntity !== "all" && l.entity !== filterEntity) return false;
    if (search && !l.title?.toLowerCase().includes(search.toLowerCase()) && !l.userId?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>COMPLIANCE</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Activity & Audit Log</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{logs.length} events recorded · Immutable trail</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input className="inp" style={{ maxWidth: 240 }} placeholder="🔍 Search by user or item…" value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {actions.map(a => <button key={a} className={`tab-btn${filterAction===a?" active":""}`} onClick={() => setFilterAction(a)}>{a === "all" ? "All Actions" : actionLabels[a] || a}</button>)}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {entities.map(e => <button key={e} className={`tab-btn${filterEntity===e?" active":""}`} onClick={() => setFilterEntity(e)}>{e === "all" ? "All Types" : e}</button>)}
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 90px 1.5fr 80px", padding: "10px 16px", background: C.subtle, fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>
          {["TIMESTAMP", "ACTION", "TYPE", "USER", "ITEM / DETAILS", "AMOUNT"].map(h => <div key={h}>{h}</div>)}
        </div>
        {filtered.length === 0 && <div style={{ padding: 32, textAlign: "center", color: C.muted }}>No audit events found</div>}
        {filtered.map((l, i) => (
          <div key={l.id} className="card-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 90px 1.5fr 80px", padding: "11px 16px", borderTop: i > 0 ? `1px solid ${C.border}` : "none", alignItems: "start" }}>
            <div style={{ fontSize: 11, color: C.muted }}>{new Date(l.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: actionColors[l.action] || C.muted, background: (actionColors[l.action] || C.muted) + "18", padding: "2px 8px", borderRadius: 5 }}>{actionLabels[l.action] || l.action}</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "capitalize" }}>{l.entity}</div>
            <div style={{ fontSize: 11, color: C.text, fontWeight: 600 }}>{l.userId}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{l.title || l.entityId}</div>
              {l.detail && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{l.detail}</div>}
              {l.oldValue && l.newValue && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}><span style={{ color: C.red }}>{l.oldValue}</span> → <span style={{ color: C.green }}>{l.newValue}</span></div>}
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: l.amount ? C.gold : C.muted }}>{l.amount ? `SAR ${fmtAmt(l.amount)}` : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 3. NOTIFICATIONS VIEW ───────────────────────────────────────────
function NotificationsView({ notifs, onDismiss, onDismissAll }) {
  const typeConfig = {
    approval_required: { icon: "⚡", color: C.orange, label: "Approval Required" },
    payment_due:       { icon: "💰", color: C.gold,   label: "Payment Due"       },
    renewal_reminder:  { icon: "🔔", color: C.accent, label: "Renewal Reminder"  },
    new_submission:    { icon: "📥", color: C.green,  label: "New Submission"    },
    rejected:          { icon: "✗",  color: C.red,    label: "Rejected"          },
    paid:              { icon: "✓",  color: C.green,  label: "Paid"              },
  };

  const unread = notifs.filter(n => !n.read).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>INBOX</div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Notifications</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>{unread} unread · {notifs.length} total</div>
        </div>
        {notifs.length > 0 && <button className="btn-ghost" onClick={onDismissAll}>Dismiss All</button>}
      </div>

      {notifs.length === 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
          <div style={{ color: C.muted, fontSize: 14 }}>No notifications yet</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {notifs.map(n => {
          const tc = typeConfig[n.type] || { icon: "•", color: C.muted, label: n.type };
          return (
            <div key={n.id} style={{ background: n.read ? C.card : C.subtle, border: `1px solid ${n.read ? C.border : tc.color + "44"}`, borderLeft: `3px solid ${tc.color}`, borderRadius: 12, padding: "14px 18px", display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{tc.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{n.title}</span>
                  <span style={{ fontSize: 10, color: tc.color, background: tc.color + "18", padding: "1px 7px", borderRadius: 5, fontWeight: 700 }}>{tc.label}</span>
                  {!n.read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: tc.color, display: "inline-block" }} />}
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>{n.body}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>{new Date(n.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <button onClick={() => onDismiss(n.id)} style={{ background: "none", border: "none", color: C.muted, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>×</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 4. ANALYTICS DASHBOARD ─────────────────────────────────────────
function AnalyticsView({ recurring, onetime, entitlements }) {
  const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };
  const toSAR = (amt, cur) => (amt || 0) * (SAR_RATES[cur] || 1);

  const allItems = [
    ...recurring.map(r => ({ ...r, type: "recurring" })),
    ...onetime.filter(o => ["paid_onetime"].includes(o.status)).map(o => ({ ...o, type: "onetime" })),
    ...entitlements.filter(e => ["paid_onetime"].includes(e.status)).map(e => ({ ...e, type: "entitlement" })),
  ];

  const barColors = [C.accent, C.green, C.orange, C.gold, C.purple, C.red, "#06B6D4", "#14B8A6", "#F59E0B", "#EC4899"];

  const groupBy = (arr, key) => {
    const m = {};
    arr.forEach(item => {
      const k = item[key] || "Unknown";
      m[k] = (m[k] || 0) + toSAR(item.amount, item.currency);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };

  const byDept   = groupBy(allItems, "department");
  const byCat    = groupBy(allItems.filter(i => i.type === "recurring"), "category");
  const byVendor = groupBy(allItems, "title");
  const maxDept  = byDept[0]?.[1] || 1;
  const maxCat   = byCat[0]?.[1] || 1;
  const maxVend  = byVendor[0]?.[1] || 1;

  const totalAll = allItems.reduce((s, i) => s + toSAR(i.amount, i.currency), 0);

  const BarChart = ({ data, max, title, valueLabel = "SAR" }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>{title}</div>
      {data.slice(0, 10).map(([label, amt], i) => (
        <div key={label} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
            <span style={{ color: C.text, maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ color: barColors[i % barColors.length], fontFamily: "monospace", fontWeight: 700 }}>SAR {fmtAmt(Math.round(amt))}</span>
          </div>
          <div style={{ height: 6, background: C.subtle, borderRadius: 3 }}>
            <div style={{ height: "100%", width: `${(amt / max) * 100}%`, background: barColors[i % barColors.length], borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{((amt / totalAll) * 100).toFixed(1)}% of total</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>ANALYTICS</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Cost Analytics</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>All amounts in SAR equivalent · Includes recurring + paid one-time + paid entitlements</div>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
        {[
          { l: "TOTAL TRACKED", v: `SAR ${fmtAmt(Math.round(totalAll))}`, c: C.accent },
          { l: "DEPARTMENTS",   v: byDept.length,                          c: C.teal || "#14B8A6" },
          { l: "CATEGORIES",    v: byCat.length,                           c: C.gold  },
          { l: "VENDORS",       v: byVendor.length,                        c: C.purple},
        ].map(k => (
          <div key={k.l} style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${k.c}`, borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1, fontWeight: 600, marginBottom: 4 }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.c, fontFamily: "monospace" }}>{k.v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <BarChart data={byDept} max={maxDept} title="SPEND BY DEPARTMENT" />
        <BarChart data={byCat}  max={maxCat}  title="SPEND BY CATEGORY (RECURRING)" />
      </div>
      <BarChart data={byVendor} max={maxVend} title="SPEND BY VENDOR / ITEM (TOP 10)" />
    </div>
  );
}

// ─── 5. REPORTS EXPORT ───────────────────────────────────────────────
function ReportsView({ recurring, onetime, entitlements }) {
  const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };
  const toSAR = (a, c) => (a || 0) * (SAR_RATES[c] || 1);
  const [reportType, setReportType] = useState("monthly");
  const [format, setFormat] = useState("excel");

  const buildMonthlyData = () => {
    const rows = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const total = recurring
        .filter(r => r.frequency === "Monthly" && !["paid","rejected"].includes(r.status))
        .reduce((s, r) => s + toSAR(r.amount, r.currency), 0);
      rows.push({ Month: label, "Recurring (SAR)": Math.round(total), "One-Time (SAR)": 0, "Entitlements (SAR)": 0 });
    }
    return rows;
  };

  const buildDeptData = () => {
    const m = {};
    [...recurring, ...onetime, ...entitlements].forEach(i => {
      const dept = i.department || "Unknown";
      m[dept] = (m[dept] || 0) + toSAR(i.amount, i.currency);
    });
    return Object.entries(m).sort((a,b)=>b[1]-a[1]).map(([dept, amt]) => ({ Department: dept, "Total Spend (SAR)": Math.round(amt) }));
  };

  const buildVendorData = () => {
    const m = {};
    [...recurring, ...onetime].forEach(i => {
      const v = i.title || "Unknown";
      if (!m[v]) m[v] = { Vendor: v, "Total (SAR)": 0, Category: i.category || "", Department: i.department || "" };
      m[v]["Total (SAR)"] += Math.round(toSAR(i.amount, i.currency));
    });
    return Object.values(m).sort((a,b) => b["Total (SAR)"] - a["Total (SAR)"]);
  };

  const getData = () => {
    if (reportType === "monthly") return buildMonthlyData();
    if (reportType === "department") return buildDeptData();
    return buildVendorData();
  };

  const exportExcel = () => {
    const data = getData();
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType);
    XLSX.writeFile(wb, `RequestFlow_${reportType}_report.xlsx`);
  };

  const exportCSV = () => {
    const data = getData();
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(","), ...data.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `RequestFlow_${reportType}.csv`; a.click();
  };

  const reports = [
    { id: "monthly",    label: "Monthly Spend",    icon: "📅", desc: "Projected spend per month across all categories" },
    { id: "department", label: "Department Spend",  icon: "🏢", desc: "Total spend grouped by department" },
    { id: "vendor",     label: "Vendor Spend",      icon: "🏪", desc: "Total spend per vendor / subscription item" },
  ];

  const data = getData();

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>EXPORTS</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Financial Reports</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Export spend data in Excel or CSV format</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 22 }}>
        {reports.map(r => (
          <div key={r.id} onClick={() => setReportType(r.id)} style={{ background: reportType===r.id ? C.accentGlow : C.card, border: `1px solid ${reportType===r.id ? C.accent+"66" : C.border}`, borderRadius: 12, padding: "16px 18px", cursor: "pointer", transition: "all .2s" }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{r.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: reportType===r.id ? C.accent : C.text }}>{r.label}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{r.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center" }}>
        <div style={{ fontSize: 13, color: C.muted }}>Export as:</div>
        {["excel","csv"].map(f => (
          <button key={f} className={`tab-btn${format===f?" active":""}`} onClick={() => setFormat(f)}>{f.toUpperCase()}</button>
        ))}
        <button className="btn-primary" onClick={format === "excel" ? exportExcel : exportCSV} style={{ marginLeft: "auto" }}>
          ⬇ Download {reports.find(r=>r.id===reportType)?.label} ({format.toUpperCase()})
        </button>
      </div>

      {/* Preview Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", background: C.subtle, fontSize: 11, color: C.muted, fontWeight: 700, letterSpacing: 1 }}>
          PREVIEW — {reports.find(r=>r.id===reportType)?.label.toUpperCase()} ({data.length} rows)
        </div>
        {data.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(data[0]).length}, 1fr)`, padding: "8px 16px", background: C.card, fontSize: 10, color: C.muted, fontWeight: 700 }}>
              {Object.keys(data[0]).map(h => <div key={h} style={{ padding: "4px 0" }}>{h}</div>)}
            </div>
            {data.slice(0, 10).map((row, i) => (
              <div key={i} className="card-row" style={{ display: "grid", gridTemplateColumns: `repeat(${Object.keys(row).length}, 1fr)`, padding: "8px 16px", borderTop: `1px solid ${C.border}` }}>
                {Object.values(row).map((val, j) => <div key={j} style={{ fontSize: 12, color: C.text }}>{val}</div>)}
              </div>
            ))}
            {data.length > 10 && <div style={{ padding: "10px 16px", fontSize: 11, color: C.muted }}>...and {data.length - 10} more rows in export</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 6. PERMISSIONS VIEW ─────────────────────────────────────────────
const ALL_PAGES = [
  { id: "dashboard",    label: "Dashboard",    icon: "◼",  section: "MAIN"    },
  { id: "forecast",     label: "Forecast",     icon: "📈", section: "MAIN"    },
  { id: "recurring",    label: "Recurring",    icon: "↻",  section: "MAIN"    },
  { id: "onetime",      label: "One-Time",     icon: "≡",  section: "MAIN"    },
  { id: "entitlements", label: "Entitlements", icon: "👤", section: "MAIN"    },
  { id: "approvals",    label: "Approvals",    icon: "✓",  section: "MAIN"    },
  { id: "analytics",    label: "Analytics",    icon: "📊", section: "INSIGHTS" },
  { id: "reports",      label: "Reports",      icon: "⬇",  section: "INSIGHTS" },
  { id: "audit",        label: "Audit Log",    icon: "🗒",  section: "ADMIN"   },
  { id: "notifications",label: "Notifications",icon: "🔔", section: "ADMIN"   },
  { id: "permissions",  label: "Permissions",  icon: "🔑", section: "ADMIN"   },
  { id: "departments",  label: "Departments",  icon: "🏢", section: "ADMIN"   },
];

const ALL_PAGE_IDS = ALL_PAGES.map(p => p.id);

const DEFAULT_PERMISSIONS = {
  staff:     { pages:["recurring","onetime","entitlements"], canSubmit:true,  canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  manager:   { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:true,  canApproveL1:true,  canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  vp:        { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:true,  canApproveL1:false, canApproveVP:true,  canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  hr:        { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:true,  canApproveL1:false, canApproveVP:false, canApproveHR:true,  canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  ceo:       { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:false, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:true,  canApproveFinance:false, canPay:false, canViewAll:false, canExport:true,  canManageUsers:false },
  finance:   { pages:["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports"], canSubmit:true, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:true, canPay:true, canViewAll:true, canExport:true, canManageUsers:false },
  executive: { pages:["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","permissions"], canSubmit:false, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:true, canExport:true, canManageUsers:true },
  admin:     { pages:[...ALL_PAGE_IDS], canSubmit:true, canApproveL1:true, canApproveVP:true, canApproveHR:true, canApproveCEO:true, canApproveFinance:true, canPay:true, canViewAll:true, canExport:true, canManageUsers:true },
};

const PERM_LABELS = {
  canSubmit:         { label: "Submit Requests",    icon: "📤", desc: "Create new one-time, entitlement, and recurring requests" },
  canApproveL1:      { label: "Approve L1 (Mgr)",   icon: "✓",  desc: "Approve Level 1 in all three queues" },
  canApproveVP:      { label: "Approve VP",          icon: "✓",  desc: "Approve entitlement VP level" },
  canApproveHR:      { label: "Approve HR",          icon: "✓",  desc: "Approve entitlement HR level" },
  canApproveCEO:     { label: "Approve CEO",         icon: "✓",  desc: "CEO review & release approvals" },
  canApproveFinance: { label: "Approve Finance",     icon: "✓",  desc: "Finance-level approvals" },
  canPay:            { label: "Record Payments",     icon: "💳", desc: "Record payment details and upload receipts" },
  canViewAll:        { label: "View All Data",       icon: "👁",  desc: "See all users' submissions (not just own)" },
  canExport:         { label: "Export Reports",      icon: "⬇",  desc: "Download financial reports" },
  canManageUsers:    { label: "Manage Permissions",  icon: "🔑", desc: "Change role permissions and user assignments" },
};

function PermissionsView({ showNotif, permissions, setPermissions, authUsers, setAuthUsers }) {
  const [activeRole, setActiveRole] = useState("staff");
  const [activeTab, setActiveTab] = useState("actions");
  // Use live authUsers so newly registered accounts appear immediately
  const allUsers = Object.values(authUsers || {});

  const togglePerm = (role, perm) => {
    if (role === "admin") return; // admin always has all
    setPermissions(prev => ({ ...prev, [role]: { ...prev[role], [perm]: !prev[role][perm] } }));
  };

  const togglePage = (role, pageId) => {
    if (role === "admin") return; // admin always sees all
    setPermissions(prev => {
      const pages = prev[role]?.pages || [];
      const next = pages.includes(pageId) ? pages.filter(p => p !== pageId) : [...pages, pageId];
      return { ...prev, [role]: { ...prev[role], pages: next } };
    });
  };

  const saveRole = () => { showNotif(`${ROLE_CONFIG[activeRole].label} permissions saved — nav updated live!`); };

  const roles = Object.keys(ROLE_CONFIG);
  const rc = ROLE_CONFIG[activeRole];
  const perms = permissions[activeRole] || {};
  const isAdmin = activeRole === "admin";

  const pageSections = [...new Set(ALL_PAGES.map(p => p.section))];

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>ADMIN</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Permissions & Access Control</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Configure what each role can do · Set page visibility · Assign users to roles</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
        {/* ── Role list ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 10, padding: "0 6px" }}>ROLES</div>
          {roles.map(r => {
            const rrc = ROLE_CONFIG[r];
            const actionCount = Object.entries(PERM_LABELS).filter(([k]) => permissions[r]?.[k]).length;
            const pageCount = (permissions[r]?.pages || []).length;
            const isAdminRole = r === "admin";
            return (
              <button key={r} onClick={() => setActiveRole(r)} style={{ width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:9, marginBottom:3, border: activeRole===r ? `1px solid ${rrc.color}55` : "1px solid transparent", background: activeRole===r ? rrc.color+"18" : "transparent", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:28, height:28, borderRadius:"50%", background:rrc.color+"22", border:`2px solid ${rrc.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:rrc.color, position:"relative" }}>
                    {rrc.label[0]}
                    {isAdminRole && <span style={{ position:"absolute", top:-4, right:-4, fontSize:9, background:"#EF4444", color:"#fff", borderRadius:4, padding:"0 3px", fontWeight:800 }}>ALL</span>}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:activeRole===r?700:500, color:activeRole===r?rrc.color:C.text }}>{rrc.label}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{isAdminRole ? "All access" : `${actionCount} actions · ${pageCount} pages`}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel ── */}
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:rc.color+"22", border:`2px solid ${rc.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:700, color:rc.color }}>{rc.label[0]}</div>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:rc.color }}>{rc.label}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{rc.desc}</div>
                </div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                {isAdmin && <span style={{ fontSize:11, background:"#EF444422", color:"#EF4444", border:"1px solid #EF444433", borderRadius:6, padding:"3px 10px", fontWeight:700 }}>🔑 Full System Access</span>}
                <button className="btn-primary" onClick={saveRole}>Save Changes</button>
              </div>
            </div>

            {/* Tab switcher */}
            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              {[["actions","⚡ Actions & Permissions"],["pages","📄 Page Visibility"]].map(([t,l]) => (
                <button key={t} className={`tab-btn${activeTab===t?" active":""}`} onClick={() => setActiveTab(t)}>{l}</button>
              ))}
            </div>

            {/* Actions tab */}
            {activeTab === "actions" && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {Object.entries(PERM_LABELS).map(([key, meta]) => {
                  const on = isAdmin ? true : !!perms[key];
                  return (
                    <div key={key} onClick={() => togglePerm(activeRole, key)}
                      style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:10,
                        border:`1px solid ${on ? C.accent+"55" : C.border}`,
                        background: on ? C.accentGlow : C.subtle,
                        cursor: isAdmin ? "not-allowed" : "pointer",
                        opacity: isAdmin ? 0.8 : 1, transition:"all .2s" }}>
                      <div style={{ fontSize:18 }}>{meta.icon}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color: on ? C.accent : C.text }}>{meta.label}</div>
                        <div style={{ fontSize:10, color:C.muted }}>{meta.desc}</div>
                      </div>
                      <div style={{ width:38, height:20, borderRadius:10, background: on ? C.accent : C.border, position:"relative", transition:"background .2s", flexShrink:0 }}>
                        <div style={{ position:"absolute", top:2, left: on ? 20 : 2, width:16, height:16, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pages tab */}
            {activeTab === "pages" && (
              <div>
                {isAdmin && <div style={{ marginBottom:12, padding:"10px 14px", background:"#EF444412", border:"1px solid #EF444433", borderRadius:8, fontSize:12, color:"#EF4444", fontWeight:600 }}>🔑 Admin has access to ALL pages — cannot be restricted</div>}
                {pageSections.map(sec => (
                  <div key={sec} style={{ marginBottom:16 }}>
                    <div style={{ fontSize:10, fontWeight:700, letterSpacing:1, color:C.muted, marginBottom:8 }}>{sec}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
                      {ALL_PAGES.filter(p => p.section === sec).map(page => {
                        const on = isAdmin ? true : (perms.pages || []).includes(page.id);
                        return (
                          <div key={page.id} onClick={() => togglePage(activeRole, page.id)}
                            style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 14px", borderRadius:10,
                              border:`1px solid ${on ? C.accent+"55" : C.border}`,
                              background: on ? C.accentGlow : C.subtle,
                              cursor: isAdmin ? "not-allowed" : "pointer",
                              opacity: isAdmin ? 0.8 : 1, transition:"all .2s" }}>
                            <span style={{ fontSize:16 }}>{page.icon}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:600, color: on ? C.accent : C.text }}>{page.label}</div>
                            </div>
                            <div style={{ width:34, height:18, borderRadius:9, background: on ? C.accent : C.border, position:"relative", flexShrink:0 }}>
                              <div style={{ position:"absolute", top:2, left: on ? 16 : 2, width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left .2s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Users table */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:14 }}>
              USERS WITH ROLE — {rc.label.toUpperCase()}
              <span style={{ fontWeight:400, color:C.muted, marginLeft:8 }}>({allUsers.filter(u=>u.role===activeRole).length} users)</span>
            </div>
            {allUsers.filter(u => u.role === activeRole).length === 0
              ? <div style={{ color:C.muted, fontSize:13, padding:"12px 0" }}>No users assigned to this role</div>
              : allUsers.filter(u => u.role === activeRole).map(u => {
                const roleColor = ROLE_CONFIG[u.role]?.color || C.muted;
                return (
                  <div key={u.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ width:34, height:34, borderRadius:"50%", background:roleColor+"22", border:`2px solid ${roleColor}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:roleColor }}>
                      {u.name[0]}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{u.name}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{u.email}</div>
                    </div>
                    <select className="inp" style={{ width:140, fontSize:12 }} value={u.role}
                      onChange={e => {
                        const newRole = e.target.value;
                        setAuthUsers(prev => ({ ...prev, [u.email]: { ...prev[u.email], role: newRole } }));
                        showNotif(`${u.name} moved to ${ROLE_CONFIG[newRole]?.label || newRole}`);
                      }}>
                      {roles.map(r => <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>)}
                    </select>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DEPARTMENTS VIEW
// ═══════════════════════════════════════════════════════════════════
function DepartmentsView({ deptConfig, setDeptConfig, showNotif, authUsers }) {
  const [selected, setSelected] = useState(deptConfig[0]?.id || null);
  const [edited, setEdited] = useState({});   // tracks unsaved changes per dept

  const userList = Object.values(authUsers || {});

  const dept = deptConfig.find(d => d.id === selected);
  const changes = edited[selected] || {};
  const current = dept ? { ...dept, ...changes } : null;

  const setField = (field, val) => {
    setEdited(prev => ({ ...prev, [selected]: { ...(prev[selected] || {}), [field]: val } }));
  };

  const save = () => {
    setDeptConfig(prev => prev.map(d =>
      d.id === selected ? { ...d, ...(edited[selected] || {}) } : d
    ));
    setEdited(prev => { const n = { ...prev }; delete n[selected]; return n; });
    showNotif(`${selected} department saved!`);
  };

  const hasChanges = Object.keys(edited[selected] || {}).length > 0;

  const ROLES_IN_FLOW = [
    { key: "manager",  label: "Manager",          icon: "👔", color: "#F97316", desc: "Approves L1 — first reviewer for all requests from this department" },
    { key: "vp",       label: "VP",               icon: "⭐", color: "#14B8A6", desc: "Approves entitlement requests at VP level" },
    { key: "hr",       label: "HR",               icon: "👤", color: "#A78BFA", desc: "Approves entitlement requests at HR level" },
    { key: "finance",  label: "Finance Approver", icon: "💰", color: "#F59E0B", desc: "Reviews budget and releases payments for this department" },
  ];

  const completeness = deptConfig.map(d => {
    const filled = ["manager","finance"].filter(k => d[k]).length;
    return { id: d.id, filled, total: 2 };
  });

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>ADMIN</div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Department Configuration</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>Assign approvers to each department · Controls who reviews requests in the approval flow</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 16 }}>

        {/* ── Department list ── */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 10, padding: "0 4px" }}>DEPARTMENTS</div>
          {deptConfig.map(d => {
            const comp = completeness.find(c => c.id === d.id);
            const pct = comp ? comp.filled / comp.total : 0;
            const isActive = selected === d.id;
            const hasEdit = !!edited[d.id];
            return (
              <button key={d.id} onClick={() => setSelected(d.id)}
                style={{ width:"100%", textAlign:"left", padding:"10px 12px", borderRadius:9, marginBottom:3,
                  border: isActive ? `1px solid ${C.accent}55` : "1px solid transparent",
                  background: isActive ? C.accentGlow : "transparent", cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                  <div style={{ width:32, height:32, borderRadius:9, background: pct===1 ? "#10B98122" : C.subtle, border:`1.5px solid ${pct===1 ? "#10B98155" : C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>🏢</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ fontSize:12, fontWeight: isActive?700:500, color: isActive?C.accent:C.text }}>{d.name}</span>
                      {hasEdit && <span style={{ fontSize:9, background:"#F59E0B22", color:"#F59E0B", border:"1px solid #F59E0B44", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>UNSAVED</span>}
                    </div>
                    {/* mini progress bar */}
                    <div style={{ marginTop:4, height:3, borderRadius:2, background:C.border, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${pct*100}%`, background: pct===1 ? "#10B981" : C.accent, borderRadius:2, transition:"width .3s" }} />
                    </div>
                    <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{comp?.filled}/{comp?.total} key roles assigned</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right panel ── */}
        {current ? (
          <div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>

              {/* Header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: 22 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:C.subtle, border:`1px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🏢</div>
                  <div>
                    <div style={{ fontSize:18, fontWeight:700 }}>{current.name}</div>
                    <div style={{ fontSize:12, color:C.muted }}>Assign who handles each approval stage for this department</div>
                  </div>
                </div>
                <button className="btn-primary" onClick={save} disabled={!hasChanges}
                  style={{ opacity: hasChanges ? 1 : 0.4, cursor: hasChanges ? "pointer" : "default" }}>
                  Save Changes
                </button>
              </div>

              {/* Role assignment cards */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
                {ROLES_IN_FLOW.map(({ key, label, icon, color, desc }) => {
                  const assigned = current[key];
                  const assignedUser = userList.find(u => u.id === assigned || u.email === assigned);
                  return (
                    <div key={key} style={{ padding:"16px 18px", borderRadius:12, border:`1px solid ${assigned ? color+"44" : C.border}`, background: assigned ? color+"0C" : C.subtle }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                        <span style={{ fontSize:18 }}>{icon}</span>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color: assigned ? color : C.text }}>{label}</div>
                          <div style={{ fontSize:10, color:C.muted }}>{desc}</div>
                        </div>
                      </div>

                      {/* User picker */}
                      <select
                        value={current[key] || ""}
                        onChange={e => setField(key, e.target.value)}
                        style={{ width:"100%", background:C.card, border:`1px solid ${assigned ? color+"55" : C.border}`, color: assigned ? C.text : C.muted, padding:"9px 12px", borderRadius:8, fontSize:12, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
                        <option value="">— Not assigned —</option>
                        {userList.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({ROLE_CONFIG[u.role]?.label || u.role})
                          </option>
                        ))}
                      </select>

                      {/* Assigned user badge */}
                      {assignedUser && (
                        <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:7, padding:"6px 10px", background:color+"15", border:`1px solid ${color}33`, borderRadius:7 }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", background:color+"33", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color, flexShrink:0 }}>
                            {assignedUser.name[0]}
                          </div>
                          <div>
                            <div style={{ fontSize:11, fontWeight:600, color }}>{assignedUser.name}</div>
                            <div style={{ fontSize:10, color:C.muted }}>{assignedUser.email}</div>
                          </div>
                          <div style={{ marginLeft:"auto", fontSize:9, background:color+"22", color, border:`1px solid ${color}33`, borderRadius:4, padding:"2px 6px", fontWeight:700 }}>
                            {ROLE_CONFIG[assignedUser.role]?.label}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              <div style={{ marginTop:16 }}>
                <label style={{ fontSize:11, color:C.muted, display:"block", marginBottom:6, fontWeight:600, letterSpacing:1 }}>NOTES (optional)</label>
                <textarea
                  value={current.notes || ""}
                  onChange={e => setField("notes", e.target.value)}
                  placeholder="Any special notes about this department's approval process..."
                  rows={2}
                  style={{ width:"100%", background:C.subtle, border:`1px solid ${C.border}`, color:C.text, padding:"10px 14px", borderRadius:9, fontSize:12, outline:"none", fontFamily:"inherit", resize:"vertical" }} />
              </div>

              {/* Staff members */}
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, color:C.muted, fontWeight:700, letterSpacing:1, marginBottom:10 }}>STAFF MEMBERS</div>
                <div style={{ padding:"14px 16px", borderRadius:12, border:`1px solid #6B7A9944`, background:"#6B7A9908" }}>
                  <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>👥 Select users who belong to this department</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 }}>
                    {(current.staff || []).map(uid => {
                      const u = userList.find(x => x.id === uid);
                      if (!u) return null;
                      return (
                        <div key={uid} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#6B7A9922", border:"1px solid #6B7A9944", borderRadius:20 }}>
                          <span style={{ fontSize:11, fontWeight:600, color:C.text }}>{u.name}</span>
                          <span style={{ fontSize:10, color:C.muted }}>·</span>
                          <span style={{ fontSize:10, color:C.muted }}>{ROLE_CONFIG[u.role]?.label || u.role}</span>
                          <button onClick={() => setField("staff", (current.staff||[]).filter(id=>id!==uid))}
                            style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:13, lineHeight:1, padding:"0 0 0 2px" }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                  <select
                    value=""
                    onChange={e => {
                      if (!e.target.value) return;
                      const curr = current.staff || [];
                      if (!curr.includes(e.target.value)) setField("staff", [...curr, e.target.value]);
                    }}
                    style={{ background:C.card, border:`1px solid ${C.border}`, color:C.muted, padding:"9px 12px", borderRadius:8, fontSize:12, outline:"none", fontFamily:"inherit", cursor:"pointer" }}>
                    <option value="">+ Add staff member...</option>
                    {userList.filter(u => !(current.staff||[]).includes(u.id)).map(u => (
                      <option key={u.id} value={u.id}>{u.name} — {ROLE_CONFIG[u.role]?.label || u.role}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Flow preview */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:1, marginBottom:14 }}>APPROVAL FLOW PREVIEW — {current.name.toUpperCase()}</div>
              <div style={{ display:"flex", alignItems:"center", gap:0, flexWrap:"wrap" }}>
                {[
                  { label:"Submit", person: "Staff", color:"#6B7A99" },
                  { label:"Manager", person: userList.find(u => u.id === current.manager || u.email === current.manager)?.name || "Not set", color:"#F97316" },
                  { label:"CEO", person:"Mohammed Al-Saud", color:"#EC4899" },
                  { label:"Finance", person: userList.find(u => u.id === current.finance || u.email === current.finance)?.name || "Not set", color:"#F59E0B" },
                  { label:"CEO Release", person:"Mohammed Al-Saud", color:"#EC4899" },
                  { label:"Pay", person:"Finance Team", color:"#10B981" },
                ].map((step, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center" }}>
                    <div style={{ textAlign:"center", padding:"8px 12px", borderRadius:9, background:step.color+"15", border:`1px solid ${step.color}33`, minWidth:90 }}>
                      <div style={{ fontSize:10, color:step.color, fontWeight:700 }}>{step.label}</div>
                      <div style={{ fontSize:10, color:C.muted, marginTop:2, maxWidth:90, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{step.person}</div>
                    </div>
                    {i < 5 && <div style={{ color:C.muted, fontSize:14, padding:"0 4px" }}>→</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, fontSize:14 }}>
            Select a department to configure
          </div>
        )}
      </div>
    </div>
  );
}