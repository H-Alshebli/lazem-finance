import { C } from "../utils/constants";

function Card({ title, desc, color, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.card,
        border: `1px solid ${color}55`,
        borderLeft: `4px solid ${color}`,
        borderRadius: 14,
        padding: "18px 20px",
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color }}>{title}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{desc}</div>
        </div>

        <div
          style={{
            minWidth: 34,
            height: 34,
            borderRadius: 10,
            background: color + "22",
            border: `1px solid ${color}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {count}
        </div>
      </div>
    </button>
  );
}

export default function ApprovalsSelector({
  onetime,
  recurring,
  entitlements,
  setView,
  userRole,
}) {
  const isAdmin = userRole === "admin";

  const oneTimeCount = (onetime || []).filter((i) =>
    String(i.status || "").startsWith("pending")
  ).length;

  const recurringCount = (recurring || []).filter((i) =>
    String(i.status || "").startsWith("pending")
  ).length;

  const entitlementsCount = (entitlements || []).filter((i) =>
    String(i.status || "").startsWith("pending")
  ).length;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 10,
            color: C.muted,
            letterSpacing: 2,
            marginBottom: 4,
          }}
        >
          WORKFLOW
        </div>

        <div style={{ fontSize: 26, fontWeight: 700 }}>Approvals</div>

        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          {isAdmin
            ? "Select the approval flow you want to manage."
            : "First launch is limited to One-Time approvals only."}
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, maxWidth: 820 }}>
        <Card
          title="One-Time Approvals"
          desc="Manager → CEO → Finance → Schedule → Release → Receipt → Invoice"
          color={C.orange}
          count={oneTimeCount}
          onClick={() => setView("approvals_onetime")}
        />

        {isAdmin && (
          <>
            <Card
              title="Recurring Approvals"
              desc="Manager → CEO → Finance → CEO Release → Pay"
              color={C.accent}
              count={recurringCount}
              onClick={() => setView("approvals_recurring")}
            />

            <Card
              title="Entitlements Approvals"
              desc="Manager → VP → HR → CEO → Finance → CEO Release → Pay"
              color="#14B8A6"
              count={entitlementsCount}
              onClick={() => setView("approvals_entitlements")}
            />
          </>
        )}
      </div>
    </div>
  );
}
