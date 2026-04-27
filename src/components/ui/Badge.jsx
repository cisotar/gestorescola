/**
 * Badge — pill compacto de status/etiqueta.
 *
 * Uso:
 *   <Badge variant="warn">Suspensa</Badge>
 *   <Badge variant="ok">Ativa</Badge>
 *
 * Variantes mapeadas para tokens do design system (tailwind.config.js):
 *   - "warn": atenção/suspenso (warn + amber)
 *   - "ok":   sucesso/ativo
 *   - "err":  erro
 *   - "info": neutro (default)
 */
const VARIANT_CLASSES = {
  warn: 'bg-amber-100 text-amber-800 border border-amber-300',
  ok:   'bg-ok-l text-ok border border-ok/30',
  err:  'bg-err-l text-err border border-err/30',
  info: 'bg-surf2 text-t2 border border-bdr',
}

export default function Badge({
  variant = 'info',
  className = '',
  children,
  ...rest
}) {
  const variantCls = VARIANT_CLASSES[variant] || VARIANT_CLASSES.info
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${variantCls} ${className}`}
      {...rest}
    >
      {children}
    </span>
  )
}
