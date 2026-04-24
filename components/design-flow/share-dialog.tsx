"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Check,
  Copy,
  FileDown,
  Globe,
  Link as LinkIcon,
  Loader2,
  Lock,
  Trash2,
  UserPlus
} from "lucide-react"
import type {
  CollaboratorRole,
  DesignPermission,
  Sharing
} from "@/types/sharing"
import {
  downloadJson,
  downloadMarkdown,
  downloadPdfFromElement,
  type ExportableDesign
} from "@/lib/design/export"

interface ShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  designId: string
  design: ExportableDesign & {
    sharing?: Sharing
    share_token?: string | null
  }
  onSharingChange?: (next: {
    sharing: Sharing
    share_token: string | null
  }) => void
  pdfTargetRef?: React.RefObject<HTMLElement>
}

export default function ShareDialog({
  open,
  onOpenChange,
  designId,
  design,
  onSharingChange,
  pdfTargetRef
}: ShareDialogProps) {
  const [sharing, setSharing] = useState<Sharing>(design.sharing ?? "private")
  const [shareToken, setShareToken] = useState<string | null>(
    design.share_token ?? null
  )
  const [isTogglingLink, setIsTogglingLink] = useState(false)
  const [copyOk, setCopyOk] = useState(false)

  const [collaborators, setCollaborators] = useState<DesignPermission[]>([])
  const [isLoadingCollabs, setIsLoadingCollabs] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("viewer")
  const [isInviting, setIsInviting] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  useEffect(() => {
    setSharing(design.sharing ?? "private")
    setShareToken(design.share_token ?? null)
  }, [design.sharing, design.share_token])

  const shareUrl = useMemo(() => {
    if (!shareToken || typeof window === "undefined") return ""
    return `${window.location.origin}/share/design/${shareToken}`
  }, [shareToken])

  const loadCollaborators = useCallback(async () => {
    setIsLoadingCollabs(true)
    try {
      const res = await fetch(`/api/design/${designId}/collaborators`)
      if (!res.ok) throw new Error("Failed to load collaborators")
      const data = await res.json()
      setCollaborators(data.collaborators ?? [])
    } catch (err: any) {
      toast.error(err?.message || "Could not load collaborators")
    } finally {
      setIsLoadingCollabs(false)
    }
  }, [designId])

  useEffect(() => {
    if (open) loadCollaborators()
  }, [open, loadCollaborators])

  const enableLink = useCallback(async () => {
    setIsTogglingLink(true)
    try {
      const res = await fetch(`/api/design/${designId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharing: "unlisted" })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to enable sharing")
      setSharing(data.sharing)
      setShareToken(data.share_token)
      onSharingChange?.({
        sharing: data.sharing,
        share_token: data.share_token
      })
      toast.success("Share link enabled")
    } catch (err: any) {
      toast.error(err?.message || "Failed to enable sharing")
    } finally {
      setIsTogglingLink(false)
    }
  }, [designId, onSharingChange])

  const rotateLink = useCallback(async () => {
    setIsTogglingLink(true)
    try {
      const res = await fetch(`/api/design/${designId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to rotate link")
      setSharing(data.sharing)
      setShareToken(data.share_token)
      onSharingChange?.({
        sharing: data.sharing,
        share_token: data.share_token
      })
      toast.success("New link generated; old link is revoked")
    } catch (err: any) {
      toast.error(err?.message || "Failed to rotate link")
    } finally {
      setIsTogglingLink(false)
    }
  }, [designId, onSharingChange])

  const disableLink = useCallback(async () => {
    setIsTogglingLink(true)
    try {
      const res = await fetch(`/api/design/${designId}/share`, {
        method: "DELETE"
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to disable sharing")
      setSharing("private")
      setShareToken(null)
      onSharingChange?.({ sharing: "private", share_token: null })
      toast.success("Link revoked")
    } catch (err: any) {
      toast.error(err?.message || "Failed to disable sharing")
    } finally {
      setIsTogglingLink(false)
    }
  }, [designId, onSharingChange])

  const changeVisibility = useCallback(
    async (next: Sharing) => {
      if (next === "private") {
        return disableLink()
      }
      setIsTogglingLink(true)
      try {
        const res = await fetch(`/api/design/${designId}/share`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sharing: next })
        })
        const data = await res.json()
        if (!res.ok)
          throw new Error(data.error || "Failed to update visibility")
        setSharing(data.sharing)
        setShareToken(data.share_token)
        onSharingChange?.({
          sharing: data.sharing,
          share_token: data.share_token
        })
      } catch (err: any) {
        toast.error(err?.message || "Failed to update visibility")
      } finally {
        setIsTogglingLink(false)
      }
    },
    [designId, onSharingChange, disableLink]
  )

  const copy = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 1500)
    } catch {
      toast.error("Couldn't copy link")
    }
  }, [shareUrl])

  const invite = useCallback(async () => {
    const email = inviteEmail.trim()
    if (!email || !email.includes("@")) {
      toast.error("Enter a valid email")
      return
    }
    setIsInviting(true)
    try {
      const res = await fetch(`/api/design/${designId}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: inviteRole })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to invite")
      setInviteEmail("")
      setCollaborators(prev => {
        const next = prev.filter(p => p.email !== data.collaborator.email)
        return [data.collaborator, ...next]
      })
      toast.success(
        data.collaborator.user_id
          ? `Invited ${email}`
          : `Invite sent — ${email} will get access after signing up`
      )
    } catch (err: any) {
      toast.error(err?.message || "Failed to invite")
    } finally {
      setIsInviting(false)
    }
  }, [designId, inviteEmail, inviteRole])

  const removeCollaborator = useCallback(
    async (email: string) => {
      try {
        const res = await fetch(
          `/api/design/${designId}/collaborators?email=${encodeURIComponent(email)}`,
          { method: "DELETE" }
        )
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Failed to remove")
        }
        setCollaborators(prev => prev.filter(p => p.email !== email))
        toast.success(`Removed ${email}`)
      } catch (err: any) {
        toast.error(err?.message || "Failed to remove")
      }
    },
    [designId]
  )

  const handleExportPdf = useCallback(async () => {
    const target = pdfTargetRef?.current
    if (!target) {
      toast.error("Nothing to export yet")
      return
    }
    setIsExportingPdf(true)
    try {
      await downloadPdfFromElement(target, design)
    } catch (err: any) {
      toast.error(err?.message || "PDF export failed")
    } finally {
      setIsExportingPdf(false)
    }
  }, [pdfTargetRef, design])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share this design</DialogTitle>
          <DialogDescription>
            Share a link, invite collaborators, or export a copy.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="link">
              <LinkIcon className="mr-2 size-4" /> Link
            </TabsTrigger>
            <TabsTrigger value="people">
              <UserPlus className="mr-2 size-4" /> People
            </TabsTrigger>
            <TabsTrigger value="export">
              <FileDown className="mr-2 size-4" /> Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select
                value={sharing}
                onValueChange={v => changeVisibility(v as Sharing)}
                disabled={isTogglingLink}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">
                    <span className="flex items-center gap-2">
                      <Lock className="size-4" /> Private — only you & invited
                      collaborators
                    </span>
                  </SelectItem>
                  <SelectItem value="unlisted">
                    <span className="flex items-center gap-2">
                      <LinkIcon className="size-4" /> Unlisted — anyone with the
                      link
                    </span>
                  </SelectItem>
                  <SelectItem value="public">
                    <span className="flex items-center gap-2">
                      <Globe className="size-4" /> Public — anyone with the link
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sharing !== "private" && shareToken ? (
              <div className="space-y-2">
                <Label>Share link</Label>
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="flex-1" />
                  <Button variant="outline" onClick={copy}>
                    {copyOk ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={rotateLink}
                    disabled={isTogglingLink}
                  >
                    Rotate link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={disableLink}
                    disabled={isTogglingLink}
                  >
                    Revoke link
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                onClick={enableLink}
                disabled={isTogglingLink}
                className="w-full"
              >
                {isTogglingLink ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <LinkIcon className="mr-2 size-4" />
                )}
                Create share link
              </Button>
            )}
          </TabsContent>

          <TabsContent value="people" className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@lab.org"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !isInviting) invite()
                }}
                className="flex-1"
              />
              <Select
                value={inviteRole}
                onValueChange={v => setInviteRole(v as CollaboratorRole)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={invite} disabled={isInviting}>
                {isInviting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Invite"
                )}
              </Button>
            </div>

            <div className="space-y-1">
              {isLoadingCollabs ? (
                <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : collaborators.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">
                  No collaborators yet.
                </p>
              ) : (
                collaborators.map(c => (
                  <div
                    key={c.id}
                    className="hover:bg-muted/40 flex items-center justify-between rounded-md px-2 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {c.email}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {c.user_id ? c.role : `Pending · ${c.role}`}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCollaborator(c.email)}
                      aria-label={`Remove ${c.email}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="export" className="space-y-3 pt-4">
            <p className="text-muted-foreground text-sm">
              Download a copy of this design.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button
                variant="outline"
                onClick={() => downloadMarkdown(design)}
              >
                <FileDown className="mr-2 size-4" /> Markdown
              </Button>
              <Button variant="outline" onClick={() => downloadJson(design)}>
                <FileDown className="mr-2 size-4" /> JSON
              </Button>
              <Button
                variant="outline"
                onClick={handleExportPdf}
                disabled={isExportingPdf || !pdfTargetRef?.current}
              >
                {isExportingPdf ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <FileDown className="mr-2 size-4" />
                )}
                PDF
              </Button>
            </div>
            {!pdfTargetRef?.current && (
              <p className="text-muted-foreground text-xs">
                PDF export captures the rendered design view.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
