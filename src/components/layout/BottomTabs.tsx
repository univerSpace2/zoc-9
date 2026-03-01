import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface TabItem {
  label: string
  to: string
}

export function BottomTabs({ items }: { items: TabItem[] }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-surface-200 bg-white/96 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md">
      <div
        className="mx-auto grid max-w-md gap-2"
        style={{
          gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        }}
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'inline-flex min-h-12 items-center justify-center rounded-2xl px-3 text-center text-lg font-bold transition',
                isActive
                  ? 'bg-primary text-white shadow-[0_14px_24px_-20px_rgba(29,78,216,0.8)]'
                  : 'bg-surface-100 text-surface-700',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
