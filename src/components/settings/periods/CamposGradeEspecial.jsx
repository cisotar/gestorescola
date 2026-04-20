// CamposGradeEspecial — editor de grade especial dentro de CardPeriodo

import { uid } from '../../../lib/helpers'

export default function CamposGradeEspecial({ gradeEspecial, onChange }) {
  const itens = gradeEspecial.itens ?? []

  const handleCampoGlobal = (campo, valor) => {
    onChange({ ...gradeEspecial, [campo]: valor })
  }

  const handleAdicionarIntervalo = () => {
    const novoItem = { id: uid(), apos: 0, duracao: 15 }
    onChange({ ...gradeEspecial, itens: [...itens, novoItem] })
  }

  const handleRemoverItem = (id) => {
    onChange({ ...gradeEspecial, itens: itens.filter(i => i.id !== id) })
  }

  const handleEditarItem = (id, campo, valor) => {
    onChange({
      ...gradeEspecial,
      itens: itens.map(i => i.id === id ? { ...i, [campo]: valor } : i),
    })
  }

  return (
    <div className="space-y-3">
      <label className="lbl !mb-0">Grade Especial</label>

      {/* Campos globais */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="lbl">Início especial</label>
          <input
            className="inp"
            type="time"
            value={gradeEspecial.inicioEspecial ?? ''}
            onChange={e => handleCampoGlobal('inicioEspecial', e.target.value)}
          />
        </div>
        <div>
          <label className="lbl">Duração aula (min)</label>
          <input
            className="inp"
            type="number"
            min="1"
            value={gradeEspecial.duracaoAula ?? 40}
            onChange={e => handleCampoGlobal('duracaoAula', Number(e.target.value) || 40)}
          />
        </div>
        <div>
          <label className="lbl">Qtd. aulas</label>
          <input
            className="inp"
            type="number"
            min="1"
            value={gradeEspecial.qtd ?? 1}
            onChange={e => handleCampoGlobal('qtd', Number(e.target.value) || 1)}
          />
        </div>
      </div>

      {/* Lista de intervalos */}
      {itens.length === 0 && (
        <p className="text-t3 text-sm py-1">Nenhum intervalo na grade especial.</p>
      )}
      <div className="space-y-2">
        {itens.map(item => (
          <div key={item.id} className="flex items-center gap-2 bg-surf2 rounded-xl px-3 py-2 flex-wrap">
            <span className="text-xs text-t2 shrink-0">Após o Tempo nº</span>
            <input
              className="inp !w-16 py-1 text-xs text-center"
              type="number"
              min="0"
              value={item.apos ?? 0}
              onChange={e => handleEditarItem(item.id, 'apos', Number(e.target.value))}
            />
            <span className="text-xs text-t2 shrink-0">Duração (min)</span>
            <input
              className="inp !w-20 py-1 text-xs text-center"
              type="number"
              min="1"
              value={item.duracao}
              onChange={e => handleEditarItem(item.id, 'duracao', Number(e.target.value))}
            />
            <button
              className="ml-auto btn btn-danger btn-xs"
              title="Remover intervalo"
              onClick={() => handleRemoverItem(item.id)}
            >Remover</button>
          </div>
        ))}
      </div>

      {/* Botão de adição */}
      <div className="flex gap-2 flex-wrap">
        <button className="btn btn-ghost btn-xs" onClick={handleAdicionarIntervalo}>+ Adicionar intervalo</button>
      </div>
    </div>
  )
}
