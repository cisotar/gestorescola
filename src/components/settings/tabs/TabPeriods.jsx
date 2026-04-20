// TabPeriods — configuração de períodos por segmento

import useAppStore from '../../../store/useAppStore'
import { CardPeriodo } from '../periods'

export default function TabPeriods() {
  const store = useAppStore()

  return (
    <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
      {store.segments.map(seg => (
        <CardPeriodo key={seg.id} seg={seg} store={store} />
      ))}
    </div>
  )
}
