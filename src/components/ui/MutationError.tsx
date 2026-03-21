interface MutationErrorProps {
  error: Error | null | unknown
  className?: string
}

export function MutationError({ error, className }: MutationErrorProps) {
  if (!error) {
    return null
  }

  return (
    <p className={className ?? 'text-base text-danger'}>
      {error instanceof Error ? error.message : String(error)}
    </p>
  )
}
