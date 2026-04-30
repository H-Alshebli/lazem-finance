import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  C,
  DEPARTMENTS,
  CATEGORIES_RECURRING,
  COMPANY_OPTIONS,
  BANK_OPTIONS,
  statusConfig,
  priorityConfig,
} from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";
import InvoiceUpload, { PayInvoiceUpload } from "../components/InvoiceUpload";

const SUBCAT_COLORS = {
  "": C.accent,
  Hosting: "#06B6D4",
  Domains: "#F59E0B",
  Licensing: "#10B981",
  Telecom: "#8B5CF6",
};

const OCCURRENCE_TERMINAL = ["pending_receipt", "pending_invoice", "paid"];

const MASTER_STATUS_META = {
  active_recurring: { label: "Active", color: C.green },
  inactive_recurring: { label: "Inactive", color: C.muted },
  pending_approval: { label: "Pending Manager", color: C.orange },
  pending_ceo_1_rec: { label: "Pending CEO", color: "#EC4899" },
  pending_finance_rec: { label: "Pending Finance", color: C.gold },
};

function toYMD(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(base, months) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

function getFrequencyStep(frequency) {
  const v = String(frequency || "Monthly").toLowerCase();
  if (v.includes("quarter")) return 3;
  if (v.includes("semi")) return 6;
  if (v.includes("year")) return 12;
  return 1;
}

function monthLabel(date) {
  return date.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

function cycleKeyFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function buildFingerprint(item) {
  return [
    String(item.title || "").trim().toLowerCase(),
    String(item.department || "").trim().toLowerCase(),
    String(item.category || "").trim().toLowerCase(),
    String(item.companyName || "").trim().toLowerCase(),
  ].join("|");
}

function deriveOccurrenceStatus(occ) {
  if (!occ) return "upcoming";
  if (OCCURRENCE_TERMINAL.includes(occ.status)) return occ.status;

  const d = daysUntil(occ.dueDate);
  if (d === null) return occ.status || "upcoming";
  if (d < 0) return "overdue";
  if (d <= 14) return "pending_bank_release";
  return "upcoming";
}

function buildOccurrences(master, existing = [], count = 6) {
  const existingMap = new Map((existing || []).map((o) => [o.cycleKey, o]));

  const startDate = safeDate(master.startDate || master.renewalDate || today()) || new Date();
  const endDate = safeDate(master.endDate);
  const dueDay = Math.max(
    1,
    Math.min(31, Number(master.dueDay || startDate.getDate() || 1))
  );
  const step = getFrequencyStep(master.frequency);

  const now = new Date();
  const startCursor = new Date(
    Math.max(startDate.getFullYear(), now.getFullYear()),
    Math.max(startDate.getFullYear() === now.getFullYear() ? startDate.getMonth() : 0, now.getMonth()),
    1
  );

  const rows = [];
  let cursor = new Date(startCursor.getFullYear(), startCursor.getMonth(), 1);
  let created = 0;
  let safety = 0;

  while (created < count && safety < 48) {
    safety += 1;

    const due = new Date(cursor.getFullYear(), cursor.getMonth(), dueDay);
    while (due.getMonth() !== cursor.getMonth()) {
      due.setDate(due.getDate() - 1);
    }

    if (due < startDate) {
      cursor = addMonths(cursor, step);
      continue;
    }

    if (endDate && due > endDate) break;

    const cycleKey = cycleKeyFromDate(due);
    const existingOcc = existingMap.get(cycleKey);

    const base = {
      id: existingOcc?.id || uid(),
      cycleKey,
      cycleLabel: monthLabel(due),
      dueDate: existingOcc?.dueDate || toYMD(due),
      originalDueDate: existingOcc?.originalDueDate || toYMD(due),
      amount: Number(existingOcc?.amount ?? master.amount ?? 0),
      currency: existingOcc?.currency || master.currency || "SAR",
      status: existingOcc?.status || "upcoming",
      bankRelease: existingOcc?.bankRelease || null,
      receiptUploaded: existingOcc?.receiptUploaded || null,
      purchaseInvoices: existingOcc?.purchaseInvoices || [],
      paymentInfo: existingOcc?.paymentInfo || null,
      history: existingOcc?.history || [],
    };

    base.status = deriveOccurrenceStatus(base);
    rows.push(base);
    created += 1;
    cursor = addMonths(cursor, step);
  }

  return rows;
}

function buildMasterRecord(raw, existing) {
  const startDate = toYMD(raw.startDate || raw.renewalDate || today());
  const dueDay = Number(raw.dueDay || safeDate(startDate)?.getDate() || 1);

  const master = {
    id: raw.id || uid(),
    title: raw.title || "",
    details: raw.details || "",
    purpose: raw.purpose || "",
    category: raw.category || "Subscriptions",
    subcategory: raw.subcategory || "",
    department: raw.department || "All Company",
    frequency: raw.frequency || "Monthly",
    licenses: Number(raw.licenses || 1),
    amount: Number(raw.amount || 0),
    currency: raw.currency || "SAR",
    startDate,
    renewalDate: startDate,
    endDate: toYMD(raw.endDate || ""),
    dueDay,
    priority: raw.priority || "medium",
paymentMethod: raw.paymentMethod || "",
companyName: raw.companyName || "",
bankName: raw.bankName || "",
    notes: raw.notes || "",
    invoices: Array.isArray(raw.invoices) ? raw.invoices : [],
    isActive: raw.isActive ?? true,
    masterStatus: raw.masterStatus || "active_recurring",
    managerApproval: raw.managerApproval || null,
    ceoApproval: raw.ceoApproval || null,
    financeApproval: raw.financeApproval || null,
    history: Array.isArray(raw.history) ? raw.history : [],
    occurrences: [],
  };

  master.occurrences = buildOccurrences(master, raw.occurrences || existing?.occurrences || []);
  return master;
}

function parseExcelToRecurring(file, onDone, onError) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const mapped = rows
        .map((r, i) => {
          const get = (...keys) => {
            for (const k of keys) {
              const found = Object.keys(r).find(
                (rk) => rk.toLowerCase().trim() === k.toLowerCase()
              );
              if (found && r[found] !== "") return String(r[found]).trim();
            }
            return "";
          };

          const rawAmt = get("Total Cost", "Cost", "Amount");
          const amount =
            parseFloat(String(rawAmt || "").replace(/[^0-9.]/g, "")) || 0;

          const currency = rawAmt.includes("$")
            ? "USD"
            : rawAmt.toLowerCase().includes("kwd") ||
              rawAmt.toLowerCase().includes("dinar")
            ? "KWD"
            : "SAR";

          const rawDate = get("Renewal Date", "Due Date", "RenewalDate", "Start Date");
          const renewalDate = toYMD(rawDate || today());

          const rawCategory = get("Category", "Type", "Cat");
          const validCategories = ["Subscriptions", "Iqama", "Service", "Utility", "Insurance", "Other"];
          const category =
            validCategories.find(
              (c) => c.toLowerCase() === rawCategory.toLowerCase()
            ) || (rawCategory ? "Other" : "Subscriptions");

          const rawPriority = get("Priority");
          const priority =
            ["high", "medium", "low"].find(
              (p) => p.toLowerCase() === rawPriority.toLowerCase()
            ) || "medium";

          const dueDayRaw = get("Due Day", "Day of Month");
          const dueDay = Number(dueDayRaw || safeDate(renewalDate)?.getDate() || 1);

          return {
            id: `${Date.now()}-${i}`,
            title: get("Subscription Name", "Name", "Title"),
            details: get("Details", "Description"),
            purpose: get("Purpose"),
            department: get("Department") || "All Company",
            subcategory: get("Sub-Group", "SubGroup", "Subcategory"),
            frequency: get("Billing Cycle", "Frequency") || "Monthly",
            licenses:
              parseInt(get("Number of Users / Licenses", "Licenses", "Users")) || 1,
            amount,
            currency,
            category,
            priority,
paymentMethod: "",
companyName: "",
bankName: "",
            startDate: renewalDate,
            renewalDate,
            endDate: toYMD(get("End Date")),
            dueDay,
            notes: get("Notes"),
            invoices: [],
            isActive: true,
            masterStatus: "active_recurring",
          };
        })
        .filter((r) => r.title);

      onDone(mapped);
    } catch (err) {
      onError(err.message || "Import failed");
    }
  };

  reader.readAsBinaryString(file);
}

