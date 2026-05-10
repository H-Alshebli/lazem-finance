import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";

// Load both .env and .env.local
dotenv.config();
dotenv.config({ path: ".env.local" });

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

console.log("Firebase projectId:", firebaseConfig.projectId);

const missing = Object.entries(firebaseConfig)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error("Missing Firebase config values:", missing);
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const requestIds = [
  "VWERkm01yluyEX8VUvJS",
  // add the other request IDs here
];

const managerLevel2 = {
  id: "nhJOYvuDWAW5glPGa7FpOPKgpDG3",
  name: "Abdulrhman Bahmaid",
  email: "abdulrhman@lazem.sa",
};

async function reopenRequests() {
  console.log("Starting reopen script...");

  for (const id of requestIds) {
    const cleanId = String(id || "").trim();

    if (!cleanId || cleanId.startsWith("PASTE_")) {
      console.warn("Skipped invalid ID:", cleanId);
      continue;
    }

    console.log("Updating request:", cleanId);

    const ref = doc(db, "onetime", cleanId);

    await updateDoc(ref, {
      status: "pending_manager",
      currentManagerLevel: 2,
      currentApproverId: managerLevel2.id,
      currentApproverName: managerLevel2.name,
      currentApproverEmail: managerLevel2.email,
      currentApproverRole: "Manager Level 2",
      rejectionReason: "",
      updatedAt: serverTimestamp(),

      history: arrayUnion({
        status: "pending_manager",
        by: "Admin",
        date: "2026-05-10",
        note: "Request reopened and returned to Manager Level 2 approval",
      }),
    });

    console.log(`✅ Reopened request: ${cleanId}`);
  }

  console.log("Done.");
}

reopenRequests().catch((error) => {
  console.error("❌ Failed to reopen requests:", error);
});