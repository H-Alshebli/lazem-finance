// ─── All shared constants used across the app ───────────

export const DEPARTMENTS = [
  "All Company","EMS","Sales","HR","IT","Operations","Admin","Marketing","Finance","Legal"
];

export const CATEGORIES_RECURRING = ["Subscriptions","Iqama","Service","Utility","Insurance","Other"];
export const CATEGORIES_ONETIME   = ["Medical","Equipment","Events","Legal","Training","Maintenance","Vendor Payment","Other"];

export const SAR_RATES = { SAR: 1, USD: 3.75, KWD: 12.2, EUR: 4.05 };

export const ROLE_CONFIG = {
  staff: {
    label: "Staff", color: "#6B7A99",
    desc: "Submit requests only",
    pages: ["recurring","onetime","entitlements"],
    canApprove: [], canSubmit: true, canPay: false, canViewAll: false,
  },
  manager: {
    label: "Manager", color: "#F97316",
    desc: "Approve Level 1 — sees own submissions + pending queue",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_manager","pending_approval"], canSubmit: true, canPay: false, canViewAll: false,
  },
  vp: {
    label: "VP", color: "#14B8A6",
    desc: "Approve Entitlements Level 2",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_vp"], canSubmit: true, canPay: false, canViewAll: false,
  },
  hr: {
    label: "HR", color: "#A78BFA",
    desc: "Approve Entitlements Level 3",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_hr"], canSubmit: true, canPay: false, canViewAll: false,
  },
  ceo: {
    label: "CEO", color: "#EC4899",
    desc: "Review & Release — sees pending CEO queues",
    pages: ["dashboard","forecast","onetime","entitlements","recurring","approvals"],
    canApprove: ["pending_ceo_1","pending_ceo_2","pending_ceo_1_rec","pending_ceo_2_rec"],
    canSubmit: false, canPay: false, canViewAll: false,
  },
  finance: {
    label: "Finance", color: "#F59E0B",
    desc: "Full access — all requests, payments, approvals",
    pages: ["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports"],
    canApprove: ["pending_finance","pending_finance_rec","pending_pay","pending_pay_rec"],
    canSubmit: true, canPay: true, canViewAll: true,
  },
  executive: {
    label: "Executive", color: "#8B5CF6",
    desc: "Read-only full overview",
    pages: ["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","permissions"],
    canApprove: [], canSubmit: false, canPay: false, canViewAll: true,
  },
  admin: {
    label: "Admin", color: "#EF4444",
    desc: "Full system access — all pages, all permissions",
    pages: ["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","audit","notifications","permissions","departments"],
    canApprove: ["pending_manager","pending_approval","pending_vp","pending_hr","pending_ceo_1","pending_ceo_2","pending_ceo_1_rec","pending_ceo_2_rec","pending_finance","pending_finance_rec","pending_pay","pending_pay_rec"],
    canSubmit: true, canPay: true, canViewAll: true,
  },
};

export const ALL_NAV = [
  { id: "dashboard",    label: "Dashboard",     icon: "◼",  section: "main"    },
  { id: "forecast",     label: "Forecast",      icon: "📈", section: "main"    },
  { id: "recurring",    label: "Recurring",     icon: "↻",  section: "main"    },
  { id: "onetime",      label: "One-Time",      icon: "≡",  section: "main"    },
  { id: "entitlements", label: "Entitlements",  icon: "👤", section: "main"    },
  { id: "approvals",    label: "Approvals",     icon: "✓",  section: "main"    },
  { id: "analytics",    label: "Analytics",     icon: "📊", section: "insights" },
  { id: "reports",      label: "Reports",       icon: "⬇",  section: "insights" },
  { id: "audit",        label: "Audit Log",     icon: "🗒",  section: "admin"   },
  { id: "notifications",label: "Notifications", icon: "🔔", section: "admin"   },
  { id: "permissions",  label: "Permissions",   icon: "🔑", section: "admin"   },
  { id: "departments",  label: "Departments",   icon: "🏢", section: "admin"   },
];

export const DEFAULT_PERMISSIONS = {
  staff:     { pages:["recurring","onetime","entitlements"], canSubmit:true, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  manager:   { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:true, canApproveL1:true, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  vp:        { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:true, canApproveL1:false, canApproveVP:true, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  hr:        { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:true, canApproveL1:false, canApproveVP:false, canApproveHR:true, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:false, canExport:false, canManageUsers:false },
  ceo:       { pages:["dashboard","forecast","onetime","entitlements","recurring","approvals"], canSubmit:false, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:true, canApproveFinance:false, canPay:false, canViewAll:false, canExport:true, canManageUsers:false },
  finance:   { pages:["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports"], canSubmit:true, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:true, canPay:true, canViewAll:true, canExport:true, canManageUsers:false },
  executive: { pages:["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","permissions"], canSubmit:false, canApproveL1:false, canApproveVP:false, canApproveHR:false, canApproveCEO:false, canApproveFinance:false, canPay:false, canViewAll:true, canExport:true, canManageUsers:true },
  admin:     { pages:["dashboard","forecast","recurring","onetime","entitlements","approvals","analytics","reports","audit","notifications","permissions","departments"], canSubmit:true, canApproveL1:true, canApproveVP:true, canApproveHR:true, canApproveCEO:true, canApproveFinance:true, canPay:true, canViewAll:true, canExport:true, canManageUsers:true },
};

export const C = {
  bg: "#0B0F1A", surface: "#131929", card: "#1A2236", border: "#253047",
  accent: "#3B82F6", accentGlow: "#3B82F620", gold: "#F59E0B",
  green: "#10B981", red: "#EF4444", orange: "#F97316",
  text: "#E8EDF5", muted: "#6B7A99", subtle: "#2A3655", purple: "#8B5CF6",
};
