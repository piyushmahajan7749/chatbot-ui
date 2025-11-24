# Supabase Schema Cache Fix

## Error Encountered:
```
❌ [DESIGN_API] Update error: {
  code: 'PGRST204',
  details: null,
  hint: null,
  message: "Could not find the 'content' column of 'designs' in the schema cache"
}
```

## Root Cause:
PostgREST (Supabase's API layer) caches the database schema. After running migrations that add new columns, the cache becomes stale and doesn't know about the new columns.

The database HAS the column (confirmed via direct SQL query), but the API layer doesn't know about it yet.

## Solution: Reload Schema Cache

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to https://supabase.com/dashboard/project/qcimhigugrhkabavqfgz
2. Navigate to **Settings** → **API**
3. Scroll down to **API Settings**
4. Click **"Reload schema cache"** button
5. Wait ~10-30 seconds for propagation

### Option 2: Via SQL Command
Run this SQL query in the Supabase SQL Editor:

```sql
NOTIFY pgrst, 'reload schema';
```

### Option 3: Restart Database Connection Pool
In Supabase Dashboard:
1. Go to **Database** → **Connection Pooler**
2. Click **"Restart"** or pause/unpause

### Option 4: Wait (Not Recommended)
PostgREST automatically reloads the schema cache periodically (usually every few minutes), but this is unreliable for development.

## Verification:
After reloading the schema cache, test the save operation again:
1. Generate a design
2. Click "Save Design"
3. Should now work without errors ✅

## Prevention:
After running ANY migrations that modify table structure, always reload the schema cache immediately.

## Technical Details:
- **Database:** Has `content` column ✅
- **API Layer (PostgREST):** Doesn't know about it yet ❌
- **Solution:** Sync API layer with database state

The migration `20250115000000_add_design_content.sql` added these columns:
- `content` (TEXT)
- `objectives` (TEXT[])
- `variables` (TEXT[])
- `special_considerations` (TEXT[])

All exist in database, but PostgREST needs to be notified.

