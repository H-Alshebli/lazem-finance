import { C } from "../utils/constants";

export default function ApprovalsRecurring() {
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 2, marginBottom: 4 }}>
          WORKFLOW
        </div>
        <div style={{ fontSize: 24, fontWeight: 700 }}>Recurring Approvals</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
          Recurring approvals page is now separated and ready for its own flow updates.
        </div>
      </div>

      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: 24,
          color: C.muted,
        }}
      >
        Move recurring approval logic here next.
      </div>
    </div>
  );
}