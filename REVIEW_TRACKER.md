# ShadowAI Web App — Overnight Review Tracker

## Branch: feature/shadowai-projects-ui (off shadowai)

## Completed Rounds
- ✅ Round 1: Project management foundation (types, DB, CRUD, list page, detail page, sidebar)
- ✅ Round 2: Chat + Studio two-panel layout (resizable chat panel + canvas area)
  - Created `components/studio/studio-layout.tsx` with resizable two-panel layout
  - Created `components/studio/studio-chat-panel.tsx` that wraps existing ChatUI 
  - Created `components/studio/studio-canvas.tsx` for project overview display
  - Updated project detail page to use new studio layout
  - JourneyMaker color palette: slate-200 chat bg, slate-50 canvas bg, border-slate-300
  - Resizable chat panel: min 320px, max 640px, draggable resize handle

## Round Plan
- Round 1 (DONE): Project management foundation — types, DB, CRUD, list page, detail page, sidebar
- Round 2 (DONE): Chat + Studio two-panel layout — restructure workspace to left chat / right canvas pattern from JourneyMaker
- Round 3: Dark sidebar navigation — replace current sidebar with JourneyMaker-style dark zinc sidebar with project list
- Round 4: Report integration — connect reports to projects, report generation within project context
- Round 5: Project dashboard — overview cards showing chat count, file count, recent activity, quick actions
- Round 6: Chat UI improvements — better message styling, scientific content formatting, code blocks
- Round 7: Search & filtering — global search across projects, chats, files; advanced filters
- Round 8: Polish & cleanup — consistent styling, loading states, error handling, responsive design

## Reference
- JourneyMaker UI: /home/node/.openclaw/workspace/projects/gamethinkingai (branch journeymaker2)
- Key patterns: ChatPanel, CanvasView, WorkspaceLayout, studioStore (Zustand)
- Color palette: zinc-900 sidebar, zinc-50/slate-50 content, blue-600 accents

## Rules
- Always work on branch feature/shadowai-projects-ui
- Commit after each round with descriptive message
- Do NOT push (no write access)
- Reference JourneyMaker patterns but adapt for ShadowAI's Supabase backend (not Firebase)
- Keep existing Supabase auth and DB patterns intact
- Update this file after each round
