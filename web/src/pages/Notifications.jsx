import { Bell } from 'lucide-react'
import { Reveal } from '../components/Reveal.jsx'
import { SectionCard } from '../components/SectionCard.jsx'
import { NotificationsBody } from '../components/notifications/NotificationsSection.jsx'

/**
 * Notifications — its own settings area (not an "integration"). Configure where
 * evidence-based status digests go (Slack, Discord, Google Chat, Microsoft Teams,
 * a webhook, or email) and which digests each channel receives (weekly status,
 * stale PRs, out-of-office).
 */
export default function Notifications() {
  return (
    <div className="w-full">
      <Reveal>
        <div className="mb-8 flex items-start gap-3">
          <span className="mt-0.5 grid place-items-center w-9 h-9 rounded-[var(--radius-btn)] bg-[var(--info)]/10 border border-[var(--info)]/20 shrink-0">
            <Bell size={17} className="text-[var(--info)]" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[var(--text)] tracking-tight">Notifications</h1>
            <p className="text-sm text-[var(--text-faint)] mt-1">Push evidence-based status to where your team works — and choose which digests each channel gets.</p>
          </div>
        </div>
      </Reveal>

      <SectionCard
        icon={Bell}
        title="Channels & digests"
        description="Connect Slack, Discord, Google Chat, Microsoft Teams, a webhook, or email — then pick the digests (weekly status, stale PRs, OOO) for each."
        delay={0.05}
        accent="var(--info)"
      >
        <NotificationsBody />
      </SectionCard>
    </div>
  )
}
