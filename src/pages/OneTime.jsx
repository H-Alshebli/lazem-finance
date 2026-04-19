import { useState } from "react";
import {
  C,
  DEPARTMENTS,
  CATEGORIES_ONETIME,
  ROLE_CONFIG,
  statusConfig,
  priorityConfig,
  GENERAL_STEPS,
} from "../utils/constants";
import { uid, daysUntil, fmtDate, fmtAmt, today } from "../utils/helpers";
import Badge from "../components/Badge";
import WorkflowTimeline from "../components/WorkflowTimeline";
import InvoiceUpload from "../components/InvoiceUpload";

// Flow:
// Submit (quotations) → Manager → CEO → Finance → Schedule Payment
// → Bank Release → Receipt Upload → Employee Purchase Invoice → Paid

function OnetimeView({
  onetime,
  setOnetime,
  showNotif,
  userRole,
  username,
  logAction,
  addNotif,
  currentUser,
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [reschedModal, setReschedModal] = useState(null);
  const [invoiceModal, setInvoiceModal] = useState(null);
  const [invoiceFiles, setInvoiceFiles] = useState([]);

  const [form, setForm] = useState({
    title: "",
    category: "Equipment",
    department: "All Company",
    amount: "",
    currency: "SAR",
    priority: "medium",
    dueDate: "",
    notes: "",
    invoices: [],
  });

  const role = ROLE_CONFIG[userRole] || ROLE_CONFIG.staff;
  const isFinance = userRole === "finance" || userRole === "admin";
  const canSeeAll = role.canViewAll;

  const myRequests = canSeeAll
    ? onetime || []
    : (onetime || []).filter(
        (o) => o.submittedBy === username || o.submittedById === currentUser?.uid
      );

  const statusTabs = [
    ["all", "All"],
    ["pending_manager", "Pending Manager"],
    ["pending_ceo_1", "CEO Approval"],
    ["pending_finance", "Finance Approval"],
    ["pending_schedule", "Schedule Payment"],
    ["pending_bank", "Bank Release"],
    ["pending_receipt", "Upload Receipt"],
    ["pending_invoice", "Upload Invoice"],
    ["paid_onetime", "Paid"],
    ["rejected", "Rejected"],
  ];

  const filtered =
    filterStatus === "all"
      ? myRequests
      : myRequests.filter((o) => o.status === filterStatus);

  const resetForm = () => {
    setForm({
      title: "",
      category: "Equipment",
      department: "All Company",
      amount: "",
      currency: "SAR",
      priority: "medium",
      dueDate: "",
      notes: "",
      invoices: [],
    });
  };

  const addItem = () => {
    if (!form.title.trim() || !form.amount) {
      return showNotif("Title and Amount required", "error");
    }

    const newItem = {
      ...form,
      id: uid(),
      amount: +form.amount,
      submittedBy: username,
      submittedById: currentUser?.uid,
      requestDate: today(),
      status: "pending_manager",
      history: [
        {
          status: "pending_manager",
          by: username,
          date: today(),
          note: "Request submitted with quotations",
        },
      ],
      managerApproval: null,
      ceo1Approval: null,
      financeApproval: null,
      paymentSchedule: null,
      bankRelease: null,
      receiptUploaded: null,
      purchaseInvoices: [],
    };

    setOnetime((p) => [newItem, ...(p || [])]);
    setShowAdd(false);
    resetForm();

    if (logAction) {
      logAction(
        "create",
        "one-time",
        newItem.id,
        form.title,
        `${form.category} · ${form.department}`,
        +form.amount
      );
    }

    if (addNotif) {
      addNotif(
        "new_submission",
        `New Request: ${form.title}`,
        `Submitted by ${username} — awaiting Manager approval`
      );
    }

    showNotif("Request submitted for Manager approval!");
  };

  const saveNote = () => {
    if (!noteModal?.note?.trim()) return;

    setOnetime((p) =>
      p.map((o) =>
        o.id === noteModal.id
          ? {
              ...o,
              notes: noteModal.note,
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `Note: ${noteModal.note}`,
                },
              ],
            }
          : o
      )
    );

    setNoteModal(null);
    showNotif("Note saved!");
  };

  const reschedule = () => {
    if (!reschedModal?.date) return;

    setOnetime((p) =>
      p.map((o) =>
        o.id === reschedModal.id
          ? {
              ...o,
              dueDate: reschedModal.date,
              history: [
                ...(o.history || []),
                {
                  status: o.status,
                  by: username,
                  date: today(),
                  note: `Due date rescheduled to ${reschedModal.date}`,
                },
              ],
            }
          : o
      )
    );

    setReschedModal(null);
    showNotif("Due date updated!");
  };

  const uploadPurchaseInvoice = () => {
    if (!invoiceFiles.length) {
      return showNotif("Please upload at least one invoice file", "error");
    }

    setOnetime((p) =>
      p.map((o) =>
        o.id === invoiceModal
          ? {
              ...o,
              purchaseInvoices: invoiceFiles.map((f) => ({
                id: f.id || uid(),
                name: f.name || "",
                size: f.size || 0,
                type: f.type || "",
                uploadedAt: f.uploadedAt || today(),
                downloadUrl: f.downloadUrl || "",
                dataUrl: f.dataUrl || "",
              })),
              history: [
                ...(o.history || []),
                {
                  status: "pending_invoice",
                  by: username,
                  date: today(),
                  note: `Purchase invoice uploaded (${invoiceFiles.length} file${
                    invoiceFiles.length !== 1 ? "s" : ""
                  }) — Finance will close`,
                },
              ],
            }
          : o
      )
    );

    setInvoiceModal(null);
    setInvoiceFiles([]);

    if (addNotif) {
      addNotif(
        "approval_required",
        "Purchase Invoice Received",
        `Employee uploaded invoice — please review and close`
      );
    }

    showNotif("Invoice uploaded! Finance will close your request.");
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
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
            REQUESTS
          </div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            One-Time Requests
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {canSeeAll
              ? `Showing all ${(onetime || []).length} requests`
              : `Your ${myRequests.length} request${myRequests.length !== 1 ? "s" : ""}`}
          </div>
        </div>

        {role.canSubmit && (
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            + New Request
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {statusTabs.map(([v, l]) => {
          const count = myRequests.filter((o) => o.status === v).length;

          return (
            <button
              key={v}
              className={`tab-btn${filterStatus === v ? " active" : ""}`}
              onClick={() => setFilterStatus(v)}
            >
              {l}
              {v !== "all" && count > 0 && (
                <span
                  style={{
                    marginLeft: 5,
                    background: C.accent + "44",
                    color: C.accent,
                    borderRadius: 8,
                    padding: "0 5px",
                    fontSize: 10,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ color: C.muted, textAlign: "center", padding: 40 }}>
            {canSeeAll
              ? "No requests found"
              : "You haven't submitted any requests yet"}
          </div>
        )}

        {filtered.map((r) => {
          const sc = statusConfig[r.status] || { label: r.status, color: C.muted };
          const pc = priorityConfig[r.priority] || priorityConfig.medium;
          const isOverdue =
            r.dueDate &&
            daysUntil(r.dueDate) < 0 &&
            !["paid_onetime", "rejected"].includes(r.status);
          const expanded = expandedId === r.id;
          const isMyReq =
            r.submittedBy === username || r.submittedById === currentUser?.uid;
          const inPayment = [
            "pending_schedule",
            "pending_bank",
            "pending_receipt",
          ].includes(r.status);
          const awaitingMyInvoice = isMyReq && r.status === "pending_invoice";

          return (
            <div
              key={r.id}
              style={{
                background: C.card,
                borderRadius: 14,
                padding: "18px 20px",
                border: `1px solid ${
                  awaitingMyInvoice
                    ? "#14B8A644"
                    : isOverdue
                    ? C.red + "55"
                    : sc.color + "33"
                }`,
                borderLeft: `4px solid ${awaitingMyInvoice ? "#14B8A6" : sc.color}`,
              }}
            >
              <WorkflowTimeline status={r.status} steps={GENERAL_STEPS} />

              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</span>
                    {isOverdue && <Badge label="Overdue" color={C.red} />}
                    <Badge label={sc.label} color={sc.color} />
                    <Badge label={pc.label} color={pc.color} />
                    {r.invoices?.length > 0 && (
                      <Badge label={`📎 ${r.invoices.length}`} color={C.muted} />
                    )}
                    {r.purchaseInvoices?.length > 0 && (
                      <Badge label={`🧾 ${r.purchaseInvoices.length}`} color="#14B8A6" />
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: C.muted,
                      marginBottom: 8,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{r.department}</span>
                    <span>·</span>
                    <span>{r.category}</span>
                    <span>·</span>
                    <span>
                      By: <strong style={{ color: C.text }}>{r.submittedBy}</strong>
                    </span>
                    <span>·</span>
                    <span>{fmtDate(r.requestDate)}</span>
                    {r.dueDate && (
                      <>
                        <span>·</span>
                        <span
                          style={{
                            color: isOverdue ? C.red : C.gold,
                            fontWeight: 600,
                          }}
                        >
                          Due: {fmtDate(r.dueDate)}
                        </span>
                      </>
                    )}
                  </div>

                  {r.notes && (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.text + "99",
                        background: C.subtle,
                        padding: "7px 12px",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      📝 {r.notes}
                    </div>
                  )}

                  {r.rejectionReason && (
                    <div
                      style={{
                        fontSize: 12,
                        color: C.red,
                        background: C.red + "11",
                        border: `1px solid ${C.red}33`,
                        padding: "7px 12px",
                        borderRadius: 8,
                        marginBottom: 8,
                      }}
                    >
                      ❌ {r.rejectionReason}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                      fontSize: 11,
                      marginTop: 4,
                      marginBottom: 8,
                    }}
                  >
                    {[["Manager", r.managerApproval], ["CEO", r.ceo1Approval]].map(
                      ([l, a]) => (
                        <span key={l} style={{ color: a ? C.green : C.muted }}>
                          {a ? `✓ ${l}: ${a.by} (${fmtDate(a.date)})` : `○ ${l}`}
                        </span>
                      )
                    )}

                    {r.paymentSchedule && (
                      <span style={{ color: C.green }}>
                        ✓ Scheduled: {fmtDate(r.paymentSchedule.date)} ·{" "}
                        {r.paymentSchedule.method}
                      </span>
                    )}

                    {r.bankRelease && (
                      <span style={{ color: C.green }}>
                        ✓ Released: Ref {r.bankRelease.ref}
                      </span>
                    )}

                    {r.receiptUploaded && (
                      <span style={{ color: C.green }}>✓ Receipt uploaded</span>
                    )}

                    {r.purchaseInvoices?.length > 0 && (
                      <span style={{ color: "#14B8A6" }}>
                        ✓ Invoice submitted ({r.purchaseInvoices.length} file
                        {r.purchaseInvoices.length !== 1 ? "s" : ""})
                      </span>
                    )}
                  </div>

                  {r.receiptUploaded?.files?.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.green,
                        marginBottom: 8,
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span>📎 Payment Receipt:</span>
                      {r.receiptUploaded.files.map((f) => {
                        const fileUrl = f.downloadUrl || f.dataUrl;

                        return fileUrl ? (
                          <a
                            key={f.id || f.name}
                            href={fileUrl}
                            download={f.name}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              background: C.green + "12",
                              border: `1px solid ${C.green}33`,
                              borderRadius: 5,
                              padding: "2px 8px",
                              color: C.green,
                              textDecoration: "none",
                            }}
                          >
                            ⬇ {f.name}
                          </a>
                        ) : (
                          <span
                            key={f.id || f.name}
                            style={{
                              background: C.green + "12",
                              border: `1px solid ${C.green}33`,
                              borderRadius: 5,
                              padding: "2px 8px",
                              color: C.muted,
                            }}
                          >
                            📄 {f.name}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {isMyReq && inPayment && (
                    <div
                      style={{
                        padding: "8px 12px",
                        background: C.purple + "12",
                        border: `1px solid ${C.purple}33`,
                        borderRadius: 8,
                        fontSize: 11,
                        color: C.purple,
                        marginBottom: 8,
                      }}
                    >
                      ⏳ Payment is being processed by Finance — you will be notified
                      when it is released
                    </div>
                  )}

                  {awaitingMyInvoice && (
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "#14B8A612",
                        border: `1px solid #14B8A644`,
                        borderRadius: 10,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#14B8A6",
                          marginBottom: 4,
                        }}
                      >
                        💰 Your payment has been released!
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: C.muted,
                          marginBottom: 10,
                        }}
                      >
                        Please purchase the item and upload your invoice below to
                        complete this request.
                      </div>
                      <button
                        onClick={() => {
                          setInvoiceModal(r.id);
                          setInvoiceFiles([]);
                        }}
                        style={{
                          background: "#14B8A6",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 20px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        ⬆ Upload Purchase Invoice
                      </button>
                    </div>
                  )}

                  {r.status === "paid_onetime" && r.paymentInfo && (
                    <div
                      style={{
                        fontSize: 11,
                        color: C.green,
                        background: C.green + "12",
                        border: `1px solid ${C.green}33`,
                        borderRadius: 8,
                        padding: "7px 12px",
                        marginBottom: 8,
                      }}
                    >
                      ✅ Paid {fmtDate(r.paymentInfo.date)} · Ref: {r.paymentInfo.ref}
                    </div>
                  )}

                  {expanded && r.history?.length > 0 && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 12px",
                        background: C.subtle,
                        borderRadius: 10,
                        border: `1px solid ${C.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.muted,
                          letterSpacing: 1,
                          marginBottom: 8,
                        }}
                      >
                        ACTIVITY HISTORY
                      </div>

                      {[...(r.history || [])].reverse().map((h, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 10,
                            fontSize: 11,
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ color: C.muted, whiteSpace: "nowrap" }}>
                            {fmtDate(h.date)}
                          </span>
                          <span style={{ color: C.accent }}>{h.by}</span>
                          <span style={{ color: C.text }}>{h.note}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      className="tab-btn"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      style={{ fontSize: 11, padding: "5px 12px" }}
                    >
                      {expanded ? "▲ Hide" : "▼ History"}
                    </button>

                    <button
                      onClick={() => setNoteModal({ id: r.id, note: r.notes || "" })}
                      style={{
                        fontSize: 11,
                        padding: "5px 12px",
                        background: C.subtle,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        color: C.text,
                        cursor: "pointer",
                      }}
                    >
                      📝 Note
                    </button>

                    {(isMyReq || isFinance) &&
                      !["paid_onetime", "rejected"].includes(r.status) && (
                        <button
                          onClick={() =>
                            setReschedModal({ id: r.id, date: r.dueDate || "" })
                          }
                          style={{
                            fontSize: 11,
                            padding: "5px 12px",
                            background: C.subtle,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            color: C.gold,
                            cursor: "pointer",
                          }}
                        >
                          📅 Reschedule
                        </button>
                      )}
                  </div>
                </div>

                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 120 }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: "monospace",
                    }}
                  >
                    {r.currency || "SAR"} {fmtAmt(r.amount)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div
            className="modal"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
              New One-Time Request
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Flow: Manager → CEO → Finance → Schedule payment → Bank release →
              Receipt upload → Employee uploads invoice → Paid
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  TITLE *
                </label>
                <input
                  className="inp"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Laptop for IT team"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    CATEGORY
                  </label>
                  <select
                    className="inp"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  >
                    {CATEGORIES_ONETIME.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
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
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
                    AMOUNT *
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
                  <label
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
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
                  <label
                    style={{
                      fontSize: 11,
                      color: C.muted,
                      display: "block",
                      marginBottom: 5,
                    }}
                  >
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
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  PAYMENT DUE DATE
                </label>
                <input
                  className="inp"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  NOTES / JUSTIFICATION
                </label>
                <textarea
                  className="inp"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Why is this needed? Add context or specs..."
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 5,
                  }}
                >
                  PRICE QUOTATIONS / ATTACHMENTS
                </label>
                <InvoiceUpload
                  invoices={form.invoices || []}
                  onChange={(invs) => setForm((f) => ({ ...f, invoices: invs }))}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn-primary" onClick={addItem} style={{ flex: 1 }}>
                Submit Request
              </button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {noteModal && (
        <div className="overlay" onClick={() => setNoteModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
              📝 Add / Edit Note
            </div>
            <textarea
              className="inp"
              rows={4}
              value={noteModal.note}
              onChange={(e) => setNoteModal({ ...noteModal, note: e.target.value })}
              placeholder="Note visible to all reviewers..."
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn-primary" onClick={saveNote} style={{ flex: 1 }}>
                Save
              </button>
              <button className="btn-ghost" onClick={() => setNoteModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {reschedModal && (
        <div className="overlay" onClick={() => setReschedModal(null)}>
          <div
            className="modal"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
              📅 Reschedule Due Date
            </div>
            <input
              className="inp"
              type="date"
              value={reschedModal.date}
              onChange={(e) => setReschedModal({ ...reschedModal, date: e.target.value })}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button className="btn-primary" onClick={reschedule} style={{ flex: 1 }}>
                Update
              </button>
              <button className="btn-ghost" onClick={() => setReschedModal(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <div
          className="overlay"
          onClick={() => {
            setInvoiceModal(null);
            setInvoiceFiles([]);
          }}
        >
          <div
            className="modal"
            style={{ maxWidth: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 17,
                fontWeight: 700,
                marginBottom: 4,
                color: "#14B8A6",
              }}
            >
              ⬆ Upload Purchase Invoice
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
              Upload the invoice/receipt from your purchase. Finance will review
              and close the request.
            </div>

            <InvoiceUpload invoices={invoiceFiles} onChange={setInvoiceFiles} />

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                className="btn-primary"
                onClick={uploadPurchaseInvoice}
                style={{ flex: 1, opacity: invoiceFiles.length ? 1 : 0.5 }}
              >
                Submit ({invoiceFiles.length} file{invoiceFiles.length !== 1 ? "s" : ""})
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setInvoiceModal(null);
                  setInvoiceFiles([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OnetimeView;