import { FC, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "../ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "../ui/card"
import { Badge } from "../ui/badge"
import { Separator } from "../ui/separator"
import { IconCopy, IconHeartHandshake, IconLoader2 } from "@tabler/icons-react"

interface AffiliateDashboard {
  isAffiliate: true
  code: string
  displayName: string | null
  status: "active" | "disabled"
  commissionRate: number
  viewerBonusCredits: number
  shareUrl: string
  stats: {
    signups: number
    conversions: number
    commissionTotalUsd: number
    commissionPendingUsd: number
  }
}

type Resp = AffiliateDashboard | { isAffiliate: false }

const usd = (n: number) =>
  `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const num = (n: number) => (n || 0).toLocaleString("en-US")

/**
 * Influencer's creator-program dashboard. Renders nothing for regular users
 * (so it can sit unconditionally below the billing panel). Shows the share
 * link, referral stats, and commission owed; payouts are handled manually.
 */
export const AffiliatePanel: FC = () => {
  const [data, setData] = useState<AffiliateDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/affiliate/me")
      if (!res.ok) return
      const json = (await res.json()) as Resp
      if (json && (json as AffiliateDashboard).isAffiliate) {
        setData(json as AffiliateDashboard)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Silent while loading and for non-affiliates — nothing to show.
  if (loading || !data) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.shareUrl)
      toast.success("Share link copied")
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.")
    }
  }

  return (
    <Card className="border-line-strong border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <IconHeartHandshake size={18} className="text-primary" />
            Creator program
          </CardTitle>
          <Badge variant={data.status === "active" ? "success" : "secondary"}>
            {data.status === "active" ? "Active" : "Paused"}
          </Badge>
        </div>
        <CardDescription>
          Share your link. Your viewers get {num(data.viewerBonusCredits)} bonus
          credits when they subscribe, and you earn{" "}
          {Math.round(data.commissionRate * 100)}% commission on each
          subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Share link */}
        <div className="space-y-1.5">
          <div className="text-ink-2 text-xs font-medium">Your share link</div>
          <div className="flex items-center gap-2">
            <code className="bg-paper-2 border-line text-ink-2 min-w-0 flex-1 truncate rounded-md border px-2.5 py-2 text-xs">
              {data.shareUrl}
            </code>
            <Button variant="outline" size="sm" onClick={copy}>
              <IconCopy size={15} className="mr-1" />
              Copy
            </Button>
          </div>
          <p className="text-muted text-xs">
            Code: <span className="font-mono">{data.code}</span>
          </p>
        </div>

        <Separator />

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sign-ups" value={num(data.stats.signups)} />
          <Stat label="Subscribed" value={num(data.stats.conversions)} />
          <Stat label="Earned" value={usd(data.stats.commissionTotalUsd)} />
          <Stat
            label="Owed to you"
            value={usd(data.stats.commissionPendingUsd)}
          />
        </div>
        <p className="text-muted text-xs">
          Commission is paid out manually — we’ll reach out about payment.
        </p>
      </CardContent>
    </Card>
  )
}

const Stat: FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-paper-2 border-line rounded-md border p-2.5">
    <div className="text-ink text-lg font-semibold leading-tight">{value}</div>
    <div className="text-muted text-[11px]">{label}</div>
  </div>
)
