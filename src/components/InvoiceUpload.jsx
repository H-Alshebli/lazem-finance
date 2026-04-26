import { useState, useRef } from "react";
import { C } from "../utils/constants";
import { uid, today } from "../utils/helpers";
import { uploadFiles } from "../firebase/storage";

// Use Firebase Storage whenever Firebase env is available, including localhost
const isFirebaseMode =
  typeof window !== "undefined" &&
  !!import.meta.env.VITE_FIREBASE_API_KEY;

function hasValidFileLink(file) {
  return (
    (typeof file?.downloadUrl === "string" && file.downloadUrl.trim()) ||
    (typeof file?.dataUrl === "string" && file.dataUrl.trim())
  );
}

function InvoiceUpload({ invoices = [], onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const ACCEPT = ".pdf,.jpg,.jpeg,.png";
  const safeInvoices = Array.isArray(invoices) ? invoices : [];

  const handleFiles = async (files) => {
    const fileArr = Array.from(files || []);
    if (!fileArr.length) return;

    if (isFirebaseMode) {
      setUploading(true);
      try {
        const uploaded = await uploadFiles(
          fileArr.map((f) => ({
            id: uid(),
            name: f.name,
            size: f.size,
            type: f.type,
            uploadedAt: today(),
            _file: f,
          })),
          "attachments"
        );

        const validUploaded = uploaded.filter(hasValidFileLink);
        onChange([...safeInvoices, ...validUploaded]);
      } catch (e) {
        console.error("Upload failed:", e);
      } finally {
        setUploading(false);
      }
    } else {
      // Fallback only if Firebase is truly unavailable
      readAsDataUrls(fileArr);
    }
  };

  const readAsDataUrls = (fileArr) => {
    const results = [];
    let completed = 0;

    fileArr.forEach((f, i) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        results[i] = {
          id: uid(),
          name: f.name,
          size: f.size,
          type: f.type,
          dataUrl: e.target.result,
          uploadedAt: today(),
        };

        completed++;

        if (completed === fileArr.length) {
          const validResults = results.filter(hasValidFileLink);
          onChange([...safeInvoices, ...validResults]);
        }
      };

      reader.onerror = () => {
        completed++;
        console.error("Failed to read file:", f.name);

        if (completed === fileArr.length) {
          const validResults = results.filter(hasValidFileLink);
          onChange([...safeInvoices, ...validResults]);
        }
      };

      reader.readAsDataURL(f);
    });
  };

  const remove = (id) => {
    onChange(safeInvoices.filter((i) => i.id !== id));
  };

  const fmtSize = (b) =>
    b > 1024 * 1024
      ? `${(b / 1024 / 1024).toFixed(1)}MB`
      : `${Math.round(b / 1024)}KB`;

  const getIcon = (type) =>
    type?.includes("pdf") ? "📄" : type?.includes("image") ? "🖼" : "📎";

  return (
    <div>
      <label
        style={{
          fontSize: 11,
          color: C.muted,
          display: "block",
          marginBottom: 5,
        }}
      >
        ATTACHMENTS / QUOTATIONS
      </label>

      <div
        style={{
          border: `2px dashed ${C.border}`,
          borderRadius: 10,
          padding: "16px",
          textAlign: "center",
          cursor: "pointer",
          transition: "border-color .2s",
        }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = C.accent;
        }}
        onDragLeave={(e) => {
          e.currentTarget.style.borderColor = C.border;
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = C.border;
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div style={{ fontSize: 20, marginBottom: 4 }}>📎</div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {uploading ? (
            "Uploading..."
          ) : (
            <>
              Drop PDF, JPG or PNG · or{" "}
              <span style={{ color: C.accent }}>click to browse</span>
            </>
          )}
        </div>
      </div>

      {safeInvoices.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {safeInvoices.map((inv) => {
            const fileUrl = inv.downloadUrl || inv.dataUrl;

            return (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: C.subtle,
                  border: `1px solid ${C.accent}44`,
                  borderRadius: 8,
                  padding: "5px 10px",
                  fontSize: 11,
                }}
              >
                <span>{getIcon(inv.type)}</span>

                {fileUrl ? (
                  <a
                    href={fileUrl}
                    download={inv.name}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      color: C.accent,
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textDecoration: "none",
                      position: "relative",
                      zIndex: 5,
                      pointerEvents: "auto",
                    }}
                  >
                    {inv.name}
                  </a>
                ) : (
                  <span
                    style={{
                      color: C.muted,
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inv.name}
                  </span>
                )}

                <span style={{ color: C.muted }}>{fmtSize(inv.size)}</span>

                <button
                  onClick={() => remove(inv.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.red,
                    cursor: "pointer",
                    fontSize: 14,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PayInvoiceUpload({ payInvoices, onChange }) {
  return (
    <InvoiceUpload
      invoices={Array.isArray(payInvoices) ? payInvoices : []}
      onChange={onChange}
    />
  );
}

export { PayInvoiceUpload };
export default InvoiceUpload;