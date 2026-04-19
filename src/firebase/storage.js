import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./config";

// Convert a file-like object into a Blob/File that Firebase Storage can upload
async function resolveBlob(file) {
  if (file?._file instanceof File) {
    return file._file;
  }

  if (file instanceof File) {
    return file;
  }

  if (file?.dataUrl) {
    const res = await fetch(file.dataUrl);
    return await res.blob();
  }

  throw new Error("No file data to upload");
}

// Create a safer filename for storage
function buildStoragePath(folder, name = "file") {
  const safeName = String(name)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return `${folder}/${Date.now()}_${safeName}`;
}

// Upload a single file to Firebase Storage
// Returns: { id, name, size, type, uploadedAt, downloadUrl }
export async function uploadFile(file, folder = "attachments") {
  const blob = await resolveBlob(file);

  const originalName =
    file?.name ||
    (file?._file instanceof File ? file._file.name : "file");

  const originalType =
    file?.type ||
    (file?._file instanceof File ? file._file.type : blob.type) ||
    "";

  const originalSize =
    file?.size ||
    (file?._file instanceof File ? file._file.size : blob.size) ||
    0;

  const path = buildStoragePath(folder, originalName);
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, blob);
  const downloadUrl = await getDownloadURL(storageRef);

  return {
    id: file?.id || String(Date.now()),
    name: originalName,
    size: originalSize,
    type: originalType,
    uploadedAt:
      file?.uploadedAt || new Date().toISOString().split("T")[0],
    downloadUrl,
  };
}

// Upload multiple files
export async function uploadFiles(files, folder = "attachments") {
  if (!Array.isArray(files) || files.length === 0) return [];
  return Promise.all(files.map((f) => uploadFile(f, folder)));
}