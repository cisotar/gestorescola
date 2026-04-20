export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const h = (s) => String(s ?? '')

export const subKey = (teacherId, day, slot) => `${teacherId}||${day}||${slot}`
