import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface TabItem {
  label: string
  to: string
  icon?: LucideIcon
}

export function BottomTabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 glass px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
      <div
        className="mx-auto grid max-w-md gap-2"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'inline-flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[0.75rem] px-3 text-center font-bold transition',
                  Icon ? 'text-xs' : 'text-lg',
                  isActive
                    ? 'bg-[#d1fc00] text-[#0c0f10] shadow-[0_20px_40px_rgba(44,47,48,0.06)]'
                    : 'text-surface-600',
                )
              }
            >
              {Icon ? <Icon className="h-5 w-5" aria-hidden /> : null}
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
