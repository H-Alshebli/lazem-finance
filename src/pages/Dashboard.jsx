import { useMemo, useState } from "react";
import { C } from "../utils/constants";
import { fmtAmt } from "../utils/helpers";

function Dashboard({
  recurring = [],
  onetime = [],
  overdueCount = 0,
  highPriority = 0,
  dueThisWeek = 0,
  totalPendingApproval = 0,
  setView,
}) {
  const [activeTab, setActiveTab] = useState("overview");

  const money = (amount) => Number(amount || 0);

  const safeDate = (value) => {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    if (value instanceof Date) return value;

    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const fmtDate = (value) => {
    const d = safeDate(value);
    if (!d) return "-";

    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const diffDaysFromToday = (value) => {
    const d = safeDate(value);
    if (!d) return null;

    const now = new Date();
    const todayDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    return Math.ceil((targetDate - todayDate) / (1000 * 60 * 60 * 24));
  };

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");

  const getScheduleDate = (r) =>
    r.financeSchedule?.approvedDate ||
    r.financeSchedule?.date ||
    r.financeSchedule?.scheduledDate ||
    r.financeSchedule?.approvedPaymentDate ||
    r.financeSchedule?.paymentDate ||
    r.paymentInfo?.approvedDate ||
    r.paymentInfo?.scheduledDate ||
    r.paymentInfo?.paymentDate ||
    r.requestedPaymentDate ||
    r.dueDate ||
    null;

  const getPaymentMethod = (r) =>
    r.financeSchedule?.method ||
    r.financeSchedule?.paymentMethod ||
    r.financeSchedule?.paymentMethodLabel ||
    r.paymentInfo?.method ||
    r.paymentInfo?.paymentMethod ||
    r.paymentInfo?.paymentMethodLabel ||
    (r.status === "pending_schedule_preparation" ? "To Be Scheduled" : "Not Set");

  const getBankName = (r) =>
    r.financeSchedule?.bankName ||
    r.financeSchedule?.bank ||
    r.financeSchedule?.bankLabel ||
    r.paymentInfo?.bankName ||
    r.paymentInfo?.bank ||
    r.paymentInfo?.bankLabel ||
    (r.status === "pending_schedule_preparation" ? "To Be Scheduled" : "Not Set");

  const getCompanyName = (r) =>
    r.financeSchedule?.companyName ||
    r.financeSchedule?.company ||
    r.financeSchedule?.companyLabel ||
    r.paymentInfo?.companyName ||
    r.paymentInfo?.company ||
    r.paymentInfo?.companyLabel ||
    r.companyName ||
    r.company ||
    r.paymentCompany ||
    r.bankRelease?.companyName ||
    r.bankRelease?.company ||
    (r.status === "pending_schedule_preparation" ? "To Be Scheduled" : "Not Set");

  const getStatusLabel = (status) => {
    const labels = {
      pending_manager: "Manager Approval",
      pending_ceo_1: "CEO Approval",
      pending_finance: "Finance Approval",
      pending_schedule_preparation: "Schedule Preparation",
      pending_schedule_review: "Schedule Review",
      pending_schedule_final_approval: "Final Schedule Approval",
      pending_bank_release: "Bank Release",
      pending_receipt: "Receipt Upload",
      pending_invoice: "Employee Invoice",
      paid_onetime: "Paid",
      rejected: "Rejected",
    };

    return labels[status] || status || "Unknown";
  };

  const getFlowText = (r) => {
    const status = normalizeText(r.status);

    const stage = normalizeText(
      r.stage ||
        r.currentStage ||
        r.workflowStage ||
        r.level ||
        r.currentLevel
    );

    const label = normalizeText(
      r.statusLabel ||
        r.stageLabel ||
        r.workflowLabel ||
        r.levelLabel ||
        r.stepLabel ||
        r.currentStep
    );

    return `${status} ${stage} ${label}`;
  };

  const isFinanceApproved = (r) => {
    const status = normalizeText(r.status);
    const value = getFlowText(r);

    return (
      [
        "pending_schedule_preparation",
        "pending_schedule_review",
        "pending_schedule_final_approval",
        "pending_bank_release",
        "schedule_preparation",
        "schedule_review",
        "schedule_final_approval",
        "bank_release",
      ].includes(status) ||
      value.includes("schedule_preparation") ||
      value.includes("schedule_review") ||
      value.includes("schedule_final_approval") ||
      value.includes("bank_release")
    );
  };

  const isReleasedOrClosed = (r) => {
    const status = normalizeText(r.status);
    const value = getFlowText(r);

    return (
      status.includes("pending_receipt") ||
      status.includes("pending_invoice") ||
      status.includes("paid") ||
      status.includes("rejected") ||
      value.includes("receipt") ||
      value.includes("invoice") ||
      value.includes("paid") ||
      value.includes("rejected") ||
      !!r.bankRelease?.releasedAt ||
      !!r.bankRelease?.date ||
      !!r.bankRelease?.by ||
      r.bankRelease === true
    );
  };

  const isPendingAmountItem = (r) => {
    if (!r) return false;
    if (isReleasedOrClosed(r)) return false;
    return isFinanceApproved(r);
  };

  const isOverdueItem = (r) => {
    if (!isPendingAmountItem(r)) return false;

    const d = diffDaysFromToday(getScheduleDate(r));
    return d !== null && d < 0;
  };

  const activeStatuses = [
    "pending_manager",
    "pending_ceo_1",
    "pending_finance",
    "pending_schedule_preparation",
    "pending_schedule_review",
    "pending_schedule_final_approval",
    "pending_bank_release",
    "pending_receipt",
    "pending_invoice",
  ];

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "companies", label: "Companies" },
    { id: "banks", label: "Banks" },
    { id: "departments", label: "Departments" },
    { id: "explorer", label: "Explorer" },
  ];

  const dashboardStats = useMemo(() => {
    const totalRequests = onetime.length;

    const paidRequests = onetime.filter((r) => r.status === "paid_onetime");
    const rejectedRequests = onetime.filter((r) => r.status === "rejected");
    const activeRequests = onetime.filter((r) =>
      activeStatuses.includes(r.status)
    );

    const pendingAmountRequests = onetime.filter((r) => isPendingAmountItem(r));
    const overdueRequests = onetime.filter((r) => isOverdueItem(r));

    const totalRequested = onetime.reduce((sum, r) => sum + money(r.amount), 0);
    const totalPaid = paidRequests.reduce((sum, r) => sum + money(r.amount), 0);
    const totalRejected = rejectedRequests.reduce((sum, r) => sum + money(r.amount), 0);
    const totalPendingAmount = pendingAmountRequests.reduce(
      (sum, r) => sum + money(r.amount),
      0
    );
    const totalOverdueAmount = overdueRequests.reduce(
      (sum, r) => sum + money(r.amount),
      0
    );

    const dueToday = onetime.filter((r) => {
      if (!isPendingAmountItem(r)) return false;
      const d = diffDaysFromToday(getScheduleDate(r));
      return d === 0;
    });

    const dueThisWeekItems = onetime.filter((r) => {
      if (!isPendingAmountItem(r)) return false;
      const d = diffDaysFromToday(getScheduleDate(r));
      return d !== null && d >= 0 && d <= 7;
    });

    const dueThisMonth = onetime.filter((r) => {
      if (!isPendingAmountItem(r)) return false;
      const d = diffDaysFromToday(getScheduleDate(r));
      return d !== null && d >= 0 && d <= 30;
    });

    const missingQuotation = onetime.filter(
      (r) => !Array.isArray(r.invoices) || r.invoices.length === 0
    ).length;

    const missingReceipt = onetime.filter(
      (r) =>
        ["pending_receipt", "pending_invoice", "paid_onetime"].includes(
          r.status
        ) && !r.receiptUploaded
    ).length;

    const missingPurchaseInvoice = onetime.filter(
      (r) =>
        ["pending_invoice", "paid_onetime"].includes(r.status) &&
        (!Array.isArray(r.purchaseInvoices) ||
          r.purchaseInvoices.length === 0)
    ).length;

    const deptTotals = {};
    const categoryTotals = {};
    const methodTotals = {};
    const bankTotals = {};
    const companyTotals = {};

    const companyRows = {};
    const bankRows = {};
    const departmentRows = {};

    const addRow = (map, key, r) => {
      if (!map[key]) {
        map[key] = {
          name: key,
          requests: 0,
          totalAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          rejectedAmount: 0,
          overdueAmount: 0,
          activeAmount: 0,
          pendingCount: 0,
          paidCount: 0,
          rejectedCount: 0,
          overdueCount: 0,
          activeCount: 0,
          items: [],
        };
      }

      map[key].requests += 1;
      map[key].totalAmount += money(r.amount);
      map[key].items.push(r);

      if (r.status === "paid_onetime") {
        map[key].paidAmount += money(r.amount);
        map[key].paidCount += 1;
      } else if (r.status === "rejected") {
        map[key].rejectedAmount += money(r.amount);
        map[key].rejectedCount += 1;
      } else {
        map[key].activeAmount += money(r.amount);
        map[key].activeCount += 1;

        if (isPendingAmountItem(r)) {
          map[key].pendingAmount += money(r.amount);
          map[key].pendingCount += 1;
        }

        if (isOverdueItem(r)) {
          map[key].overdueAmount += money(r.amount);
          map[key].overdueCount += 1;
        }
      }
    };

    onetime.forEach((r) => {
      const dept = r.department || "Unassigned";
      const category = r.category || "Uncategorized";
      const method = getPaymentMethod(r);
      const bank = getBankName(r);
      const company = getCompanyName(r);

      deptTotals[dept] = (deptTotals[dept] || 0) + money(r.amount);
      categoryTotals[category] = (categoryTotals[category] || 0) + money(r.amount);
      methodTotals[method] = (methodTotals[method] || 0) + money(r.amount);
      bankTotals[bank] = (bankTotals[bank] || 0) + money(r.amount);
      companyTotals[company] = (companyTotals[company] || 0) + money(r.amount);

      addRow(companyRows, company, r);
      addRow(bankRows, bank, r);
      addRow(departmentRows, dept, r);
    });

    return {
      totalRequests,
      totalRequested,

      totalPaid,
      paidCount: paidRequests.length,

      totalRejected,
      rejectedCount: rejectedRequests.length,

      totalPendingAmount,
      pendingCount: pendingAmountRequests.length,

      totalOverdueAmount,
      overdueCount: overdueRequests.length,

      activeCount: activeRequests.length,

      dueTodayCount: dueToday.length,
      dueTodayAmount: dueToday.reduce((sum, r) => sum + money(r.amount), 0),

      dueThisWeekCount: dueThisWeekItems.length,
      dueThisWeekAmount: dueThisWeekItems.reduce(
        (sum, r) => sum + money(r.amount),
        0
      ),

      dueThisMonthCount: dueThisMonth.length,
      dueThisMonthAmount: dueThisMonth.reduce(
        (sum, r) => sum + money(r.amount),
        0
      ),

      missingQuotation,
      missingReceipt,
      missingPurchaseInvoice,

      deptTotals: Object.entries(deptTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),

      categoryTotals: Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),

      methodTotals: Object.entries(methodTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),

      bankTotals: Object.entries(bankTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),

      companyTotals: Object.entries(companyTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),

      companyRows: Object.values(companyRows).sort(
        (a, b) => b.totalAmount - a.totalAmount
      ),

      bankRows: Object.values(bankRows).sort(
        (a, b) => b.totalAmount - a.totalAmount
      ),

      departmentRows: Object.values(departmentRows).sort(
        (a, b) => b.totalAmount - a.totalAmount
      ),
    };
  }, [onetime]);

  const barColors = [
    C.accent,
    C.green,
    C.orange,
    C.gold,
    C.purple,
    C.red,
    "#06B6D4",
  ];

  const Card = ({ label, val, sub, color, click }) => (
    <div
      onClick={click}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: click ? "pointer" : "default",
        minHeight: 92,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: C.muted,
          letterSpacing: 1,
          fontWeight: 700,
          marginBottom: 6,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color,
          fontFamily: "monospace",
          lineHeight: 1.1,
        }}
      >
        {val}
      </div>

      <div
        style={{
          fontSize: 11,
          color: C.muted,
          marginTop: 7,
        }}
      >
        {sub}
      </div>
    </div>
  );

  const Panel = ({ title, subtitle, children }) => (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: C.muted,
            letterSpacing: 1,
            marginBottom: 4,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>

        {subtitle && (
          <div style={{ fontSize: 11, color: C.muted }}>{subtitle}</div>
        )}
      </div>

      {children}
    </div>
  );

  const Empty = ({ text }) => (
    <div
      style={{
        color: C.muted,
        fontSize: 13,
        padding: "10px 0",
      }}
    >
      ✓ {text}
    </div>
  );

  const MiniBar = ({ label, amount, max, color, suffix }) => (
    <div style={{ marginBottom: 11 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          marginBottom: 5,
          gap: 12,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 600,
          }}
        >
          {label}
        </span>

        <span
          style={{
            color: C.muted,
            fontFamily: "monospace",
            flexShrink: 0,
          }}
        >
          {suffix || `SAR ${fmtAmt(Math.round(amount))}`}
        </span>
      </div>

      <div style={{ height: 6, background: C.subtle, borderRadius: 4 }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min((amount / max) * 100, 100)}%`,
            background: color,
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );

  const Tabs = () => (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 20,
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 10,
        overflowX: "auto",
      }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: active ? C.accent : C.card,
              color: active ? "#fff" : C.muted,
              border: `1px solid ${active ? C.accent : C.border}`,
              borderRadius: 10,
              padding: "9px 14px",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const AnalysisTable = ({ rows, titleName }) => (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
              {titleName}
            </th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
              Requests
            </th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
              Total
            </th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
              Pending Amount
            </th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
              Paid
            </th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
              Rejected
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan="6" style={{ padding: 14, color: C.muted }}>
                No data yet
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.name}>
                <td
                  style={{
                    padding: "11px 8px",
                    borderBottom: `1px solid ${C.border}`,
                    fontWeight: 700,
                  }}
                >
                  {row.name}
                </td>

                <td style={{ padding: "11px 8px", borderBottom: `1px solid ${C.border}` }}>
                  {row.requests}
                </td>

                <td
                  style={{
                    padding: "11px 8px",
                    borderBottom: `1px solid ${C.border}`,
                    fontFamily: "monospace",
                    color: C.accent,
                    fontWeight: 800,
                  }}
                >
                  SAR {fmtAmt(Math.round(row.totalAmount))}
                </td>

                <td
                  style={{
                    padding: "11px 8px",
                    borderBottom: `1px solid ${C.border}`,
                    fontFamily: "monospace",
                    color: C.gold,
                    fontWeight: 800,
                  }}
                >
                  SAR {fmtAmt(Math.round(row.pendingAmount))}
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {row.pendingCount} awaiting release
                  </div>
                </td>

                <td
                  style={{
                    padding: "11px 8px",
                    borderBottom: `1px solid ${C.border}`,
                    fontFamily: "monospace",
                    color: C.green,
                    fontWeight: 800,
                  }}
                >
                  SAR {fmtAmt(Math.round(row.paidAmount))}
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {row.paidCount} requests
                  </div>
                </td>

                <td
                  style={{
                    padding: "11px 8px",
                    borderBottom: `1px solid ${C.border}`,
                    fontFamily: "monospace",
                    color: C.red,
                    fontWeight: 800,
                  }}
                >
                  SAR {fmtAmt(Math.round(row.rejectedAmount))}
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {row.rejectedCount} requests
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const RequestDetailsTable = ({ items }) => (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
        }}
      >
        <thead>
          <tr style={{ color: C.muted, textAlign: "left" }}>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Request</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Department</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Category</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Bank</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Method</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Amount</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Status</th>
            <th style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>Date</th>
          </tr>
        </thead>

        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td
                style={{
                  padding: "10px 8px",
                  borderBottom: `1px solid ${C.border}`,
                  fontWeight: 700,
                }}
              >
                {r.title || r.category || "Untitled"}
              </td>

              <td style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
                {r.department || "-"}
              </td>

              <td style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
                {r.category || "-"}
              </td>

              <td style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
                {getBankName(r)}
              </td>

              <td style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
                {getPaymentMethod(r)}
              </td>

              <td
                style={{
                  padding: "10px 8px",
                  borderBottom: `1px solid ${C.border}`,
                  color: C.accent,
                  fontFamily: "monospace",
                  fontWeight: 800,
                }}
              >
                {r.currency || "SAR"} {fmtAmt(Math.round(money(r.amount)))}
              </td>

              <td style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
                {getStatusLabel(r.status)}
              </td>

              <td style={{ padding: "10px 8px", borderBottom: `1px solid ${C.border}` }}>
                {fmtDate(getScheduleDate(r))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

const GroupDetails = ({ rows, groupLabel = "Group" }) => (
  <div style={{ display: "grid", gap: 16 }}>
    {rows.length === 0 ? (
      <Empty text={`No ${groupLabel.toLowerCase()} data yet`} />
    ) : (
      rows.map((group) => (
        <div
          key={group.name}
          style={{
            background: C.subtle,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 10,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                {group.name}
              </div>

              <div style={{ fontSize: 11, color: C.muted }}>
                {group.requests} requests · {group.pendingCount} awaiting
                release · {group.paidCount} paid
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontSize: 18,
                  color: C.accent,
                  fontWeight: 900,
                  fontFamily: "monospace",
                }}
              >
                SAR {fmtAmt(Math.round(group.totalAmount))}
              </div>

              <div style={{ fontSize: 11, color: C.muted }}>
                Total amount
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Card
              label="Pending Amount"
              val={`SAR ${fmtAmt(Math.round(group.pendingAmount))}`}
              sub={`${group.pendingCount} awaiting release`}
              color={C.gold}
            />

            <Card
              label="Paid"
              val={`SAR ${fmtAmt(Math.round(group.paidAmount))}`}
              sub={`${group.paidCount} requests`}
              color={C.green}
            />

            <Card
              label="Overdue"
              val={`SAR ${fmtAmt(Math.round(group.overdueAmount))}`}
              sub={`${group.overdueCount} overdue requests`}
              color={C.red}
            />
          </div>

          <RequestDetailsTable items={group.items || []} />
        </div>
      ))
    )}
  </div>
);

  const maxDept = dashboardStats.deptTotals[0]?.[1] || 1;
  const maxCategory = dashboardStats.categoryTotals[0]?.[1] || 1;
  const maxMethod = dashboardStats.methodTotals[0]?.[1] || 1;
  const maxBank = dashboardStats.bankTotals[0]?.[1] || 1;
  const maxCompany = dashboardStats.companyTotals[0]?.[1] || 1;

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 10,
            color: C.muted,
            letterSpacing: 2,
            marginBottom: 4,
            fontWeight: 700,
          }}
        >
          FINANCE DASHBOARD
        </div>

        <div style={{ fontSize: 26, fontWeight: 800 }}>Finance Overview</div>

        <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          One-time payment requests, due payments, attachments, and payment breakdown
        </div>
      </div>

      <Tabs />

      {activeTab === "overview" && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: 13,
              marginBottom: 22,
            }}
          >
            <Card
              label="One-Time Requests"
              val={dashboardStats.totalRequests}
              sub="Total submitted"
              color={C.accent}
              click={() => setView?.("onetime")}
            />

            <Card
              label="Pending Amount"
              val={`SAR ${fmtAmt(Math.round(dashboardStats.totalPendingAmount))}`}
              sub={`${dashboardStats.pendingCount} approved awaiting release`}
              color={C.gold}
              click={() => setView?.("approvals")}
            />

            <Card
              label="Paid Amount"
              val={`SAR ${fmtAmt(Math.round(dashboardStats.totalPaid))}`}
              sub={`${dashboardStats.paidCount} paid requests`}
              color={C.green}
              click={() => setView?.("onetime")}
            />

            <Card
              label="Overdue"
              val={dashboardStats.overdueCount}
              sub={`SAR ${fmtAmt(Math.round(dashboardStats.totalOverdueAmount))}`}
              color={C.red}
              click={() => setView?.("approvals")}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
              gap: 13,
              marginBottom: 22,
            }}
          >
            <Card
              label="Due Today"
              val={dashboardStats.dueTodayCount}
              sub={`SAR ${fmtAmt(Math.round(dashboardStats.dueTodayAmount))}`}
              color={C.red}
              click={() => setView?.("approvals")}
            />

            <Card
              label="Due This Week"
              val={dashboardStats.dueThisWeekCount}
              sub={`SAR ${fmtAmt(Math.round(dashboardStats.dueThisWeekAmount))}`}
              color={C.orange}
              click={() => setView?.("approvals")}
            />

            <Card
              label="Due This Month"
              val={dashboardStats.dueThisMonthCount}
              sub={`SAR ${fmtAmt(Math.round(dashboardStats.dueThisMonthAmount))}`}
              color={C.purple}
              click={() => setView?.("approvals")}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <Panel
              title="Attachment Completion Tracking"
              subtitle="Quotation, receipt, and employee purchase invoice status"
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 10,
                }}
              >
                <Card
                  label="Missing Quotation"
                  val={dashboardStats.missingQuotation}
                  sub="Request attachments"
                  color={dashboardStats.missingQuotation ? C.gold : C.green}
                />

                <Card
                  label="Missing Receipt"
                  val={dashboardStats.missingReceipt}
                  sub="Finance receipt upload"
                  color={dashboardStats.missingReceipt ? C.red : C.green}
                />

                <Card
                  label="Missing Invoice"
                  val={dashboardStats.missingPurchaseInvoice}
                  sub="Employee purchase invoice"
                  color={dashboardStats.missingPurchaseInvoice ? C.orange : C.green}
                />
              </div>
            </Panel>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <Panel title="Amount By Department">
              {dashboardStats.deptTotals.length === 0 ? (
                <Empty text="No department data yet" />
              ) : (
                dashboardStats.deptTotals.map(([dept, amt], i) => (
                  <MiniBar
                    key={dept}
                    label={dept}
                    amount={amt}
                    max={maxDept}
                    color={barColors[i % barColors.length]}
                    suffix={`SAR ${fmtAmt(Math.round(amt))}`}
                  />
                ))
              )}
            </Panel>

            <Panel title="Amount By Category">
              {dashboardStats.categoryTotals.length === 0 ? (
                <Empty text="No category data yet" />
              ) : (
                dashboardStats.categoryTotals.map(([cat, amt], i) => (
                  <MiniBar
                    key={cat}
                    label={cat}
                    amount={amt}
                    max={maxCategory}
                    color={barColors[i % barColors.length]}
                    suffix={`SAR ${fmtAmt(Math.round(amt))}`}
                  />
                ))
              )}
            </Panel>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <Panel title="Payment Method Breakdown">
              {dashboardStats.methodTotals.length === 0 ? (
                <Empty text="No payment method data yet" />
              ) : (
                dashboardStats.methodTotals.map(([method, amt], i) => (
                  <MiniBar
                    key={method}
                    label={method}
                    amount={amt}
                    max={maxMethod}
                    color={barColors[i % barColors.length]}
                    suffix={`SAR ${fmtAmt(Math.round(amt))}`}
                  />
                ))
              )}
            </Panel>

            <Panel title="Bank Breakdown">
              {dashboardStats.bankTotals.length === 0 ? (
                <Empty text="No bank data yet" />
              ) : (
                dashboardStats.bankTotals.map(([bank, amt], i) => (
                  <MiniBar
                    key={bank}
                    label={bank}
                    amount={amt}
                    max={maxBank}
                    color={barColors[i % barColors.length]}
                    suffix={`SAR ${fmtAmt(Math.round(amt))}`}
                  />
                ))
              )}
            </Panel>
          </div>

          <div>
            <Panel title="Company Breakdown">
              {dashboardStats.companyTotals.length === 0 ? (
                <Empty text="No company data yet" />
              ) : (
                dashboardStats.companyTotals.map(([company, amt], i) => (
                  <MiniBar
                    key={company}
                    label={company}
                    amount={amt}
                    max={maxCompany}
                    color={barColors[i % barColors.length]}
                    suffix={`SAR ${fmtAmt(Math.round(amt))}`}
                  />
                ))
              )}
            </Panel>
          </div>
        </>
      )}

   {activeTab === "companies" && (
  <Panel
    title="Company Analysis"
    subtitle="Company-level totals with detailed request breakdown"
  >
    <GroupDetails rows={dashboardStats.companyRows} groupLabel="Company" />
  </Panel>
)}

 {activeTab === "banks" && (
  <Panel
    title="Bank Analysis"
    subtitle="Bank-level totals with detailed request breakdown"
  >
    <GroupDetails rows={dashboardStats.bankRows} groupLabel="Bank" />
  </Panel>
)}

{activeTab === "departments" && (
  <Panel
    title="Department Analysis"
    subtitle="Department-level totals with detailed request breakdown"
  >
    <GroupDetails rows={dashboardStats.departmentRows} groupLabel="Department" />
  </Panel>
)}

{activeTab === "explorer" && (
  <Panel
    title="Request Explorer"
    subtitle="All one-time payment requests with payment details"
  >
    <RequestDetailsTable items={onetime} />
  </Panel>
)}
    </div>
  );
}

export default Dashboard;