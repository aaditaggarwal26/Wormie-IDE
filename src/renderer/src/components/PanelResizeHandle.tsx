import { useEffect, useRef, useState } from 'react'

type PanelResizeHandleProps = {
  ariaLabel: string
  max: number
  min: number
  onReset: () => void
  onResize: (delta: number) => void
  orientation: 'horizontal' | 'vertical'
  value: number
}

export function PanelResizeHandle({
  ariaLabel,
  max,
  min,
  onReset,
  onResize,
  orientation,
  value
}: PanelResizeHandleProps): React.JSX.Element {
  const pointerId = useRef<number | null>(null)
  const lastPosition = useRef(0)
  const pendingDelta = useRef(0)
  const resizeFrame = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const coordinate = (event: React.PointerEvent) => orientation === 'vertical' ? event.clientX : event.clientY

  const flushResize = () => {
    if (resizeFrame.current !== null) {
      cancelAnimationFrame(resizeFrame.current)
      resizeFrame.current = null
    }
    const delta = pendingDelta.current
    pendingDelta.current = 0
    if (delta !== 0) onResize(delta)
  }

  const queueResize = (delta: number) => {
    pendingDelta.current += delta
    if (resizeFrame.current !== null) return
    resizeFrame.current = requestAnimationFrame(() => {
      resizeFrame.current = null
      const nextDelta = pendingDelta.current
      pendingDelta.current = 0
      if (nextDelta !== 0) onResize(nextDelta)
    })
  }

  const stopDragging = () => {
    flushResize()
    pointerId.current = null
    setDragging(false)
    if (document.body.dataset.resizeOrientation === orientation) {
      delete document.body.dataset.resizeOrientation
    }
  }

  useEffect(() => () => {
    if (resizeFrame.current !== null) cancelAnimationFrame(resizeFrame.current)
    if (document.body.dataset.resizeOrientation === orientation) {
      delete document.body.dataset.resizeOrientation
    }
  }, [orientation])

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(value)}
      className="panel-resize-handle"
      data-dragging={dragging}
      data-orientation={orientation}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const delta = orientation === 'vertical'
          ? event.key === 'ArrowLeft' ? -10 : event.key === 'ArrowRight' ? 10 : 0
          : event.key === 'ArrowUp' ? -10 : event.key === 'ArrowDown' ? 10 : 0
        if (delta !== 0) {
          event.preventDefault()
          onResize(delta)
        } else if (event.key === 'Home') {
          event.preventDefault()
          onReset()
        }
      }}
      onLostPointerCapture={stopDragging}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        pointerId.current = event.pointerId
        lastPosition.current = coordinate(event)
        event.currentTarget.setPointerCapture(event.pointerId)
        document.body.dataset.resizeOrientation = orientation
        setDragging(true)
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return
        const nextPosition = coordinate(event)
        const delta = nextPosition - lastPosition.current
        if (delta === 0) return
        lastPosition.current = nextPosition
        queueResize(delta)
      }}
      onPointerCancel={stopDragging}
      onPointerUp={(event) => {
        if (pointerId.current !== event.pointerId) return
        event.currentTarget.releasePointerCapture(event.pointerId)
        stopDragging()
      }}
      role="separator"
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
    />
  )
}
