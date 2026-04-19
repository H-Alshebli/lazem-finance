
export const uid = () => Math.random().toString(36).slice(2, 9);
export const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
export const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }); }
  catch { return d || "—"; }
};
export const fmtAmt = (n) => isNaN(n) ? "—" : Number(n).toLocaleString("en-SA", { minimumFractionDigits:0, maximumFractionDigits:2 });
export const today = () => new Date().toISOString().split("T")[0];
