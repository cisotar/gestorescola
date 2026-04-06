import { create } from 'zustand'

const useToastStore = create((set) => ({
  message: '',
  type: 'ok',
  visible: false,
  _timer: null,

  show: (msg, type = 'ok') => {
    set(s => {
      clearTimeout(s._timer)
      const _timer = setTimeout(() => useToastStore.setState({ visible: false }), 3000)
      return { message: msg, type, visible: true, _timer }
    })
  },
}))

export const toast = (msg, type = 'ok') => useToastStore.getState().show(msg, type)

export default useToastStore
