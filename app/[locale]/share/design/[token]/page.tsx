"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DesignReview } from "../../../[workspaceid]/design/components/design-review"
import {
  downloadJson,
  downloadMarkdown,
  downloadPdfFromElement,
  type ExportableDesign
} from "@/lib/design/export"
import { toast } from "sonner"
import { supabase } from "@/lib/supabase/browser-client"
import { Copy, FileDown, Loader2 } from "lucide-react"

interface PublicDesign {
  id: string
  name?: string
  description?: string
  content?: string | null
  sharing?: string
  workspace_id?: string
  forked_from?: any
}

export default function PublicDesignViewer({
  params
}: {
  params: { token: string; locale: string }
}) {
  const router = useRouter()
  const [design, setDesign] = useState<PublicDesign | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isForking, setIsForking] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/design/by-token/${params.token}`)
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "This link is invalid or has been revoked."
              : "Failed to load"
          )
        }
        const data = await res.json()
        if (!cancelled) setDesign(data)
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || "Failed to load design")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [params.token])

  const parsedContent = useMemo(() => {
    if (!design?.content) return null
    if (typeof design.content !== "string") return design.content
    try {
      return JSON.parse(design.content)
    } catch {
      return null
    }
  }, [design?.content])

  const forkToWorkspace = useCallback(async () => {
    if (!design) return
    setIsForking(true)
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession()
      if (!session) {
        router.push(
          `/${params.locale}/login?next=/${params.locale}/share/design/${params.token}`
        )
        return
      }

      // Pick the user's first workspace to fork into. API requires workspaceId.
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: true })
        .limit(1)

      const workspaceId = workspaces?.[0]?.id
      if (!workspaceId) {
        toast.error("No workspace available to fork into.")
        return
      }

      const res = await fetch(`/api/design/${design.id}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Fork failed")

      toast.success("Copied to your workspace")
      router.push(`/${params.locale}/${workspaceId}/design/${data.design.id}`)
    } catch (err: any) {
      toast.error(err?.message || "Fork failed")
    } finally {
      setIsForking(false)
    }
  }, [design, params.locale, params.token, router])

  const copyLink = useCallback(async () => {
    if (typeof window === "undefined") return
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success("Link copied")
    } catch {
      toast.error("Couldn't copy")
    }
  }, [])

  const handlePdf = useCallback(async () => {
    if (!exportRef.current || !design) return
    setIsExportingPdf(true)
    try {
      await downloadPdfFromElement(
        exportRef.current,
        design as ExportableDesign
      )
    } catch (err: any) {
      toast.error(err?.message || "PDF export failed")
    } finally {
      setIsExportingPdf(false)
    }
  }, [design])

  if (isLoading) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-muted-foreground text-sm">Loading design…</p>
      </div>
    )
  }

  if (loadError || !design) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-2xl font-semibold">Design unavailable</h1>
        <p className="text-muted-foreground">
          {loadError || "This link is invalid or has been revoked."}
        </p>
      </div>
    )
  }

  const title = design.name || "Shared design"

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{title}</h1>
          <p className="text-muted-foreground text-xs">
            Read-only shared view
            {design.forked_from ? " · Forked copy" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyLink}>
            <Copy className="mr-2 size-4" /> Copy link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadMarkdown(design as ExportableDesign)}
          >
            <FileDown className="mr-2 size-4" /> Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadJson(design as ExportableDesign)}
          >
            <FileDown className="mr-2 size-4" /> JSON
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePdf}
            disabled={isExportingPdf}
          >
            {isExportingPdf ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileDown className="mr-2 size-4" />
            )}
            PDF
          </Button>
          <Button size="sm" onClick={forkToWorkspace} disabled={isForking}>
            {isForking ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}
            Duplicate to my workspace
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        <div ref={exportRef} className="mx-auto max-w-5xl">
          <DesignReview
            designData={{
              name: design.name,
              description: design.description
            }}
            planStatus={null}
            topHypotheses={
              parsedContent?.selectedHypothesis
                ? [parsedContent.selectedHypothesis]
                : []
            }
            logs={[]}
            onGenerateDesign={async () => {}}
            onCustomizePrompts={() => {}}
            generatingHypothesisId={null}
            selectedHypothesisId={parsedContent?.selectedHypothesisId ?? null}
            generatedDesign={parsedContent?.generatedDesign ?? null}
            generatedLiteratureSummary={
              parsedContent?.generatedLiteratureSummary ?? null
            }
            generatedStatReview={parsedContent?.generatedStatReview ?? null}
            designError={null}
            onRegenerateDesign={async () => {}}
            promptsUsed={parsedContent?.promptsUsed ?? null}
            onLoadSavedDesign={async () => {}}
            readOnly
          />
        </div>
      </div>
    </div>
  )
}
