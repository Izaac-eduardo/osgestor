export function LoadingSkeleton({ lines = 4, label = 'Carregando dados' }: { lines?: number; label?: string }) {
  return <div className="skeleton" role="status" aria-label={label}>{Array.from({ length: lines }, (_, index) => <span key={index} />)}<span className="sr-only">{label}</span></div>
}