type StatusToggleProps = {
  active: boolean
  disabled?: boolean
  onClick: () => void
}

export function StatusToggle({ active, disabled = false, onClick }: StatusToggleProps) {
  const label = active ? 'Inativar' : 'Ativar'

  return (
    <button
      type="button"
      className={`status-toggle ${active ? 'status-toggle--active' : 'status-toggle--inactive'}`}
      role="switch"
      aria-checked={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <span aria-hidden="true" />
    </button>
  )
}
