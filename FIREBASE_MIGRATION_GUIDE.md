# Firebase Firestore Migration Guide

## Overview

This guide helps you complete the migration from Supabase to Firebase Firestore for design and research plan data.

## What Has Been Migrated

- ✅ **Designs**: All design data (metadata, content, objectives, variables, etc.)
- ✅ **Research Plans**: Plan metadata, status, constraints, preferences, literature context
- ✅ **Hypotheses**: Generated hypotheses with ELO rankings
- ✅ **Tournament Matches**: Hypothesis comparison results
- ✅ **Logs**: Research plan execution logs

## What Stays on Supabase

- ✅ **Authentication**: User auth still uses Supabase Auth
- ✅ **Users & Profiles**: User data stays in Supabase
- ✅ **Workspaces & Folders**: Workspace management remains on Supabase
- ✅ **Chats, Files, Collections**: All other content types stay on Supabase

---

## Setup Instructions

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select existing project
3. Follow the setup wizard

### Step 2: Enable Firestore Database

1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** (we'll deploy security rules later)
4. Select a location close to your users (e.g., `us-central1`)

### Step 3: Get Firebase Configuration

#### Client-Side Config

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to **Your apps** section
3. Click **Web** icon (`</>`) to add a web app
4. Register your app (name: "Chatbot UI")
5. Copy the `firebaseConfig` object values

#### Server-Side Config (Service Account)

1. In Firebase Console, go to **Project Settings** → **Service accounts**
2. Click **Generate new private key**
3. Download the JSON file
4. You'll need these values from the JSON:
   - `project_id`
   - `client_email`
   - `private_key`

### Step 4: Update Environment Variables

Add these to your `.env.local` file:

```bash
# Firebase Client (for browser)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin (for server/API routes)
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project_id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----\n"
```

**Important**: The `FIREBASE_PRIVATE_KEY` should be the **entire** private key including headers, with `\n` for newlines.

### Step 5: Deploy Firestore Security Rules and Indexes

Deploy the security rules and indexes:

#### Option A: Firebase CLI (Recommended)

```bash
# Install Firebase CLI (if not already installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project (if not already done)
firebase init firestore
# Select:
# - Firestore Rules: firestore.rules
# - Firestore Indexes: firestore.indexes.json

# Deploy both rules and indexes
firebase deploy --only firestore
```

Or deploy separately:

```bash
# Deploy only rules
firebase deploy --only firestore:rules

# Deploy only indexes
firebase deploy --only firestore:indexes
```

#### Option B: Firebase Console

**Security Rules:**

1. Go to **Firestore Database** → **Rules** tab
2. Copy the contents of `firestore.rules`
3. Paste into the rules editor
4. Click **Publish**

**Indexes:**
Indexes are automatically created when you click the link in error messages, or:

1. Go to **Firestore Database** → **Indexes** tab
2. Click **Add index** for each required index
3. Or wait for error messages with auto-create links

### Step 6: Verify Setup

Create a test design to verify everything works:

```bash
# Start your dev server
npm run dev

# Navigate to your app
# Try creating a new design
# Check that it saves and loads correctly
```

---

## Firestore Collections Structure

### `designs/{designId}`

```javascript
{
  id: string,
  user_id: string,
  workspace_id: string,
  name: string,
  description: string,
  content: string | object, // Stored as nested object
  objectives: string[],
  variables: string[],
  special_considerations: string[],
  sharing: 'private' | 'public',
  folder_id: string | null,
  created_at: string (ISO timestamp),
  updated_at: string (ISO timestamp)
}
```

### `research_plans/{planId}`

```javascript
{
  plan_id: string,
  title: string,
  description: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  constraints: object,
  preferences: object,
  literature_context: object | null,
  created_at: string,
  updated_at: string,
  metadata: object (full plan data)
}
```

### `hypotheses/{hypothesisId}`

```javascript
{
  hypothesis_id: string,
  plan_id: string,
  content: string,
  explanation: string | null,
  elo: number | null,
  provenance: string[],
  created_at: string,
  metadata: object
}
```

### `tournament_matches/{matchId}`

```javascript
{
  match_id: string,
  plan_id: string,
  challenger_hypothesis_id: string | null,
  defender_hypothesis_id: string | null,
  winner_hypothesis_id: string | null,
  created_at: string,
  metadata: object
}
```

### `logs/{logId}` (auto-generated IDs)

```javascript
{
  plan_id: string,
  timestamp: string,
  actor: string,
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  context: object
}
```

---

## Testing Checklist

Follow this checklist to ensure everything works:

### ✅ Design Creation Flow

1. [ ] Create a new design from the sidebar
2. [ ] Verify design appears in sidebar
3. [ ] Verify design is saved to Firestore (check Firebase Console)
4. [ ] Refresh page - verify design still appears

### ✅ Research Plan Generation

1. [ ] Click on a design
2. [ ] Enter problem description
3. [ ] Start hypothesis generation
4. [ ] Verify hypotheses appear in real-time
5. [ ] Check Firestore Console for `research_plans`, `hypotheses`, `logs`

### ✅ Hypothesis Selection & Experiment Design

1. [ ] Select a hypothesis from the list
2. [ ] Click "Generate Experiment Design"
3. [ ] Wait for design to generate
4. [ ] Verify design displays correctly
5. [ ] Click "Save Design"
6. [ ] Check Firestore Console - verify `content` field is populated

### ✅ Design Loading

1. [ ] Refresh the page
2. [ ] Verify saved design loads correctly
3. [ ] Verify all content is present (experiment design, literature summary, stat review)
4. [ ] Click "Download Prompts" - verify prompts are available

### ✅ Design Deletion

1. [ ] Delete a test design
2. [ ] Verify it's removed from sidebar
3. [ ] Verify it's deleted from Firestore

---

## Troubleshooting

### Error: "Firebase: No Firebase App '[DEFAULT]' has been created"

**Cause**: Environment variables not loaded

**Fix**:

1. Verify `.env.local` exists and has correct variables
2. Restart your dev server: `npm run dev`
3. Clear Next.js cache: `rm -rf .next`

### Error: "Permission denied" when writing to Firestore

**Cause**: Security rules not deployed or incorrect

**Fix**:

1. Deploy security rules: `firebase deploy --only firestore:rules`
2. Verify rules in Firebase Console
3. Check that user is authenticated

### Error: "FIREBASE_PRIVATE_KEY is invalid"

**Cause**: Newlines in private key not escaped correctly

**Fix**:

1. Ensure your private key has `\n` for newlines
2. Wrap the entire key in quotes in `.env.local`:
   ```
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Key_Here\n-----END PRIVATE KEY-----\n"
   ```

### Designs not loading after page refresh

**Cause**: Missing Firebase config or API route errors

**Fix**:

1. Check browser console for errors
2. Check server logs for API errors
3. Verify environment variables are set
4. Test API route directly: `curl http://localhost:3000/api/design/{designid}`

---

## Migration from Existing Supabase Data

If you have existing designs in Supabase that you want to migrate:

### Option 1: Manual Export/Import (Small Datasets)

```bash
# 1. Export from Supabase
# Run this SQL query in Supabase SQL Editor:
SELECT * FROM designs;

# 2. Save results as JSON
# 3. Write a migration script or manually import via Firebase Console
```

### Option 2: Automated Migration Script

Create `scripts/migrate-to-firestore.ts`:

```typescript
import { createClient } from "@supabase/supabase-js"
import { adminDb } from "@/lib/firebase/admin"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function migrate() {
  // Get all designs from Supabase
  const { data: designs } = await supabase.from("designs").select("*")

  // Import to Firestore
  for (const design of designs) {
    await adminDb
      .collection("designs")
      .doc(design.id)
      .set({
        ...design,
        updated_at: new Date().toISOString()
      })
    console.log(`Migrated design: ${design.id}`)
  }

  console.log("Migration complete!")
}

migrate()
```

Run with: `npx tsx scripts/migrate-to-firestore.ts`

---

## Performance Optimization

### Indexes

Firestore will automatically create indexes for simple queries. For complex queries, you may need composite indexes.

If you see an error like "The query requires an index", click the link in the error message to auto-create it.

### Batch Operations

For bulk operations, use Firestore batch writes:

```typescript
const batch = adminDb.batch()
designs.forEach(design => {
  const ref = adminDb.collection("designs").doc(design.id)
  batch.set(ref, design)
})
await batch.commit()
```

---

## Rollback Plan

If you need to rollback to Supabase:

1. Keep the old `db/designs.ts` file (don't delete it)
2. Revert imports in components:
   - Change `@/db/designs-firestore` → `@/db/designs`
3. Revert imports in API routes:
   - Change `persistence-firestore` → `persistence`
4. Restart server

---

## Support

- **Firebase Docs**: https://firebase.google.com/docs/firestore
- **Firestore Pricing**: https://firebase.google.com/pricing (Free tier: 50K reads, 20K writes per day)
- **Firebase Console**: https://console.firebase.google.com/

---

## Summary

✅ All code has been migrated to use Firestore
✅ Old Supabase code remains in place for other features
✅ Security rules configured
✅ No schema cache issues
✅ No migration headaches
✅ Native JSON storage - no more stringification!

**Next Step**: Complete the setup steps above and run the testing checklist.
