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
- ✅ Round 3: Dark sidebar navigation overhaul (zinc-900 theme)
  - Created `components/navigation/app-sidebar.tsx` with dark sidebar navigation
  - Created `components/navigation/app-layout.tsx` as new root layout wrapper
  - Replaced tab-based Dashboard with persistent dark sidebar
  - Features: Shadow AI branding, projects list with active states, quick links (All Chats, Files, Reports)
  - Collapsible sidebar with localStorage persistence and tooltips
  - User info and settings at bottom, workspace switcher integration
  - Responsive design following JourneyMaker dark theme pattern
- ✅ Round 4: Report integration with projects
  - Added project_id column to reports table via migration (20260321_add_project_to_reports.sql)
  - Created getReportsByProject function in db/reports.ts for project-scoped report filtering
  - Enhanced StudioCanvas with tabbed interface (Overview + Reports tabs)
  - Reports tab shows project-specific reports with empty state and New Report CTA
  - Updated overview cards to include reports count (4-column grid: chats, files, reports, activity)
  - Enhanced recent activity to display reports with proper icons and type detection
  - Added New Report button to project header that pre-links to project context
  - Modified CreateReport component to accept projectId prop and include in createState
  - Updated ReportItem to display project name when report is linked to a project
  - Created dedicated `/reports/new` route with projectId query parameter support
  - Integrated reports into project ecosystem with proper context and navigation flow
- ✅ Round 5: Project dashboard and overview enhancement
  - Enhanced project overview with JourneyMaker-inspired card-based layout
  - Added comprehensive project dashboard with color-coded stats cards (conversations, documents, reports, weekly activity)
  - Implemented project settings modal (`components/studio/project-settings-modal.tsx`) for editing name, description, tags, and delete functionality
  - Added "Recent Chats" tab with preview of last message in each conversation
  - Created three main tabs: Overview, Recent Chats, and Reports for better organization
  - Enhanced visual design with blue/emerald/orange/purple color-coded stat cards and improved spacing
  - Added complete set of quick action buttons: New Chat, Upload File, New Report
  - Implemented real-time activity tracking, file size calculations, and weekly activity metrics
  - Added proper loading states, error handling, and responsive design throughout
  - Enhanced getMessagesByChatId function to order messages by created_at descending for latest-first display
- ✅ Round 6: Chat UI improvements for scientific content
  - Created `components/chat/thinking-indicator.tsx` with animated three-dot thinking animation (inspired by JourneyMaker)
  - Enhanced message rendering for scientific content with ChemicalFormula component for better chemical formula display
  - Improved message-markdown component with scientific notation preprocessing (e.g., 1.23e-4 → 1.23 × 10^-4)
  - Enhanced code block styling with improved border, header styling, line numbers for long blocks, and better button animations
  - Added bookmark action to message actions (copy, edit, regenerate, bookmark) with visual feedback
  - Improved chat input file attachment UX with tooltips, multiple file support, and better visual styling
  - Enhanced inline code styling with better background and font rendering
  - Replaced simple loading indicator with elegant ThinkingIndicator component

## Round Plan
- Round 1 (DONE): Project management foundation — types, DB, CRUD, list page, detail page, sidebar
- Round 2 (DONE): Chat + Studio two-panel layout — restructure workspace to left chat / right canvas pattern from JourneyMaker
- Round 3 (DONE): Dark sidebar navigation — replace current sidebar with JourneyMaker-style dark zinc sidebar with project list
- Round 4 (DONE): Report integration — connect reports to projects, report generation within project context
- Round 5 (DONE): Project dashboard — overview cards showing chat count, file count, recent activity, quick actions
- Round 6 (DONE): Chat UI improvements — better message styling, scientific content formatting, code blocks
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
