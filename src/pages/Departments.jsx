import { useEffect, useMemo, useState } from "react";
import { C, ROLE_CONFIG, DEPARTMENTS } from "../utils/constants";
import { setUserProfile } from "../firebase/firestore";

function DepartmentsView({ deptConfig, setDeptConfig, showNotif, authUsers }) {
  const buildDefaultDepartments = () =>
    (DEPARTMENTS || [])
      .filter((d) => d !== "All Company")
      .map((d) => ({
        id: d,
        name: d,
        manager: "",
        vp: "",
        hr: "",
        finance: "",
        notes: "",
        staff: [],
      }));

  const safeDeptConfig =
    Array.isArray(deptConfig) && deptConfig.length > 0
      ? deptConfig
      : buildDefaultDepartments();

  const [selected, setSelected] = useState(safeDeptConfig[0]?.id || null);
  const [edited, setEdited] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if ((!Array.isArray(deptConfig) || deptConfig.length === 0) && setDeptConfig) {
      setDeptConfig(buildDefaultDepartments());
    }
  }, [deptConfig, setDeptConfig]);

  useEffect(() => {
    if (!selected && safeDeptConfig.length > 0) {
      setSelected(safeDeptConfig[0].id);
    }
  }, [selected, safeDeptConfig]);

  const userList = Object.values(authUsers || {});

  const roleUserMap = useMemo(() => {
    return {
      manager: userList.filter((u) => ["manager", "admin"].includes(u.role)),
      vp: userList.filter((u) => ["vp", "admin"].includes(u.role)),
      hr: userList.filter((u) => ["hr", "admin"].includes(u.role)),
      finance: userList.filter((u) => ["finance", "admin"].includes(u.role)),
      staff: userList.filter((u) =>
        ["staff", "manager", "finance", "vp", "hr", "admin", "ceo"].includes(u.role)
      ),
    };
  }, [userList]);

  const dept = safeDeptConfig.find((d) => d.id === selected);
  const changes = edited[selected] || {};
  const current = dept ? { ...dept, ...changes } : null;

  const findUser = (idOrEmail) =>
    userList.find((u) => u.id === idOrEmail || u.email === idOrEmail);

  const setField = (field, val) => {
    setEdited((prev) => ({
      ...prev,
      [selected]: { ...(prev[selected] || {}), [field]: val },
    }));
  };

  const buildFinalDepartments = () => {
    const base =
      Array.isArray(deptConfig) && deptConfig.length > 0
        ? deptConfig
        : buildDefaultDepartments();

    return base.map((d) => ({
      ...d,
      ...(edited[d.id] || {}),
      staff: Array.isArray((edited[d.id] || {}).staff)
        ? (edited[d.id] || {}).staff
        : Array.isArray(d.staff)
        ? d.staff
        : [],
    }));
  };

  const syncUserDepartmentsToFirestore = async (finalDepartments) => {
    const userDepartmentMap = new Map();

    finalDepartments.forEach((department) => {
      const staffIds = Array.isArray(department.staff) ? department.staff : [];
      staffIds.forEach((userId) => {
        userDepartmentMap.set(userId, department.id);
      });
    });

    const updates = userList.map(async (user) => {
      const nextDepartment = userDepartmentMap.get(user.id) || "";
      const currentDepartment = user.department || "";

      if (currentDepartment !== nextDepartment) {
        await setUserProfile(user.id, {
          department: nextDepartment,
        });
      }
    });

    await Promise.all(updates);
  };

  const save = async () => {
    if (!selected || !current) return;

    if (!current.manager) {
      showNotif("Manager is required for this department", "error");
      return;
    }

    if (!current.finance) {
      showNotif("Finance approver is required for this department", "error");
      return;
    }

    if (!Array.isArray(current.staff) || current.staff.length === 0) {
      showNotif("Please add at least one staff member to this department", "error");
      return;
    }

    const finalDepartments = buildFinalDepartments();

    try {
      setSaving(true);

      setDeptConfig(finalDepartments);
      await syncUserDepartmentsToFirestore(finalDepartments);

      setEdited((prev) => {
        const next = { ...prev };
        delete next[selected];
        return next;
      });

      showNotif(`${selected} department saved and user profiles updated!`);
    } catch (error) {
      console.error("Department save failed:", error);
      showNotif("Failed to sync department to user profiles", "error");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = Object.keys(edited[selected] || {}).length > 0;

  const ROLES_IN_FLOW = [
    {
      key: "manager",
      label: "Manager",
      icon: "👔",
      color: "#F97316",
      desc: "Approves L1 — first reviewer for all requests from this department",
      users: roleUserMap.manager,
    },
    {
      key: "vp",
      label: "VP",
      icon: "⭐",
      color: "#14B8A6",
      desc: "Approves entitlement requests at VP level",
      users: roleUserMap.vp,
    },
    {
      key: "hr",
      label: "HR",
      icon: "👤",
      color: "#A78BFA",
      desc: "Approves entitlement requests at HR level",
      users: roleUserMap.hr,
    },
    {
      key: "finance",
      label: "Finance Approver",
      icon: "💰",
      color: "#F59E0B",
      desc: "Reviews budget and releases payments for this department",
      users: roleUserMap.finance,
    },
  ];

  const completeness = safeDeptConfig.map((d) => {
    const merged = { ...d, ...(edited[d.id] || {}) };
    const filled = ["manager", "finance"].filter((k) => merged[k]).length;
    const staffCount = Array.isArray(merged.staff) ? merged.staff.length : 0;
    return { id: d.id, filled, total: 2, staffCount };
  });

  const addStaffToDepartment = (userId) => {
    if (!selected || !userId || !current) return;

    const nextEdited = { ...edited };

    safeDeptConfig.forEach((d) => {
      const merged = { ...d, ...(nextEdited[d.id] || {}) };
      const staff = Array.isArray(merged.staff) ? merged.staff : [];

      if (staff.includes(userId)) {
        nextEdited[d.id] = {
          ...(nextEdited[d.id] || {}),
          staff: staff.filter((id) => id !== userId),
        };
      }
    });

    const selectedMerged = { ...dept, ...(nextEdited[selected] || {}) };
    const selectedStaff = Array.isArray(selectedMerged.staff) ? selectedMerged.staff : [];

    nextEdited[selected] = {
      ...(nextEdited[selected] || {}),
      staff: [...selectedStaff, userId],
    };

    setEdited(nextEdited);
  };

  const removeStaffFromDepartment = (userId) => {
    if (!selected || !current) return;
    const currentStaff = Array.isArray(current.staff) ? current.staff : [];
    setField(
      "staff",
      currentStaff.filter((id) => id !== userId)
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div
          style={{
            fontSize: 10,
            color: C.muted,
            letterSpacing: 2,
            marginBottom: 4,
          }}
        >
          ADMIN
        </div>
        <div style={{ fontSize: 26, fontWeight: 700 }}>
          Department Configuration
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          Assign approvers to each department · Controls who reviews requests in the approval flow
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "230px 1fr", gap: 16 }}>
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: C.muted,
              fontWeight: 700,
              letterSpacing: 1,
              marginBottom: 10,
              padding: "0 4px",
            }}
          >
            DEPARTMENTS
          </div>

          {safeDeptConfig.map((d) => {
            const comp = completeness.find((c) => c.id === d.id);
            const pct = comp ? comp.filled / comp.total : 0;
            const isActive = selected === d.id;
            const hasEdit = !!edited[d.id];

            return (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 9,
                  marginBottom: 3,
                  border: isActive
                    ? `1px solid ${C.accent}55`
                    : "1px solid transparent",
                  background: isActive ? C.accentGlow : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: pct === 1 ? "#10B98122" : C.subtle,
                      border: `1.5px solid ${pct === 1 ? "#10B98155" : C.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      flexShrink: 0,
                    }}
                  >
                    🏢
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? C.accent : C.text,
                        }}
                      >
                        {d.name}
                      </span>

                      {hasEdit && (
                        <span
                          style={{
                            fontSize: 9,
                            background: "#F59E0B22",
                            color: "#F59E0B",
                            border: "1px solid #F59E0B44",
                            borderRadius: 4,
                            padding: "1px 5px",
                            fontWeight: 700,
                          }}
                        >
                          UNSAVED
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        height: 3,
                        borderRadius: 2,
                        background: C.border,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${pct * 100}%`,
                          background: pct === 1 ? "#10B981" : C.accent,
                          borderRadius: 2,
                          transition: "width .3s",
                        }}
                      />
                    </div>

                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      {comp?.filled}/{comp?.total} key roles assigned · {comp?.staffCount || 0} staff
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {current ? (
          <div>
            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 24,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 22,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: C.subtle,
                      border: `1px solid ${C.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 22,
                    }}
                  >
                    🏢
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {current.name}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>
                      Assign who handles each approval stage for this department
                    </div>
                  </div>
                </div>

                <button
                  className="btn-primary"
                  onClick={save}
                  disabled={!hasChanges || saving}
                  style={{
                    opacity: hasChanges && !saving ? 1 : 0.4,
                    cursor: hasChanges && !saving ? "pointer" : "default",
                  }}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {ROLES_IN_FLOW.map(({ key, label, icon, color, desc, users }) => {
                  const assigned = current[key];
                  const assignedUser = findUser(assigned);

                  return (
                    <div
                      key={key}
                      style={{
                        padding: "16px 18px",
                        borderRadius: 12,
                        border: `1px solid ${assigned ? color + "44" : C.border}`,
                        background: assigned ? color + "0C" : C.subtle,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 18 }}>{icon}</span>
                        <div>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: assigned ? color : C.text,
                            }}
                          >
                            {label}
                          </div>
                          <div style={{ fontSize: 10, color: C.muted }}>{desc}</div>
                        </div>
                      </div>

                      <select
                        value={current[key] || ""}
                        onChange={(e) => setField(key, e.target.value)}
                        style={{
                          width: "100%",
                          background: C.card,
                          border: `1px solid ${assigned ? color + "55" : C.border}`,
                          color: assigned ? C.text : C.muted,
                          padding: "9px 12px",
                          borderRadius: 8,
                          fontSize: 12,
                          outline: "none",
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">— Not assigned —</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({ROLE_CONFIG[u.role]?.label || u.role})
                          </option>
                        ))}
                      </select>

                      {assignedUser && (
                        <div
                          style={{
                            marginTop: 8,
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                            padding: "6px 10px",
                            background: color + "15",
                            border: `1px solid ${color}33`,
                            borderRadius: 7,
                          }}
                        >
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: color + "33",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 700,
                              color,
                              flexShrink: 0,
                            }}
                          >
                            {assignedUser.name?.[0]}
                          </div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600, color }}>
                              {assignedUser.name}
                            </div>
                            <div style={{ fontSize: 10, color: C.muted }}>
                              {assignedUser.email}
                            </div>
                          </div>
                          <div
                            style={{
                              marginLeft: "auto",
                              fontSize: 9,
                              background: color + "22",
                              color,
                              border: `1px solid ${color}33`,
                              borderRadius: 4,
                              padding: "2px 6px",
                              fontWeight: 700,
                            }}
                          >
                            {ROLE_CONFIG[assignedUser.role]?.label || assignedUser.role}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 16 }}>
                <label
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    display: "block",
                    marginBottom: 6,
                    fontWeight: 600,
                    letterSpacing: 1,
                  }}
                >
                  NOTES (optional)
                </label>
                <textarea
                  value={current.notes || ""}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Any special notes about this department's approval process..."
                  rows={2}
                  style={{
                    width: "100%",
                    background: C.subtle,
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    padding: "10px 14px",
                    borderRadius: 9,
                    fontSize: 12,
                    outline: "none",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: C.muted,
                    fontWeight: 700,
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  STAFF MEMBERS
                </div>

                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `1px solid #6B7A9944`,
                    background: "#6B7A9908",
                  }}
                >
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                    👥 Select users who belong to this department
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    {(current.staff || []).map((uid) => {
                      const u = findUser(uid);
                      if (!u) return null;

                      return (
                        <div
                          key={uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "5px 10px",
                            background: "#6B7A9922",
                            border: "1px solid #6B7A9944",
                            borderRadius: 20,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>
                            {u.name}
                          </span>
                          <span style={{ fontSize: 10, color: C.muted }}>·</span>
                          <span style={{ fontSize: 10, color: C.muted }}>
                            {ROLE_CONFIG[u.role]?.label || u.role}
                          </span>
                          {u.department && (
                            <>
                              <span style={{ fontSize: 10, color: C.muted }}>·</span>
                              <span style={{ fontSize: 10, color: C.accent }}>
                                {u.department}
                              </span>
                            </>
                          )}
                          <button
                            onClick={() => removeStaffFromDepartment(uid)}
                            style={{
                              background: "none",
                              border: "none",
                              color: C.muted,
                              cursor: "pointer",
                              fontSize: 13,
                              lineHeight: 1,
                              padding: "0 0 0 2px",
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <select
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      addStaffToDepartment(e.target.value);
                    }}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      color: C.muted,
                      padding: "9px 12px",
                      borderRadius: 8,
                      fontSize: 12,
                      outline: "none",
                      fontFamily: "inherit",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">+ Add staff member...</option>
                    {roleUserMap.staff
                      .filter((u) => !(current.staff || []).includes(u.id))
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                          {u.department ? ` — ${u.department}` : ""}
                          {ROLE_CONFIG[u.role]?.label ? ` (${ROLE_CONFIG[u.role].label})` : ""}
                        </option>
                      ))}
                  </select>

                  <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                    A user should belong to only one department. When you save, the selected users’ Firestore profiles will also be updated with this department automatically.
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.muted,
                  letterSpacing: 1,
                  marginBottom: 14,
                }}
              >
                APPROVAL FLOW PREVIEW — {current.name.toUpperCase()}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
                {[
                  { label: "Submit", person: "Staff", color: "#6B7A99" },
                  {
                    label: "Manager",
                    person: findUser(current.manager)?.name || "Not set",
                    color: "#F97316",
                  },
                  {
                    label: "CEO",
                    person: "Mohammed Al-Saud",
                    color: "#EC4899",
                  },
                  {
                    label: "Finance",
                    person: findUser(current.finance)?.name || "Not set",
                    color: "#F59E0B",
                  },
                  {
                    label: "CEO Release",
                    person: "Mohammed Al-Saud",
                    color: "#EC4899",
                  },
                  {
                    label: "Pay",
                    person: "Finance Team",
                    color: "#10B981",
                  },
                ].map((step, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "8px 12px",
                        borderRadius: 9,
                        background: step.color + "15",
                        border: `1px solid ${step.color}33`,
                        minWidth: 90,
                      }}
                    >
                      <div style={{ fontSize: 10, color: step.color, fontWeight: 700 }}>
                        {step.label}
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: C.muted,
                          marginTop: 2,
                          maxWidth: 90,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {step.person}
                      </div>
                    </div>
                    {i < 5 && (
                      <div style={{ color: C.muted, fontSize: 14, padding: "0 4px" }}>
                        →
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.muted,
              fontSize: 14,
            }}
          >
            Select a department to configure
          </div>
        )}
      </div>
    </div>
  );
}

export default DepartmentsView;