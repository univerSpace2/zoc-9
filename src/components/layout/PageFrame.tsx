import type { PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

export function PageFrame({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('mx-auto w-full max-w-[30rem] px-4 pb-28 pt-4 sm:px-5', className)}>{children}</div>
}
