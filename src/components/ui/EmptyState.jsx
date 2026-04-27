// EmptyState — componente genérico para telas/seções vazias.
// Props:
//   - icon:        ReactNode opcional (ex.: <svg .../>) renderizado acima do título.
//   - title:       string obrigatória.
//   - description: string ou ReactNode opcional, renderizado abaixo do título.
//   - actions:     ReactNode opcional (botões/links) renderizado ao final.
export default function EmptyState({ icon = null, title, description = null, actions = null }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 max-w-md mx-auto p-8">
      {icon && (
        <div className="text-t3 mb-1" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="text-xl font-bold text-t1">{title}</h2>
      {description && (
        <div className="text-sm text-t2 leading-relaxed">
          {description}
        </div>
      )}
      {actions && (
        <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}