function downloadRecurringTemplate() {
  const headers = [
    "Name",
    "Category",
    "Details",
    "Department",
    "Purpose",
    "Billing Cycle",
    "Number of Users / Licenses",
    "Total Cost",
    "Payment Method",
    "Company",
    "Bank",
    "Start Date",
    "End Date",
    "Due Day",
    "Priority",
    "Notes",
  ];

  const sample = [
    [
      "AWS Hosting",
      "Subscriptions",
      "Production servers",
      "IT",
      "Cloud infrastructure",
      "Monthly",
      1,
      100,
      "Bank Transfer",
      "Lazem Medical Services",
      "Al Rajhi Bank - Lazem Medical",
      "2026-05-27",
      "",
      27,
      "high",
      "Main AWS account",
    ],
    [
      "Vercel Pro",
      "Subscriptions",
      "Hosting for production apps",
      "IT",
      "Application hosting",
      "Monthly",
      1,
      80,
      "Credit Card",
      "Lazem Medical Services",
      "Al Rajhi Bank - Lazem Medical",
      "2026-05-15",
      "",
      15,
      "medium",
      "",
    ],
    [
      "GoDaddy Domain",
      "Service",
      "Company domain renewal",
      "IT",
      "Domain service",
      "Yearly",
      1,
      120,
      "Bank Transfer",
      "Lazem Holding",
      "ALbilad Bank - Lazem Holding",
      "2026-09-01",
      "",
      1,
      "medium",
      "",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Recurring Payments");
  XLSX.writeFile(wb, "recurring_payments_template.xlsx");
}

function RecurringView({
  recurring = [],
  setRecurring,
  showNotif,
  userRole,
  username,
  logAction,
  addNotif,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeTab, setActiveTab] = useState("Subscriptions");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [expandedMasters, setExpandedMasters] = useState({});
  const [importRows, setImportRows] = useState([]);
  const [importDecisions, setImportDecisions] = useState({});
  const [importError, setImportError] = useState("");
  const fileRef = useRef(null);

  const [rescheduleModal, setRescheduleModal] = useState(null);
  const [bankReleaseModal, setBankReleaseModal] = useState(null);
  const [receiptModal, setReceiptModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);

  const [receiptFiles, setReceiptFiles] = useState([]);
  const [invoiceFiles, setInvoiceFiles] = useState([]);

const [bankForm, setBankForm] = useState({
  method: "Bank Transfer",
  companyName: COMPANY_OPTIONS?.[0] || "",
  bankName: BANK_OPTIONS?.[0] || "",
  ref: "",
  date: today(),
  note: "",
});

const [form, setForm] = useState({
  title: "",
  details: "",
  purpose: "",
  category: "Subscriptions",
  subcategory: "",
  department: "All Company",
  frequency: "Monthly",
  licenses: "",
  amount: "",
  currency: "SAR",
  startDate: "",
  endDate: "",
  dueDay: "",
  priority: "medium",
  notes: "",
  invoices: [],
});

  const preparedRecurring = useMemo(
    () => recurring.map((r) => buildMasterRecord(r, r)),
    [recurring]
  );

  const getNextOpenOccurrence = (master) => {
    const open = (master.occurrences || [])
      .filter((o) => o.status !== "paid")
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    return open[0] || null;
  };

  const getMasterFilterState = (master) => {
    const next = getNextOpenOccurrence(master);
    if (!next) return "paid";
    const d = daysUntil(next.dueDate);
    if (d !== null && d < 0) return "overdue";
    if (d !== null && d <= 14) return "due14";
    return deriveOccurrenceStatus(next);
  };

  const tabItems = useMemo(() => {
    let list = preparedRecurring.filter((r) => r.category === activeTab);

    if (filterStatus === "overdue") {
      list = list.filter((r) => getMasterFilterState(r) === "overdue");
    } else if (filterStatus === "due14") {
      list = list.filter((r) => {
        const next = getNextOpenOccurrence(r);
        if (!next) return false;
        const d = daysUntil(next.dueDate);
        return d !== null && d >= 0 && d <= 14;
      });
    } else if (filterStatus === "upcoming") {
      list = list.filter((r) => getMasterFilterState(r) === "upcoming");
    } else if (filterStatus === "paid") {
      list = list.filter((r) => getMasterFilterState(r) === "paid");
    }

    if (search) {
      list = list.filter((r) =>
        [
          r.title,
          r.details,
          r.department,
          r.purpose,
          r.notes,
          r.companyName,
          r.bankName,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      );
    }

    return list;
  }, [preparedRecurring, activeTab, filterStatus, search]);

  const groups = useMemo(() => {
    const map = {};
    tabItems.forEach((r) => {
      const key = r.subcategory || "";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    Object.values(map).forEach((g) =>
      g.sort((a, b) => {
        const ad = getNextOpenOccurrence(a)?.dueDate || "9999-12-31";
        const bd = getNextOpenOccurrence(b)?.dueDate || "9999-12-31";
        return new Date(ad) - new Date(bd);
      })
    );
    return map;
  }, [tabItems]);

  const groupKeys = useMemo(() => {
    const keys = Object.keys(groups);
    return ["", ...keys.filter((k) => k !== "").sort()];
  }, [groups]);

  const tabSummary = useMemo(() => {
    const res = {};
    CATEGORIES_RECURRING.forEach((cat) => {
      const items = preparedRecurring.filter((r) => r.category === cat);
      res[cat] = {
        total: items.length,
        overdue: items.filter((r) => getMasterFilterState(r) === "overdue").length,
      };
    });
    return res;
  }, [preparedRecurring]);

  const updateMaster = (masterId, updater) => {
    setRecurring((prev) =>
      prev.map((item) => {
        if (item.id !== masterId) return item;
        const prepared = buildMasterRecord(item, item);
        return updater(prepared);
      })
    );
  };

  const updateOccurrence = (masterId, occurrenceId, updater) => {
    updateMaster(masterId, (master) => ({
      ...master,
      occurrences: (master.occurrences || []).map((occ) =>
        occ.id === occurrenceId ? updater(occ) : occ
      ),
    }));
  };

  const toggleGroup = (key) =>
    setCollapsedGroups((p) => ({ ...p, [key]: !p[key] }));

  const toggleMaster = (id) =>
    setExpandedMasters((p) => ({ ...p, [id]: !p[id] }));

  const deleteItem = (id) => {
    if (!window.confirm("Remove this recurring master request?")) return;
    setRecurring((p) => p.filter((r) => r.id !== id));
    showNotif("Recurring item removed.");
  };

  const addItem = () => {
    if (!form.title.trim()) return showNotif("Name is required", "error");
    if (!form.startDate) return showNotif("Start date is required", "error");
    if (!form.dueDay) return showNotif("Due day is required", "error");

const newMaster = buildMasterRecord({
  ...form,
  id: uid(),
  amount: Number(form.amount || 0),
  licenses: Number(form.licenses || 1),
  masterStatus: "active_recurring",
  isActive: true,
  paymentMethod: "",
  companyName: "",
  bankName: "",
  history: [
    {
      by: username || "User",
      date: today(),
      note: "Recurring master created",
    },
  ],
});

    setRecurring((p) => [...p, newMaster]);
    setShowAdd(false);
setForm({
  title: "",
  details: "",
  purpose: "",
  category: "Subscriptions",
  subcategory: "",
  department: "All Company",
  frequency: "Monthly",
  licenses: "",
  amount: "",
  currency: "SAR",
  startDate: "",
  endDate: "",
  dueDay: "",
  priority: "medium",
  notes: "",
  invoices: [],
});

    showNotif("Recurring master added!");
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError("");
    parseExcelToRecurring(
      file,
      (rows) => {
        const prepared = rows.map((row) => {
          const duplicate = preparedRecurring.find(
            (existing) => buildFingerprint(existing) === buildFingerprint(row)
          );

          return {
            row: buildMasterRecord({
              ...row,
              id: uid(),
              masterStatus: "active_recurring",
              isActive: true,
            }),
            duplicateId: duplicate?.id || null,
            duplicateTitle: duplicate?.title || "",
          };
        });

        const decisions = {};
        prepared.forEach((entry, idx) => {
          decisions[idx] = entry.duplicateId ? "skip" : "create";
        });

        setImportRows(prepared);
        setImportDecisions(decisions);
      },
      (err) => setImportError(`Error: ${err}`)
    );

    e.target.value = "";
  };

  const confirmImport = () => {
    const toCreate = [];
    const toUpdate = [];

    importRows.forEach((entry, idx) => {
      const decision = importDecisions[idx] || "create";

      if (entry.duplicateId) {
        if (decision === "update") {
          toUpdate.push(entry);
        } else if (decision === "create") {
          toCreate.push(entry.row);
        }
      } else if (decision === "create") {
        toCreate.push(entry.row);
      }
    });

    setRecurring((prev) => {
      let next = [...prev];

      toUpdate.forEach((entry) => {
        next = next.map((item) =>
          item.id === entry.duplicateId
            ? buildMasterRecord({
                ...item,
                ...entry.row,
                id: item.id,
                occurrences: item.occurrences || [],
                history: [
                  ...(item.history || []),
                  {
                    by: username || "User",
                    date: today(),
                    note: "Recurring master updated from import file",
                  },
                ],
              })
            : item
        );
      });

      return [...next, ...toCreate];
    });

    showNotif(
      `${toCreate.length} created, ${toUpdate.length} updated from import.`
    );
    setImportRows([]);
    setImportDecisions({});
    setShowImport(false);
  };

  const openReschedule = (masterId, occ) => {
    setRescheduleModal({
      masterId,
      occurrenceId: occ.id,
      date: occ.dueDate,
      note: "",
      cycleLabel: occ.cycleLabel,
    });
  };

  const saveReschedule = () => {
    if (!rescheduleModal?.date) {
      return showNotif("Please select a date", "error");
    }

    updateOccurrence(
      rescheduleModal.masterId,
      rescheduleModal.occurrenceId,
      (occ) => ({
        ...occ,
        dueDate: rescheduleModal.date,
        status: deriveOccurrenceStatus({
          ...occ,
          dueDate: rescheduleModal.date,
        }),
        history: [
          ...(occ.history || []),
          {
            by: username || "User",
            date: today(),
            note: `Rescheduled this month from ${fmtDate(
              occ.originalDueDate || occ.dueDate
            )} to ${fmtDate(rescheduleModal.date)}${
              rescheduleModal.note ? ` · ${rescheduleModal.note}` : ""
            }`,
          },
        ],
      })
    );

    setRescheduleModal(null);
    showNotif("This month rescheduled successfully!");
  };

  const openBankRelease = (masterId, occ) => {
    setBankReleaseModal({
      masterId,
      occurrenceId: occ.id,
      cycleLabel: occ.cycleLabel,
      title: "",
    });
setBankForm({
  method: "Bank Transfer",
  companyName: COMPANY_OPTIONS?.[0] || "",
  bankName: BANK_OPTIONS?.[0] || "",
  ref: "",
  date: today(),
  note: "",
});
  };

  const saveBankRelease = () => {
    if (!bankForm.ref.trim()) {
      return showNotif("Reference number is required", "error");
    }

    updateOccurrence(
      bankReleaseModal.masterId,
      bankReleaseModal.occurrenceId,
      (occ) => ({
        ...occ,
        status: "pending_receipt",
bankRelease: {
  method: bankForm.method,
  companyName: bankForm.companyName,
  bankName: bankForm.bankName,
  ref: bankForm.ref,
  date: bankForm.date,
  note: bankForm.note,
  by: username || "Finance",
},
        history: [
          ...(occ.history || []),
          {
            by: username || "Finance",
            date: today(),
            note: `Released for payment · Ref ${bankForm.ref}`,
          },
        ],
      })
    );

    setBankReleaseModal(null);
    showNotif("Bank release saved!");
  };

  const openReceipt = (masterId, occ) => {
    setReceiptModal({
      masterId,
      occurrenceId: occ.id,
      cycleLabel: occ.cycleLabel,
    });
    setReceiptFiles([]);
  };

  const saveReceipt = () => {
    if (!receiptFiles.length) {
      return showNotif("Please upload receipt file", "error");
    }

    updateOccurrence(receiptModal.masterId, receiptModal.occurrenceId, (occ) => ({
      ...occ,
      status: "pending_invoice",
      receiptUploaded: {
        files: receiptFiles.map((f) => ({
          id: f.id || uid(),
          name: f.name,
          size: f.size || 0,
          type: f.type || "",
          downloadUrl: f.downloadUrl || "",
          dataUrl: f.dataUrl || "",
          uploadedAt: f.uploadedAt || today(),
        })),
        by: username || "Finance",
        date: today(),
      },
      history: [
        ...(occ.history || []),
        {
          by: username || "Finance",
          date: today(),
          note: `Receipt uploaded (${receiptFiles.length} file${
            receiptFiles.length !== 1 ? "s" : ""
          })`,
        },
      ],
    }));

    setReceiptModal(null);
    setReceiptFiles([]);
    showNotif("Receipt uploaded!");
  };

  const openInvoice = (masterId, occ) => {
    setInvoiceModal({
      masterId,
      occurrenceId: occ.id,
      cycleLabel: occ.cycleLabel,
    });
    setInvoiceFiles([]);
  };

  const saveInvoice = () => {
    if (!invoiceFiles.length) {
      return showNotif("Please upload invoice file", "error");
    }

    updateOccurrence(invoiceModal.masterId, invoiceModal.occurrenceId, (occ) => ({
      ...occ,
      purchaseInvoices: invoiceFiles.map((f) => ({
        id: f.id || uid(),
        name: f.name,
        size: f.size || 0,
        type: f.type || "",
        downloadUrl: f.downloadUrl || "",
        dataUrl: f.dataUrl || "",
        uploadedAt: f.uploadedAt || today(),
      })),
      history: [
        ...(occ.history || []),
        {
          by: username || "User",
          date: today(),
          note: `Purchase invoice uploaded (${invoiceFiles.length} file${
            invoiceFiles.length !== 1 ? "s" : ""
          })`,
        },
      ],
    }));

    setInvoiceModal(null);
    setInvoiceFiles([]);
    showNotif("Invoice uploaded!");
  };

  const markOccurrencePaid = (masterId, occId) => {
    updateOccurrence(masterId, occId, (occ) => ({
      ...occ,
      status: "paid",
      paymentInfo: {
        date: today(),
        ref: occ.bankRelease?.ref || "",
        method: occ.bankRelease?.method || "",
      },
      history: [
        ...(occ.history || []),
        {
          by: username || "Finance",
          date: today(),
          note: "Monthly occurrence marked as paid",
        },
      ],
    }));

    showNotif("Occurrence marked as paid!");
  };

  const masterBadge = (master) =>
    MASTER_STATUS_META[master.masterStatus] || {
      label: master.masterStatus || "Unknown",
      color: C.muted,
    };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              letterSpacing: 2,
              marginBottom: 3,
            }}
          >
            MANAGEMENT
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Recurring Payments</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {tabItems.length} items in{" "}
            <span style={{ color: C.accent }}>{activeTab}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-ghost" onClick={() => setShowImport(true)}>
            ⬆ Import Excel
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + Add Item
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {CATEGORIES_RECURRING.map((cat) => {
          const s = tabSummary[cat] || {};
          const active = activeTab === cat;

          return (
            <button
              key={cat}
              onClick={() => {
                setActiveTab(cat);
                setFilterStatus("all");
                setSearch("");
              }}
              style={{
                background: active ? C.accentGlow : C.card,
                border: `1px solid ${active ? C.accent + "66" : C.border}`,
                color: active ? C.accent : C.muted,
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {cat}
              <span
                style={{
                  background: active ? C.accent : C.subtle,
                  color: active ? "#fff" : C.muted,
                  borderRadius: 10,
                  padding: "1px 7px",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {s.total || 0}
              </span>
              {s.overdue > 0 && (
                <span
                  style={{
                    background: C.red + "22",
                    color: C.red,
                    borderRadius: 10,
                    padding: "1px 7px",
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  ⚠{s.overdue}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          className="inp"
          placeholder="Search name, account, details..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 270 }}
        />

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["all", "All"],
            ["overdue", "Overdue"],
            ["due14", "Due 14d"],
            ["upcoming", "Upcoming"],
            ["paid", "Paid"],
          ].map(([v, l]) => (
            <button
              key={v}
              className={`tab-btn${filterStatus === v ? " active" : ""}`}
              onClick={() => setFilterStatus(v)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {tabItems.length === 0 && (
          <div
            style={{
              padding: 40,
              textAlign: "center",
              color: C.muted,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
            }}
          >
            No recurring items found in {activeTab}
          </div>
        )}

        {groupKeys.map((gKey) => {
          const items = groups[gKey];
          if (!items?.length) return null;

          const isCollapsed = collapsedGroups[gKey];
          const subColor = SUBCAT_COLORS[gKey] || C.accent;
          const groupOverdue = items.filter(
            (r) => getMasterFilterState(r) === "overdue"
          ).length;

          return (
            <div key={gKey}>
              {gKey && (
                <div
                  onClick={() => toggleGroup(gKey)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: subColor + "15",
                    border: `1px solid ${subColor}33`,
                    borderRadius: 10,
                    marginBottom: 10,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{ fontSize: 13, fontWeight: 700, color: subColor }}
                    >
                      {gKey}
                    </span>
                    <span style={{ fontSize: 11, color: C.muted }}>
                      {items.length} items
                    </span>
                    {groupOverdue > 0 && (
                      <Badge label={`${groupOverdue} overdue`} color={C.red} />
                    )}
                  </div>

                  <span style={{ color: C.muted, fontSize: 14 }}>
                    {isCollapsed ? "▶" : "▼"}
                  </span>
                </div>
              )}

              {!isCollapsed &&
                items.map((master) => {
                  const badge = masterBadge(master);
                  const priority =
                    priorityConfig[master.priority] || priorityConfig.medium;
                  const next = getNextOpenOccurrence(master);
                  const expanded = !!expandedMasters[master.id];
                  const days = next ? daysUntil(next.dueDate) : null;
                  const isOvrd = next && deriveOccurrenceStatus(next) === "overdue";

                  return (
                    <div
                      key={master.id}
                      style={{
                        background: C.card,
                        border: `1px solid ${isOvrd ? C.red + "44" : C.border}`,
                        borderLeft: `4px solid ${isOvrd ? C.red : badge.color}`,
                        borderRadius: 14,
                        padding: "16px 18px",
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 14,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 300 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                              marginBottom: 6,
                            }}
                          >
                            <span style={{ fontSize: 15, fontWeight: 700 }}>
                              {master.title}
                            </span>
                            <Badge label={badge.label} color={badge.color} />
                            <Badge
                              label={priority.label}
                              color={priority.color}
                            />
                            {master.invoices?.length > 0 && (
                              <Badge
                                label={`📎 ${master.invoices.length}`}
                                color={C.muted}
                              />
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: 12,
                              color: C.muted,
                              display: "flex",
                              gap: 10,
                              flexWrap: "wrap",
                              marginBottom: 8,
                            }}
                          >
                            <span>{master.department}</span>
                            <span>·</span>
                            <span>{master.frequency}</span>
                            <span>·</span>
                            <span>Every day {master.dueDay}</span>
                            <span>·</span>
                            
                            <span>·</span>
                            
                            {next && (
                              <>
                                <span>·</span>
                                <span
                                  style={{
                                    color: isOvrd ? C.red : C.gold,
                                    fontWeight: 700,
                                  }}
                                >
                                  Next Due: {fmtDate(next.dueDate)}
                                  {days !== null &&
                                    ` (${days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`})`}
                                </span>
                              </>
                            )}
                          </div>

                          {master.details && (
                            <div
                              style={{
                                fontSize: 12,
                                color: C.text + "88",
                                background: C.subtle,
                                padding: "6px 10px",
                                borderRadius: 8,
                                marginBottom: 8,
                              }}
                            >
                              {master.details}
                            </div>
                          )}

                          {master.notes && (
                            <div
                              style={{
                                fontSize: 11,
                                color: C.gold,
                                marginBottom: 8,
                              }}
                            >
                              ⚠ {master.notes}
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <button
                              className="tab-btn"
                              onClick={() => toggleMaster(master.id)}
                            >
                              {expanded ? "▲ Hide Months" : "▼ View Months"}
                            </button>

                            <button
                              className="btn-ghost"
                              onClick={() => deleteItem(master.id)}
                              style={{
                                color: C.red,
                                borderColor: C.red + "33",
                              }}
                            >
                              ✕ Delete
                            </button>
                          </div>
                        </div>

                        <div style={{ textAlign: "right", minWidth: 140 }}>
                          <div
                            style={{
                              fontSize: 20,
                              fontWeight: 800,
                              fontFamily: "monospace",
                            }}
                          >
                            {master.currency} {fmtAmt(master.amount)}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted }}>
                            {master.licenses} seat
                            {master.licenses !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>

                      {expanded && (
                        <div
                          style={{
                            marginTop: 16,
                            borderTop: `1px solid ${C.border}`,
                            paddingTop: 14,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 11,
                              color: C.muted,
                              letterSpacing: 1,
                              fontWeight: 700,
                              marginBottom: 10,
                            }}
                          >
                            MONTHLY OCCURRENCES
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            {(master.occurrences || []).map((occ) => {
                              const occStatus = deriveOccurrenceStatus(occ);
                              const occMeta =
                                statusConfig[occStatus] || {
                                  label: occStatus,
                                  color: C.muted,
                                };

                              return (
                                <div
                                  key={occ.id}
                                  style={{
                                    background: C.subtle,
                                    border: `1px solid ${C.border}`,
                                    borderLeft: `4px solid ${occMeta.color}`,
                                    borderRadius: 10,
                                    padding: "12px 14px",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 12,
                                      alignItems: "flex-start",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <div style={{ flex: 1, minWidth: 260 }}>
                                      <div
                                        style={{
                                          display: "flex",
                                          gap: 8,
                                          alignItems: "center",
                                          flexWrap: "wrap",
                                          marginBottom: 6,
                                        }}
                                      >
                                        <span
                                          style={{ fontSize: 13, fontWeight: 700 }}
                                        >
                                          {occ.cycleLabel}
                                        </span>
                                        <Badge
                                          label={occMeta.label}
                                          color={occMeta.color}
                                        />
                                      </div>

                                      <div
                                        style={{
                                          fontSize: 11,
                                          color: C.muted,
                                          display: "flex",
                                          gap: 10,
                                          flexWrap: "wrap",
                                          marginBottom: 6,
                                        }}
                                      >
                                        <span>
                                          Due:{" "}
                                          <strong style={{ color: C.text }}>
                                            {fmtDate(occ.dueDate)}
                                          </strong>
                                        </span>
                                        {occ.originalDueDate &&
                                          occ.originalDueDate !== occ.dueDate && (
                                            <>
                                              <span>·</span>
                                              <span>
                                                Original: {fmtDate(occ.originalDueDate)}
                                              </span>
                                            </>
                                          )}
                                        <span>·</span>
                                        <span>
                                          {occ.currency} {fmtAmt(occ.amount)}
                                        </span>
                                      </div>

                                      {occ.bankRelease && (
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: C.green,
                                            marginBottom: 4,
                                          }}
                                        >
                                          ✓ Released: Ref {occ.bankRelease.ref}
                                        </div>
                                      )}

                                      {occ.receiptUploaded?.files?.length > 0 && (
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: C.green,
                                            marginBottom: 4,
                                          }}
                                        >
                                          ✓ Receipt uploaded
                                        </div>
                                      )}

                                      {occ.purchaseInvoices?.length > 0 && (
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: "#14B8A6",
                                            marginBottom: 4,
                                          }}
                                        >
                                          ✓ Purchase invoice uploaded
                                        </div>
                                      )}
                                    </div>

                                    <div
                                      style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 6,
                                        minWidth: 190,
                                      }}
                                    >
                                      {["upcoming", "overdue", "pending_bank_release"].includes(
                                        occStatus
                                      ) && (
                                        <>
                                          <button
                                            className="btn-primary"
                                            onClick={() => openReschedule(master.id, occ)}
                                          >
                                            📅 Reschedule This Month
                                          </button>

                                          <button
                                            className="btn-primary"
                                            onClick={() => openBankRelease(master.id, occ)}
                                          >
                                            🏦 Release Payment
                                          </button>
                                        </>
                                      )}

                                      {occStatus === "pending_receipt" && (
                                        <button
                                          className="btn-green"
                                          onClick={() => openReceipt(master.id, occ)}
                                        >
                                          📎 Upload Receipt
                                        </button>
                                      )}

                                      {occStatus === "pending_invoice" && (
                                        <>
                                          <button
                                            className="btn-primary"
                                            onClick={() => openInvoice(master.id, occ)}
                                          >
                                            🧾 Upload Invoice
                                          </button>

                                          {occ.purchaseInvoices?.length > 0 && (
                                            <button
                                              className="btn-green"
                                              onClick={() =>
                                                markOccurrencePaid(master.id, occ.id)
                                              }
                                            >
                                              ✅ Mark Paid
                                            </button>
                                          )}
                                        </>
                                      )}

                                      {occStatus === "paid" && (
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: C.green,
                                            fontWeight: 700,
                                          }}
                                        >
                                          ✓ Paid
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              Add Recurring Item
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    NAME *
                  </label>
                  <input
                    className="inp"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="e.g. AWS Subscription"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    CATEGORY
                  </label>
                  <select
                    className="inp"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES_RECURRING.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  DETAILS
                </label>
                <input
                  className="inp"
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  placeholder="Account number, plan, subscription details..."
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    DEPARTMENT
                  </label>
                  <select
                    className="inp"
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    PURPOSE
                  </label>
                  <input
                    className="inp"
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                    placeholder="Purpose of this recurring service"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  SUB-GROUP
                </label>
                <input
                  className="inp"
                  value={form.subcategory}
                  onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                  placeholder="Optional grouping name"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    AMOUNT
                  </label>
                  <input
                    className="inp"
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    CURRENCY
                  </label>
                  <select
                    className="inp"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  >
                    {["SAR", "USD", "EUR", "KWD", "AED"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    SEATS / LINES
                  </label>
                  <input
                    className="inp"
                    type="number"
                    value={form.licenses}
                    onChange={(e) => setForm({ ...form, licenses: e.target.value })}
                    placeholder="1"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    BILLING CYCLE
                  </label>
                  <select
                    className="inp"
                    value={form.frequency}
                    onChange={(e) => setForm({ ...form, frequency: e.target.value })}
                  >
                    {["Monthly", "Quarterly", "Semi-Annual", "Yearly"].map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    START DATE *
                  </label>
                  <input
                    className="inp"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    DUE DAY *
                  </label>
                  <input
                    className="inp"
                    type="number"
                    min="1"
                    max="31"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                    placeholder="27"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    END DATE
                  </label>
                  <input
                    className="inp"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  />
                </div>


              </div>



              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    PRIORITY
                  </label>
                  <select
                    className="inp"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                    MASTER ATTACHMENTS
                  </label>
                  <InvoiceUpload
                    invoices={form.invoices || []}
                    onChange={(files) => setForm({ ...form, invoices: files })}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 5 }}>
                  NOTES
                </label>
                <textarea
                  className="inp"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any additional notes"
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex: 1 }}>
                Add Item
              </button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div
          className="overlay"
          onClick={() => {
            setShowImport(false);
            setImportRows([]);
            setImportDecisions({});
            setImportError("");
          }}
        >
          <div
            className="modal"
            style={{ maxWidth: 760 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 700 }}>
                ⬆ Import from Excel / CSV
              </div>
              <button
                onClick={downloadRecurringTemplate}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 14px",
                  background: "#10B98118",
                  border: "1px solid #10B98144",
                  borderRadius: 8,
                  color: "#10B981",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ⬇ Download Template
              </button>
            </div>

            <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>
              One file can import many recurring master requests. If a duplicate is
              found, choose Skip, Update Existing, or Create New.
            </div>

            <div className="import-zone" onClick={() => fileRef.current?.click()}>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                Click to upload .xlsx, .xls or .csv
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                Each row will create one recurring master request
              </div>
            </div>

            {importError && (
              <div
                style={{
                  color: C.red,
                  fontSize: 12,
                  marginTop: 10,
                  padding: "8px 12px",
                  background: C.red + "11",
                  borderRadius: 6,
                }}
              >
                ⚠ {importError}
              </div>
            )}

            {importRows.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: C.green,
                    fontWeight: 600,
                    marginBottom: 10,
                  }}
                >
                  ✓ {importRows.length} rows detected
                </div>

                <div
                  style={{
                    maxHeight: 320,
                    overflowY: "auto",
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr",
                      gap: 8,
                      padding: "8px 12px",
                      background: "#2A3655",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#6B7A99",
                      letterSpacing: 1,
                    }}
                  >
                    <span>ITEM</span>
                    <span>CATEGORY</span>
                    <span>DEPT</span>
                    <span>AMOUNT</span>
                    <span>DUPLICATE ACTION</span>
                  </div>

                  {importRows.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr",
                        gap: 8,
                        padding: "10px 12px",
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 12,
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{entry.row.title}</div>
                        {entry.duplicateId && (
                          <div style={{ fontSize: 10, color: C.gold }}>
                            Duplicate found: {entry.duplicateTitle}
                          </div>
                        )}
                      </div>
                      <span>{entry.row.category}</span>
                      <span>{entry.row.department}</span>
                      <span style={{ fontFamily: "monospace" }}>
                        {entry.row.currency} {fmtAmt(entry.row.amount)}
                      </span>

                      {entry.duplicateId ? (
                        <select
                          className="inp"
                          value={importDecisions[i] || "skip"}
                          onChange={(e) =>
                            setImportDecisions((p) => ({
                              ...p,
                              [i]: e.target.value,
                            }))
                          }
                        >
                          <option value="skip">Skip</option>
                          <option value="update">Update Existing</option>
                          <option value="create">Create New Anyway</option>
                        </select>
                      ) : (
                        <span style={{ color: C.green, fontWeight: 700 }}>Create</span>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="btn-green" onClick={confirmImport} style={{ flex: 1 }}>
                    Confirm Import
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      setImportRows([]);
                      setImportDecisions({});
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            <button
              className="btn-ghost"
              onClick={() => {
                setShowImport(false);
                setImportRows([]);
                setImportDecisions({});
                setImportError("");
              }}
              style={{ marginTop: 12, width: "100%", textAlign: "center" }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {rescheduleModal && (
        <div className="overlay" onClick={() => setRescheduleModal(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>
              📅 Reschedule This Month
            </div>

            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              {rescheduleModal.cycleLabel}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <input
                className="inp"
                type="date"
                value={rescheduleModal.date}
                onChange={(e) =>
                  setRescheduleModal((p) => ({ ...p, date: e.target.value }))
                }
              />
              <textarea
                className="inp"
                rows={3}
                placeholder="Optional note..."
                value={rescheduleModal.note}
                onChange={(e) =>
                  setRescheduleModal((p) => ({ ...p, note: e.target.value }))
                }
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn-primary" onClick={saveReschedule} style={{ flex: 1 }}>
                Save
              </button>
              <button className="btn-ghost" onClick={() => setRescheduleModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {bankReleaseModal && (
        <div className="overlay" onClick={() => setBankReleaseModal(null)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>
              🏦 Release Payment
            </div>

            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
              {bankReleaseModal.cycleLabel}
            </div>

<div style={{ display: "grid", gap: 12 }}>
  <select
    className="inp"
    value={bankForm.method}
    onChange={(e) => setBankForm({ ...bankForm, method: e.target.value })}
  >
    {["Bank Transfer", "Credit Card", "Cash", "Online Payment", "Cheque"].map((m) => (
      <option key={m} value={m}>
        {m}
      </option>
    ))}
  </select>

  <select
    className="inp"
    value={bankForm.companyName}
    onChange={(e) => setBankForm({ ...bankForm, companyName: e.target.value })}
  >
    {COMPANY_OPTIONS.map((company) => (
      <option key={company} value={company}>
        {company}
      </option>
    ))}
  </select>

  <select
    className="inp"
    value={bankForm.bankName}
    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
  >
    {BANK_OPTIONS.map((bank) => (
      <option key={bank} value={bank}>
        {bank}
      </option>
    ))}
  </select>

  <input
    className="inp"
    value={bankForm.ref}
    onChange={(e) => setBankForm({ ...bankForm, ref: e.target.value })}
    placeholder="Reference number *"
  />

  <input
    className="inp"
    type="date"
    value={bankForm.date}
    onChange={(e) => setBankForm({ ...bankForm, date: e.target.value })}
  />

  <textarea
    className="inp"
    rows={3}
    value={bankForm.note}
    onChange={(e) => setBankForm({ ...bankForm, note: e.target.value })}
    placeholder="Optional note"
  />
</div>

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn-primary" onClick={saveBankRelease} style={{ flex: 1 }}>
                Confirm Release
              </button>
              <button className="btn-ghost" onClick={() => setBankReleaseModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptModal && (
        <div className="overlay" onClick={() => setReceiptModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>
              📎 Upload Receipt
            </div>

            <PayInvoiceUpload payInvoices={receiptFiles} onChange={setReceiptFiles} />

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn-green" onClick={saveReceipt} style={{ flex: 1 }}>
                Upload Receipt
              </button>
              <button className="btn-ghost" onClick={() => setReceiptModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <div className="overlay" onClick={() => setInvoiceModal(null)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14 }}>
              🧾 Upload Purchase Invoice
            </div>

            <InvoiceUpload invoices={invoiceFiles} onChange={setInvoiceFiles} />

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button className="btn-primary" onClick={saveInvoice} style={{ flex: 1 }}>
                Upload Invoice
              </button>
              <button className="btn-ghost" onClick={() => setInvoiceModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecurringView;