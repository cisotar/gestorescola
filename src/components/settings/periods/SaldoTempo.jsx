// SaldoTempo — indicador visual de saldo de tempo do turno

export default function SaldoTempo({ tempoTotal, tempoLetivo, tempoResidual, tempoEspecial = 0 }) {
  const fmtMin = (m) => {
    const total = Math.abs(m)
    const h = Math.floor(total / 60)
    const min = total % 60
    return `${h}h ${min}min`
  }

  const corResidual = tempoResidual >= 0 ? 'text-ok' : 'text-err'

  return (
    <div className="flex flex-wrap gap-2">
      <span className="badge bg-surf2 text-t2 text-xs">
        Total: <span className="font-mono ml-1">{fmtMin(tempoTotal)}</span>
      </span>
      <span className="badge bg-surf2 text-t2 text-xs">
        Letivo: <span className="font-mono ml-1">{fmtMin(tempoLetivo)}</span>
      </span>
      {tempoEspecial > 0 && (
        <span className="badge bg-surf2 text-t2 text-xs">
          Especial: <span className="font-mono ml-1">{fmtMin(tempoEspecial)}</span>
        </span>
      )}
      <span className={`badge bg-surf2 text-xs ${corResidual}`}>
        Residual: <span className="font-mono ml-1">{tempoResidual < 0 ? '-' : ''}{fmtMin(tempoResidual)}</span>
      </span>
    </div>
  )
}
