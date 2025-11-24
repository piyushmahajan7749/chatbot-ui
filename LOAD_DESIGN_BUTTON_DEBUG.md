# Load Design Button Debugging Guide

**Issue:** "Load Design" button not appearing for hypotheses with saved designs

---

## Debugging Steps

### Step 1: Check if Design is Being Auto-Saved

1. **Generate a design for a hypothesis**
2. **Check your server logs** (terminal where Next.js is running)

Look for these log messages:

```
[HYPOTHESIS-DESIGN] Starting auto-save for hypothesis 12345678...
[PERSISTENCE] Saving design for hypothesis 12345678...
✅ [PERSISTENCE] Successfully saved design for hypothesis 12345678... at 2025-11-24T...
✅ [HYPOTHESIS-DESIGN] Auto-saved design for hypothesis 12345678...
```

**If you DON'T see these logs:**
- The auto-save is not being triggered
- Check if the design generation completed successfully

**If you see error logs:**
- There's an issue with Firestore connection or permissions
- Check your Firebase configuration

---

### Step 2: Check if the Button Check is Running

1. **Go back to the hypotheses list** (click "Change hypothesis" or refresh)
2. **Open browser console** (F12 → Console tab)

Look for these log messages:

```
[DESIGN_REVIEW] Checking 5 hypotheses for saved designs...
[DESIGN_REVIEW] Hypothesis 12345678... saved design check: ✅ HAS SAVED DESIGN
[DESIGN_REVIEW] Found 1 hypotheses with saved designs
```

**If you DON'T see these logs:**
- The useEffect is not running
- Check if topHypotheses prop is populated

**If you see "❌ No saved design" for your hypothesis:**
- The API is not finding the saved design
- Check server logs (Step 3)

---

### Step 3: Check API Endpoint

**In browser console**, run this command (replace with your hypothesis ID):

```javascript
fetch('/api/design/draft/hypothesis/YOUR-HYPOTHESIS-ID/saved-design')
  .then(r => r.json())
  .then(d => console.log('API Response:', d))
```

**Expected response if design exists:**
```json
{
  "success": true,
  "generatedDesign": { ... },
  "generatedLiteratureSummary": { ... },
  "generatedStatReview": { ... },
  "promptsUsed": [ ... ],
  "savedAt": "2025-11-24T..."
}
```

**If you get 404 response:**
```json
{
  "success": false,
  "error": "No saved design found"
}
```

Check server logs for:
```
[SAVED-DESIGN-GET] Checking for saved design: 12345678...
[PERSISTENCE] Getting saved design for hypothesis 12345678...
[PERSISTENCE] No saved_design in metadata for hypothesis 12345678...
```

---

### Step 4: Verify Firestore Data

If the API returns 404, check Firestore directly:

1. **Open Firebase Console** → Firestore Database
2. **Navigate to:** `hypotheses` collection
3. **Find your hypothesis document** by ID
4. **Check the `metadata` field**

It should contain:
```json
{
  "metadata": {
    "saved_design": {
      "generatedDesign": { ... },
      "generatedLiteratureSummary": { ... },
      "generatedStatReview": { ... },
      "promptsUsed": [ ... ],
      "savedAt": "2025-11-24T..."
    }
  }
}
```

**If `metadata.saved_design` is missing:**
- The auto-save failed
- Go back to Step 1 and check server logs

**If `metadata.saved_design` exists but API returns 404:**
- There's an issue with the `getHypothesisById` function
- Check Firebase permissions

---

## Common Issues & Solutions

### Issue 1: Design Generated But Not Saved

**Symptoms:**
- Server logs show design generation completed
- No auto-save logs appear

**Solution:**
- Check if `saveHypothesisDesign` import is correct in design route
- Verify Firebase Admin SDK is initialized

---

### Issue 2: Button Check Never Runs

**Symptoms:**
- No console logs from `[DESIGN_REVIEW]`
- Button doesn't appear

**Solution:**
- Verify `topHypotheses` prop is not empty
- Check if component is mounting correctly
- Try refreshing the page

---

### Issue 3: API Returns 404 But Data Exists in Firestore

**Symptoms:**
- Firestore Console shows `metadata.saved_design`
- API logs show "No saved_design in metadata"

**Possible Causes:**
1. **Metadata not being loaded correctly:**
   - Check `getHypothesisById` function
   - Ensure it merges metadata from document

2. **Wrong hypothesis ID:**
   - Verify the ID being checked matches Firestore document ID
   - Check for typos or trailing characters

---

### Issue 4: Auto-Save Fails Silently

**Symptoms:**
- Design generates successfully
- Log shows "Auto-save returned false"

**Solution:**
Check server logs for:
```
[PERSISTENCE] Hypothesis 12345678... not found
```

This means the hypothesis doesn't exist in Firestore. Possible causes:
- Hypothesis was deleted
- ID mismatch
- Database connection issue

---

## Quick Test Script

Run this in your browser console to test the full flow:

```javascript
// 1. Get your hypothesis ID from the UI
const hypothesisId = "YOUR-HYPOTHESIS-ID"

// 2. Check if saved design exists
fetch(`/api/design/draft/hypothesis/${hypothesisId}/saved-design`)
  .then(r => {
    console.log('Status:', r.status)
    return r.json()
  })
  .then(data => {
    console.log('Response:', data)
    if (data.success) {
      console.log('✅ Saved design EXISTS')
      console.log('Saved at:', data.savedAt)
    } else {
      console.log('❌ No saved design found')
    }
  })
  .catch(err => console.error('Error:', err))
```

---

## Expected Full Flow Logs

When everything works correctly, you should see:

### During Generation:
```
[HYPOTHESIS-DESIGN] Starting auto-save for hypothesis 12345678...
[PERSISTENCE] Saving design for hypothesis 12345678...
✅ [PERSISTENCE] Successfully saved design for hypothesis 12345678... at 2025-11-24T10:30:00Z
✅ [HYPOTHESIS-DESIGN] Auto-saved design for hypothesis 12345678...
```

### When Returning to Hypotheses List:
```
[DESIGN_REVIEW] Checking 5 hypotheses for saved designs...
[SAVED-DESIGN-GET] Checking for saved design: 12345678...
[PERSISTENCE] Getting saved design for hypothesis 12345678...
✅ [PERSISTENCE] Found saved design for hypothesis 12345678... (saved at: 2025-11-24T10:30:00Z)
✅ [SAVED-DESIGN-GET] Found saved design for 12345678... (saved at: 2025-11-24T10:30:00Z)
[DESIGN_REVIEW] Hypothesis 12345678... saved design check: ✅ HAS SAVED DESIGN
[DESIGN_REVIEW] Found 1 hypotheses with saved designs
```

### When Clicking "Load Design":
```
[SAVED-DESIGN-GET] Checking for saved design: 12345678...
[PERSISTENCE] Getting saved design for hypothesis 12345678...
✅ [PERSISTENCE] Found saved design for hypothesis 12345678...
✅ [SAVED-DESIGN-GET] Found saved design for 12345678...
```

---

## Next Steps

After running through these debugging steps, you should be able to identify where the issue is:

1. **Auto-save failing** → Check Firebase connection and permissions
2. **Button check not running** → Check component props and mounting
3. **API returning 404** → Check Firestore data and query logic
4. **Data exists but button hidden** → Check React state updates

Please run through these steps and let me know what logs you're seeing (or not seeing) so I can help you fix the specific issue! 🔍

