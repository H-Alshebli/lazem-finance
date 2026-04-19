import { C } from "../utils/constants";

function NotificationsView({ notifs = [], onDismiss, onDismissAll }) {
  const typeConfig = {
    approval_required: { icon: "⚡", color: C.orange, label: "Approval Required" },
    payment_due: { icon: "💰", color: C.gold, label: "Payment Due" },
    renewal_reminder: { icon: "🔔", color: C.accent, label: "Renewal Reminder" },
    new_submission: { icon: "📥", color: C.green, label: "New Submission" },
    rejected: { icon: "✗", color: C.red, label: "Rejected" },
    paid: { icon: "✓", color: C.green, label: "Paid" },
  };

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 22,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              letterSpacing: 2,
              marginBottom: 4,
            }}
          >
            INBOX
          </div>
          <div style={{ fontSize: 26, fontWeight: 700 }}>Notifications</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            {unread} unread · {notifs.length} total
          </div>
        </div>

        {notifs.length > 0 && (
          <button className="btn-ghost" onClick={onDismissAll}>
            Dismiss All
          </button>
        )}
      </div>

      {notifs.length === 0 && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 48,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
          <div style={{ color: C.muted, fontSize: 14 }}>No notifications yet</div>
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {notifs.map((n) => {
          const tc = typeConfig[n.type] || {
            icon: "•",
            color: C.muted,
            label: n.type,
          };

          return (
            <div
              key={n.id}
              style={{
                background: n.read ? C.card : C.subtle,
                border: `1px solid ${n.read ? C.border : tc.color + "44"}`,
                borderLeft: `3px solid ${tc.color}`,
                borderRadius: 12,
                padding: "14px 18px",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
              }}
            >
              <div style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>
                {tc.icon}
              </div>

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 3,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{n.title}</span>

                  <span
                    style={{
                      fontSize: 10,
                      color: tc.color,
                      background: tc.color + "18",
                      padding: "1px 7px",
                      borderRadius: 5,
                      fontWeight: 700,
                    }}
                  >
                    {tc.label}
                  </span>

                  {!n.read && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: tc.color,
                        display: "inline-block",
                      }}
                    />
                  )}
                </div>

                <div style={{ fontSize: 12, color: C.muted }}>{n.body}</div>

                <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
                  {new Date(n.timestamp).toLocaleString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              <button
                onClick={() => onDismiss(n.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: C.muted,
                  fontSize: 16,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default NotificationsView;