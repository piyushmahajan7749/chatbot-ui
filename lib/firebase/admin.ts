import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

// Validate admin config
const requiredVars = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY"
]
const missingVars = requiredVars.filter(varName => !process.env[varName])

if (missingVars.length > 0) {
  console.warn(
    "[Firebase Admin] Missing environment variables:",
    missingVars.join(", ")
  )
  console.warn(
    "[Firebase Admin] Server-side Firestore operations will not work"
  )
}

let adminDb: any = null

try {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
      })
    })
    console.log("[Firebase Admin] Initialized successfully")

    // Get Firestore instance and configure it immediately (before any other calls)
    adminDb = getFirestore()
    adminDb.settings({
      ignoreUndefinedProperties: true
    })
  } else {
    // App already initialized, just get the existing Firestore instance
    adminDb = getFirestore()
  }
} catch (error) {
  console.error("[Firebase Admin] Initialization error:", error)
  // Fallback to get Firestore anyway
  if (!adminDb) {
    adminDb = getFirestore()
  }
}

export { adminDb }
