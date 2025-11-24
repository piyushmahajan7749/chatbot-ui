# Hypothesis-Specific Saved Designs Feature

**Date:** November 24, 2025  
**Status:** ✅ COMPLETED

---

## Overview

This feature allows users to save generated experiment designs for specific hypotheses and load them later. When a user generates an experiment design for a hypothesis, it's automatically saved. On the hypotheses list page, a "Load Design" button appears below "Generate Experiment" button only for hypotheses that have saved designs.

---

## Implementation Details

### 1. Database Schema Extension

**File:** `app/api/design/draft/utils/persistence-firestore.ts`

Added three new functions to the Firestore persistence layer:

- **`saveHypothesisDesign(hypothesisId, designData)`**: Saves a design to a hypothesis's metadata
- **`getHypothesisSavedDesign(hypothesisId)`**: Retrieves the saved design for a hypothesis
- **`hasHypothesisSavedDesign(hypothesisId)`**: Checks if a hypothesis has a saved design

The saved design is stored in the `metadata.saved_design` field of each hypothesis document with the following structure:

```typescript
{
  generatedDesign: any,
  generatedLiteratureSummary?: any,
  generatedStatReview?: any,
  promptsUsed?: any[],
  savedAt: string (ISO timestamp)
}
```

### 2. API Endpoints

**New File:** `app/api/design/draft/hypothesis/[hypothesisId]/saved-design/route.ts`

Created two REST endpoints:

- **GET** `/api/design/draft/hypothesis/[hypothesisId]/saved-design`
  - Retrieves the saved design for a hypothesis
  - Returns 404 if no saved design exists
  - Returns all design data including prompts

- **POST** `/api/design/draft/hypothesis/[hypothesisId]/saved-design`
  - Saves a design for a hypothesis
  - Accepts: `generatedDesign`, `generatedLiteratureSummary`, `generatedStatReview`, `promptsUsed`
  - Auto-timestamps the save operation

### 3. Auto-Save on Generation

**File:** `app/api/design/draft/hypothesis/[hypothesisId]/design/route.ts`

Modified the design generation endpoint to automatically save the design after successful generation:

```typescript
// After generating design...
await saveHypothesisDesign(hypothesis.hypothesisId, {
  generatedDesign: state.reportWriterOutput,
  generatedLiteratureSummary: state.literatureScoutOutput,
  generatedStatReview: state.statCheckOutput,
  promptsUsed
})
```

The auto-save is wrapped in a try-catch to ensure generation doesn't fail if save fails.

### 4. UI Component Updates

**File:** `app/[locale]/[workspaceid]/design/components/design-review.tsx`

#### Added Props:
- `onLoadSavedDesign?: (hypothesis: DesignPlanHypothesis) => void`

#### New State:
- `hypothesesWithSavedDesigns`: Set of hypothesis IDs that have saved designs

#### New Effect:
Checks which hypotheses have saved designs on component mount:

```typescript
useEffect(() => {
  const checkSavedDesigns = async () => {
    // For each hypothesis, check if saved design exists
    // Store IDs in Set for quick lookup
  }
  checkSavedDesigns()
}, [topHypotheses])
```

#### UI Changes:
Added conditional "Load Design" button that only appears for hypotheses with saved designs:

```tsx
{hypothesesWithSavedDesigns.has(hypothesis.hypothesisId) && (
  <Button
    size="sm"
    variant="secondary"
    onClick={() => onLoadSavedDesign?.(hypothesis)}
  >
    <Download className="mr-2 size-4" />
    Load Design
  </Button>
)}
```

The button is positioned between "Generate Experiment Design" and "Customize Prompts" buttons.

### 5. Page Component Integration

**File:** `app/[locale]/[workspaceid]/design/[designid]/page.tsx`

Added new handler function:

```typescript
const handleLoadSavedDesign = useCallback(
  async (hypothesis: DesignPlanHypothesis) => {
    // Fetch saved design from API
    // Set all design state (generatedDesign, literature summary, etc.)
    // Show success toast
  },
  []
)
```

Passed handler to DesignReview component:

```tsx
<DesignReview
  // ... other props
  onLoadSavedDesign={handleLoadSavedDesign}
/>
```

---

## User Flow

### Generating and Saving a Design

1. User navigates to design page with hypotheses list
2. User clicks "Generate Experiment Design" for a hypothesis
3. Design generation runs (Literature Scout → Experiment Designer → Stat Check → Report Writer)
4. Design is automatically saved to hypothesis metadata
5. User sees the generated design

### Loading a Saved Design

1. User returns to hypotheses list page (or refreshes)
2. For hypotheses with saved designs, "Load Design" button appears
3. User clicks "Load Design"
4. Design is fetched from the database
5. All design data is restored (design, literature summary, stat review, prompts)
6. User sees the previously generated design instantly

---

## Technical Benefits

1. **No Schema Changes Required**: Uses existing `metadata` JSONB field in Firestore
2. **Backwards Compatible**: Existing hypotheses without saved designs work normally
3. **Auto-Save**: Users don't need to manually save designs
4. **Fast Loading**: Direct database lookup, no regeneration needed
5. **Complete Data Preservation**: Saves all design components including AI prompts

---

## Testing Checklist

- [x] Generate a design for a hypothesis
- [x] Verify auto-save completes without errors
- [x] Refresh page and verify "Load Design" button appears
- [x] Click "Load Design" and verify design loads correctly
- [x] Verify all design sections display (experiment design, literature, stats, materials)
- [x] Verify "Download Prompts" button works with loaded design
- [x] Verify hypotheses without saved designs don't show "Load Design" button
- [x] Generate design for multiple hypotheses and verify each loads independently

---

## Files Modified

1. `app/api/design/draft/utils/persistence-firestore.ts` - Added save/load functions
2. `app/api/design/draft/hypothesis/[hypothesisId]/design/route.ts` - Added auto-save
3. `app/[locale]/[workspaceid]/design/components/design-review.tsx` - Added Load Design button
4. `app/[locale]/[workspaceid]/design/[designid]/page.tsx` - Added load handler

## Files Created

1. `app/api/design/draft/hypothesis/[hypothesisId]/saved-design/route.ts` - New API endpoint

---

## Future Enhancements

Possible improvements for future iterations:

1. **Version History**: Keep multiple versions of saved designs per hypothesis
2. **Manual Save Button**: Allow users to manually save designs with notes
3. **Export/Import**: Export saved designs as JSON files
4. **Comparison View**: Compare multiple saved designs side-by-side
5. **Design Templates**: Create reusable templates from saved designs
6. **Collaboration**: Share saved designs with team members

---

## Notes

- The feature uses Firestore's document metadata field, which supports up to 10MB per document
- Each saved design includes full content, so large designs with many materials may approach this limit
- Consider implementing compression for very large designs in future versions
- The auto-save is non-blocking and won't fail the generation if save fails

