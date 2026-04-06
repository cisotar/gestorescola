export default function Spinner({ size = 24, className = '' }) {
  return (
    <div
      className={`rounded-full border-2 border-bdr border-t-navy animate-spin ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
