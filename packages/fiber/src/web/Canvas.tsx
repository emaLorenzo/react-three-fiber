import * as React from 'react'
import mergeRefs from 'react-merge-refs'
import useMeasure, { Options as ResizeOptions } from 'react-use-measure'
import { UseStore } from 'zustand'
import pick from 'lodash-es/pick'
import omit from 'lodash-es/omit'
import { render, unmountComponentAtNode, RenderProps } from './index'
import { createPointerEvents } from './events'
import { RootState } from '../core/store'
import { EventManager } from '../core/events'

export interface Props
  extends Omit<RenderProps<HTMLCanvasElement>, 'size' | 'events'>,
    React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  fallback?: React.ReactNode
  resize?: ResizeOptions
  /** Toggles rendering when the canvas leaves/enters the viewport. */
  intersect?: boolean
  events?: (store: UseStore<RootState>) => EventManager<any>
}

type SetBlock = false | Promise<null> | null
type UnblockProps = { set: React.Dispatch<React.SetStateAction<SetBlock>>; children: React.ReactNode }

const CANVAS_PROPS = [
  'gl',
  'events',
  'size',
  'shadows',
  'linear',
  'flat',
  'orthographic',
  'frameloop',
  'dpr',
  'performance',
  'clock',
  'raycaster',
  'camera',
  'onPointerMissed',
  'onCreated',
]

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

function Block({ set }: Omit<UnblockProps, 'children'>) {
  useIsomorphicLayoutEffect(() => {
    set(new Promise(() => null))
    return () => set(false)
  }, [])
  return null
}

class ErrorBoundary extends React.Component<{ set: React.Dispatch<any> }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError = () => ({ error: true })
  componentDidCatch(error: any) {
    this.props.set(error)
  }
  render() {
    return this.state.error ? null : this.props.children
  }
}

export const Canvas = React.forwardRef<HTMLCanvasElement, Props>(function Canvas(
  { children, fallback, resize, style, events, intersect, frameloop, ...props },
  forwardedRef,
) {
  const canvasProps = pick(props, CANVAS_PROPS)
  const divProps = omit(props, CANVAS_PROPS)
  const [containerRef, { width, height }] = useMeasure({ scroll: true, debounce: { scroll: 50, resize: 0 }, ...resize })
  const canvasRef = React.useRef<HTMLCanvasElement>(null!)
  const [block, setBlock] = React.useState<SetBlock>(false)
  const [error, setError] = React.useState<any>(false)
  const [visible, setVisible] = React.useState(false)

  // Suspend this component if block is a promise (2nd run)
  if (block) throw block
  // Throw exception outwards if anything within canvas throws
  if (error) throw error

  // Execute JSX in the reconciler as a layout-effect
  useIsomorphicLayoutEffect(() => {
    if (width > 0 && height > 0) {
      const shouldRender = !intersect || visible

      render(
        <ErrorBoundary set={setError}>
          <React.Suspense fallback={<Block set={setBlock} />}>{children}</React.Suspense>
        </ErrorBoundary>,
        canvasRef.current,
        {
          ...canvasProps,
          size: { width, height },
          events: events || createPointerEvents,
          frameloop: shouldRender ? frameloop : 'never',
        },
      )
    }
  }, [width, height, children, canvasProps, visible])

  React.useEffect(() => {
    const container = canvasRef.current
    return () => unmountComponentAtNode(container)
  }, [])

  // Toggle rendering when out of view when `intersect` is set
  React.useEffect(() => {
    const container = canvasRef.current
    if (!container || !intersect) return

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    observer.observe(container)

    return () => observer.disconnect()
  }, [intersect])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}
      {...divProps}>
      <canvas ref={mergeRefs([canvasRef, forwardedRef])} style={{ display: 'block' }}>
        {fallback}
      </canvas>
    </div>
  )
})
