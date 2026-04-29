import { useEffect, forwardRef } from 'react'

const Modal = forwardRef(function Modal({ open, onClose, title, children, size = 'md' }, ref) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div
      data-testid="modal"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div ref={ref} className={`bg-surf rounded-2xl shadow-2xl w-full ${widths[size]} max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bdr shrink-0">
          <h3 data-testid="modal-title" className="text-base font-bold text-t1">{title}</h3>
          <button
            data-testid="modal-close"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-t3 hover:text-t1 hover:bg-surf2 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 scroll-thin">
          {children}
        </div>
      </div>
    </div>
  )
})

export default Modal
