import { C } from "../utils/constants";
export default function Badge({ label, color }) {
  return (
    <span style={{ background: color+"22", color, border:`1px solid ${color}44`,
      borderRadius:6, padding:"2px 10px", fontSize:11, fontWeight:700,
      letterSpacing:0.5, whiteSpace:"nowrap" }}>{label}</span>
  );
}
