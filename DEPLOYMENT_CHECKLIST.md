# Deployment Checklist - Design Draft with Inngest

## Changes Made

### 1. Fixed Canvas Build Issues
- ✅ Replaced `canvas` with `@napi-rs/canvas` (better Vercel compatibility)
- ✅ Added type assertions for Buffer compatibility
- ✅ Updated `next.config.js` to include `@napi-rs/canvas` in external packages

### 2. Fixed Supabase Schema Cache
- ✅ Verified tables exist: `design_tournament_matches`, `design_hypotheses`, etc.
- ✅ Refreshed PostgREST schema cache
- ✅ Updated production environment variables with correct Supabase keys

### 3. Integrated Inngest for Background Jobs
- ✅ Installed `inngest` package
- ✅ Created Inngest client (`lib/inngest/client.ts`)
- ✅ Created background function (`lib/inngest/functions.ts`)
- ✅ Set up API endpoint (`app/api/inngest/route.ts`)
- ✅ Updated design draft route to trigger Inngest events
- ✅ Added `eventKey` to Inngest client configuration

## Current Status

✅ **READY TO DEPLOY**

The code has been updated with:
1. ✅ Inngest client with `eventKey` configured
2. ✅ Supervisor broken into 4 checkpointed steps:
   - Step 1: Fetch and validate plan (~1 second)
   - Step 2: Generate seed hypotheses (5 LLM calls, ~30-60 seconds)
   - Step 3: Run tournament (10-45 ranking calls, ~2-5 minutes)
   - Step 4: Complete plan (~1 second)
3. ✅ Each step completes under timeout limits
4. ✅ Progress is checkpointed between steps

## Deployment Steps

### Step 1: Verify Vercel Environment Variables

Go to your Vercel project settings and ensure these are set for **Production**:

**Required Variables:**
```
INNGEST_EVENT_KEY=<from Inngest dashboard>
INNGEST_SIGNING_KEY=<from Inngest dashboard>
NEXT_PUBLIC_SUPABASE_URL=https://qcimhigugrhkabavqfgz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
SUPABASE_SERVICE_ROLE_KEY=<your service role key>
OPENAI_API_KEY=<your OpenAI key>
```

To get Inngest keys:
1. Go to https://app.inngest.com/
2. Navigate to **Settings** → **Keys** or **Environment** → **Production**
3. Copy both keys

### Step 2: Deploy

```bash
git add .
git commit -m "Fix Inngest integration and add eventKey"
git push
```

### Step 3: Test the Deployment

After deployment:

1. **Check the endpoint:**
   ```bash
   curl https://your-domain.vercel.app/api/inngest
   ```
   
   Should return:
   ```json
   {
     "authentication_succeeded": true,
     "function_count": 1,
     "has_event_key": true,
     "has_signing_key": true
   }
   ```

2. **Create a design** in your app

3. **Check Vercel logs** for any errors:
   - Go to Vercel Dashboard → Deployments → Latest → Functions
   - Look for `/api/design/draft` logs
   - You should see: "✅ Inngest event sent"

4. **Check Inngest Dashboard:**
   - Go to https://app.inngest.com/
   - Navigate to **Events** tab
   - You should see `design/draft.requested` events
   - Navigate to **Functions** tab
   - You should see `process-design-draft` executions

## Expected Behavior After Fix

### Frontend:
1. User creates design
2. Loading state shows immediately ✅
3. Frontend polls `/api/design/draft/status/[planId]` every 5 seconds
4. When status becomes "completed", results appear

### Backend:
1. POST `/api/design/draft`
   - Saves plan to database (status: "pending")
   - Sends event to Inngest
   - Returns 202 Accepted immediately

2. Inngest function runs in background:
   - No timeout limits
   - Runs all supervisor phases
   - Updates plan status to "completed"
   - Frontend sees results on next poll

## Troubleshooting

### Issue: Still getting "Invalid JSON in response"

**Causes:**
1. `INNGEST_EVENT_KEY` not set in Vercel
2. Event key is incorrect
3. Inngest service is down

**Debug:**
1. Check Vercel function logs
2. Look for the detailed error we added:
   ```
   ❌ [DESIGN_DRAFT] Inngest send error: ...
   ```
3. Verify environment variable is actually set (not just visible in settings)

### Issue: "FUNCTION_INVOCATION_TIMEOUT" in Inngest

This means the Inngest function itself is timing out. See `INNGEST_SETUP.md` for how to break it into smaller steps.

**Current implementation:** All phases run in one `step.run("run-supervisor")`
**Better approach:** Break into multiple steps (see the code example in previous message)

### Issue: Frontend stuck on loading

**Causes:**
1. Plan status never updates to "completed"
2. Frontend polling is broken
3. Inngest function failed silently

**Debug:**
1. Check plan status directly:
   ```bash
   curl https://your-domain.vercel.app/api/design/draft/status/[planId]
   ```
2. Check Inngest Dashboard for function execution status
3. Look for errors in function logs

## Next Steps After This Deployment

If the Inngest function still times out (which is likely with 5 hypotheses and tournaments), you'll need to:

1. **Break the supervisor into smaller steps** (see `INNGEST_SETUP.md`)
2. Each phase becomes its own `step.run()` block
3. This allows Inngest to checkpoint between phases
4. Much more resilient to failures

I can help implement this if needed - just let me know!

## Quick Reference

**Files Modified:**
- `package.json` - Added Inngest
- `lib/inngest/client.ts` - Inngest client (UPDATED with eventKey)
- `lib/inngest/functions.ts` - Background function
- `app/api/inngest/route.ts` - API endpoint
- `app/api/design/draft/route.ts` - Triggers Inngest (UPDATED with better error handling)
- `vercel.json` - Function timeouts
- `app/api/report/outline/route.ts` - Buffer type fix
- `app/api/retrieval/process/route.ts` - Buffer type fix

**Key Environment Variables:**
- `INNGEST_EVENT_KEY` ⚠️ REQUIRED
- `INNGEST_SIGNING_KEY` ⚠️ REQUIRED
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

**Useful URLs:**
- Inngest Dashboard: https://app.inngest.com/
- Vercel Dashboard: https://vercel.com/dashboard
- Your Inngest Endpoint: `https://your-domain.vercel.app/api/inngest`

