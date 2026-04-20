// AlertaImpeditivoModal — modal de excesso de tempo na grade especial

import Modal from '../../ui/Modal'

export default function AlertaImpeditivoModal({ open, excedente, duracaoSugerida, onAplicar, onFechar }) {
  return (
    <Modal open={open} onClose={onFechar} title="Grade especial excede o tempo disponível" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-t1">
          Excedente: <span className="font-mono font-semibold">{excedente} minuto{excedente !== 1 ? 's' : ''}</span>.
        </p>
        {duracaoSugerida !== null ? (
          <>
            <p className="text-sm text-t2">
              Duração sugerida por aula: <span className="font-mono font-semibold">{duracaoSugerida} min</span>.
            </p>
            <button className="btn btn-dark btn-sm w-full" onClick={onAplicar}>
              Aplicar sugestão
            </button>
          </>
        ) : (
          <p className="text-sm text-warn font-medium">
            Ajuste manual necessário — não há duração viável para as aulas.
          </p>
        )}
        <div className="flex justify-end pt-1">
          <button className="btn btn-ghost btn-sm" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}
