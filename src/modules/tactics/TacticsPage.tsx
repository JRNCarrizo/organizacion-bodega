import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Employee, ExportPdfResult, TacticsArrow, TacticsBoard, TacticsBoardView } from '../../types'
import SettingsInfoButton from '../settings/SettingsInfoButton'

type ArrowStyle = 'move' | 'pass' | 'press'
type DirectionKey = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
type JoystickStage = 'off' | 'preview' | 'firm'

type JoystickSlot = {
  stage: JoystickStage
  arrowId?: number
  preview?: Pick<TacticsArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'curve' | 'style' | 'color'>
}

const DEFAULT_ARROW_STYLE: ArrowStyle = 'move'
const EXPORT_SIZE = 1400

const EXPORT_SVG_STYLE = `
  .tactics-pitch-grass { fill: url(#tactics-grass); }
  .tactics-pitch-border, .tactics-pitch-line {
    fill: none;
    stroke: rgba(248, 250, 252, 0.88);
    stroke-width: 0.45;
  }
  .tactics-pitch-dot, .tactics-pitch-goal {
    fill: rgba(248, 250, 252, 0.92);
    stroke: none;
  }
  .tactics-arrow-line {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.9;
    stroke-linecap: round;
    stroke-dasharray: none;
  }
  .tactics-arrow-press .tactics-arrow-line { stroke-width: 1.05; }
  .tactics-player-disc {
    fill: #0f172a;
    stroke: #f8fafc;
    stroke-width: 0.55;
  }
  .tactics-player-initials {
    fill: #f8fafc;
    font-size: 2.4px;
    font-weight: 800;
    font-family: Segoe UI, Arial, sans-serif;
  }
  .tactics-player-initials-long { font-size: 1.95px; }
  .tactics-player-nametip { display: none; }
`

const DIRECTIONS: Array<{ key: DirectionKey; label: string; dx: number; dy: number }> = [
  { key: 'nw', label: '↖', dx: -1, dy: -1 },
  { key: 'n', label: '↑', dx: 0, dy: -1 },
  { key: 'ne', label: '↗', dx: 1, dy: -1 },
  { key: 'w', label: '←', dx: -1, dy: 0 },
  { key: 'e', label: '→', dx: 1, dy: 0 },
  { key: 'sw', label: '↙', dx: -1, dy: 1 },
  { key: 's', label: '↓', dx: 0, dy: 1 },
  { key: 'se', label: '↘', dx: 1, dy: 1 }
]

const ARROW_LENGTH = 14
const JOYSTICK_ORDER: Array<DirectionKey | null> = [
  'nw', 'n', 'ne',
  'w', null, 'e',
  'sw', 's', 'se'
]

function joystickKey(employeeId: number, direction: DirectionKey): string {
  return `${employeeId}:${direction}`
}

function parseJoystickDirection(key: string): DirectionKey | null {
  const sep = key.indexOf(':')
  if (sep < 0) return null
  const direction = key.slice(sep + 1) as DirectionKey
  return DIRECTIONS.some(item => item.key === direction) ? direction : null
}

function buildDirectionalArrow(
  x: number,
  y: number,
  direction: DirectionKey,
  style: ArrowStyle
): Pick<TacticsArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'curve' | 'style' | 'color'> {
  const dir = DIRECTIONS.find(item => item.key === direction)!
  const rawX = x + dir.dx * ARROW_LENGTH
  const rawY = y + dir.dy * ARROW_LENGTH

  let scale = 1
  if (dir.dx !== 0) {
    if (rawX < 2) scale = Math.min(scale, (2 - x) / (rawX - x))
    if (rawX > 98) scale = Math.min(scale, (98 - x) / (rawX - x))
  }
  if (dir.dy !== 0) {
    if (rawY < 2) scale = Math.min(scale, (2 - y) / (rawY - y))
    if (rawY > 98) scale = Math.min(scale, (98 - y) / (rawY - y))
  }
  scale = Math.max(0.25, Math.min(1, scale))

  const x2 = x + dir.dx * ARROW_LENGTH * scale
  const y2 = y + dir.dy * ARROW_LENGTH * scale
  const color = style === 'pass' ? '#38bdf8' : style === 'press' ? '#f97316' : '#f8fafc'
  return {
    x1: x,
    y1: y,
    x2,
    y2,
    curve: dir.dx !== 0 && dir.dy !== 0 ? 4 * scale : 0,
    style,
    color
  }
}

function matchArrowDirection(
  arrow: Pick<TacticsArrow, 'x1' | 'y1' | 'x2' | 'y2'>,
  playerX: number,
  playerY: number
): DirectionKey | null {
  if (Math.hypot(arrow.x1 - playerX, arrow.y1 - playerY) > 6) return null
  const dx = arrow.x2 - arrow.x1
  const dy = arrow.y2 - arrow.y1
  if (Math.hypot(dx, dy) < 0.8) return null

  let best: DirectionKey | null = null
  let bestScore = Infinity
  for (const dir of DIRECTIONS) {
    const expected = buildDirectionalArrow(playerX, playerY, dir.key, 'move')
    const tipDist = Math.hypot(arrow.x2 - expected.x2, arrow.y2 - expected.y2)
    const angleDiff = Math.abs(
      Math.atan2(dy, dx) - Math.atan2(dir.dy, dir.dx)
    )
    const normalizedAngle = Math.min(angleDiff, Math.PI * 2 - angleDiff)
    const score = tipDist + normalizedAngle * 8
    if (score < bestScore) {
      bestScore = score
      best = dir.key
    }
  }
  return bestScore <= 14 ? best : null
}

function findDirectionalArrows(
  arrows: TacticsArrow[],
  employeeId: number,
  playerX: number,
  playerY: number,
  direction: DirectionKey
): TacticsArrow[] {
  return arrows.filter(arrow => {
    const anchored = arrow.from_employee_id === employeeId
    const near = Math.hypot(arrow.x1 - playerX, arrow.y1 - playerY) <= 6
    if (!anchored && !near) return false
    return matchArrowDirection(arrow, playerX, playerY) === direction
  })
}

function nameParts(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean)
}

/** Iniciales: nombre+apellido; si chocan, suma letras del apellido (JPe, JPer…). */
function initialsAtDepth(name: string, depth: number): string {
  const parts = nameParts(name)
  if (parts.length === 0) return '?'

  const first = parts[0]
  const last = parts[parts.length - 1]

  if (parts.length === 1) {
    return first.slice(0, Math.min(Math.max(2, depth + 1), first.length)).toUpperCase()
  }

  if (depth === 0) {
    return `${first[0]}${last[0]}`.toUpperCase()
  }

  if (depth <= 2) {
    const take = Math.min(1 + depth, last.length)
    return `${first[0]}${last.slice(0, take)}`.toUpperCase()
  }

  if (depth === 3) {
    return `${first.slice(0, Math.min(2, first.length))}${last[0]}`.toUpperCase()
  }

  return `${first.slice(0, Math.min(2, first.length))}${last.slice(0, Math.min(2, last.length))}`.toUpperCase()
}

function buildDistinctInitials(people: Array<{ id: number; name: string }>): Map<number, string> {
  const labels = new Map<number, string>()
  if (people.length === 0) return labels

  const depths = new Map(people.map(person => [person.id, 0]))

  for (let round = 0; round < 6; round++) {
    const buckets = new Map<string, number[]>()
    for (const person of people) {
      const label = initialsAtDepth(person.name, depths.get(person.id) ?? 0)
      labels.set(person.id, label)
      const group = buckets.get(label) ?? []
      group.push(person.id)
      buckets.set(label, group)
    }

    let collisions = 0
    for (const group of buckets.values()) {
      if (group.length < 2) continue
      collisions += 1
      for (const id of group) {
        depths.set(id, (depths.get(id) ?? 0) + 1)
      }
    }
    if (collisions === 0) break
  }

  return labels
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function arrowPath(arrow: Pick<TacticsArrow, 'x1' | 'y1' | 'x2' | 'y2' | 'curve'>): string {
  const mx = (arrow.x1 + arrow.x2) / 2
  const my = (arrow.y1 + arrow.y2) / 2
  const dx = arrow.x2 - arrow.x1
  const dy = arrow.y2 - arrow.y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const cx = mx + nx * arrow.curve
  const cy = my + ny * arrow.curve
  return `M ${arrow.x1} ${arrow.y1} Q ${cx} ${cy} ${arrow.x2} ${arrow.y2}`
}

function pitchSvgToPngDataUrl(svg: SVGSVGElement): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('.tactics-arrow-hit').forEach(node => node.remove())
  clone.querySelectorAll('.tactics-arrow-preview').forEach(node => {
    node.classList.remove('tactics-arrow-preview')
  })
  clone.querySelectorAll('.tactics-player-selected, .tactics-player-dragging, .tactics-arrow-selected')
    .forEach(node => {
      node.classList.remove('tactics-player-selected', 'tactics-player-dragging', 'tactics-arrow-selected')
    })

  clone.querySelectorAll('.tactics-arrow-line').forEach(node => {
    const path = node as SVGPathElement
    const color = path.style.color || path.getAttribute('stroke') || '#f8fafc'
    path.setAttribute('stroke', color)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke-width', '1.15')
    path.setAttribute('stroke-linecap', 'round')
    path.style.strokeDasharray = 'none'
    path.style.animation = 'none'
    path.style.opacity = '1'
  })

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(EXPORT_SIZE))
  clone.setAttribute('height', String(EXPORT_SIZE))
  clone.setAttribute('viewBox', '0 0 100 100')

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  style.textContent = EXPORT_SVG_STYLE
  clone.insertBefore(style, clone.firstChild)

  const xml = new XMLSerializer().serializeToString(clone)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = EXPORT_SIZE
        canvas.height = EXPORT_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo crear el canvas'))
          return
        }
        ctx.fillStyle = '#14532d'
        ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
        ctx.drawImage(image, 0, 0, EXPORT_SIZE, EXPORT_SIZE)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      reject(new Error('No se pudo renderizar la cancha'))
    }
    image.src = url
  })
}

function FootballPitch() {
  return (
    <g className="tactics-pitch-marks">
      <rect x="2" y="2" width="96" height="96" rx="1.2" className="tactics-pitch-grass" />
      <rect x="2" y="2" width="96" height="96" rx="1.2" className="tactics-pitch-border" />
      <line x1="2" y1="50" x2="98" y2="50" className="tactics-pitch-line" />
      <circle cx="50" cy="50" r="9.5" className="tactics-pitch-line" />
      <circle cx="50" cy="50" r="0.9" className="tactics-pitch-dot" />
      <rect x="21" y="2" width="58" height="16" className="tactics-pitch-line" />
      <rect x="34" y="2" width="32" height="7" className="tactics-pitch-line" />
      <circle cx="50" cy="12" r="0.7" className="tactics-pitch-dot" />
      <path d="M 40 18 A 10 10 0 0 0 60 18" className="tactics-pitch-line" />
      <rect x="21" y="82" width="58" height="16" className="tactics-pitch-line" />
      <rect x="34" y="91" width="32" height="7" className="tactics-pitch-line" />
      <circle cx="50" cy="88" r="0.7" className="tactics-pitch-dot" />
      <path d="M 40 82 A 10 10 0 0 1 60 82" className="tactics-pitch-line" />
      <rect x="42" y="2" width="16" height="2.2" className="tactics-pitch-goal" />
      <rect x="42" y="95.8" width="16" height="2.2" className="tactics-pitch-goal" />
    </g>
  )
}

export default function TacticsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [boardId, setBoardId] = useState<number | null>(null)
  const [view, setView] = useState<TacticsBoardView | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null)
  const [selectedArrowId, setSelectedArrowId] = useState<number | null>(null)
  const [joystick, setJoystick] = useState<Record<string, JoystickSlot>>({})
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [liveDrag, setLiveDrag] = useState<{
    employeeId: number
    originX: number
    originY: number
    x: number
    y: number
    grabDx: number
    grabDy: number
    fromBench: boolean
  } | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [exporting, setExporting] = useState(false)
  const pitchRef = useRef<SVGSVGElement>(null)
  const liveDragRef = useRef(liveDrag)
  liveDragRef.current = liveDrag
  const dragRafRef = useRef<number | null>(null)
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null)
  const joystickRef = useRef(joystick)
  joystickRef.current = joystick
  const joystickBusyRef = useRef(false)
  const viewRef = useRef(view)
  viewRef.current = view

  const activeEmployees = useMemo(
    () => employees.filter(emp => emp.active === 1),
    [employees]
  )

  const initialsById = useMemo(
    () => buildDistinctInitials(activeEmployees.map(emp => ({ id: emp.id, name: emp.name }))),
    [activeEmployees]
  )

  const onPitchIds = useMemo(() => {
    const ids = new Set((view?.placements ?? []).map(p => p.employee_id))
    if (liveDrag) ids.add(liveDrag.employeeId)
    return ids
  }, [view, liveDrag])

  const bench = useMemo(
    () => activeEmployees.filter(emp => !onPitchIds.has(emp.id)),
    [activeEmployees, onPitchIds]
  )

  const selectedPlacement = useMemo(() => {
    const base = view?.placements.find(p => p.employee_id === selectedEmployeeId) ?? null
    if (!base) return null
    if (liveDrag && liveDrag.employeeId === base.employee_id) {
      return { ...base, x: liveDrag.x, y: liveDrag.y }
    }
    return base
  }, [view, selectedEmployeeId, liveDrag])

  const displayPlacements = useMemo(() => {
    const list = view?.placements ?? []
    if (!liveDrag) return list
    if (liveDrag.fromBench && !list.some(p => p.employee_id === liveDrag.employeeId)) {
      const emp = activeEmployees.find(e => e.id === liveDrag.employeeId)
      if (!emp) return list
      return [
        ...list,
        {
          id: -1,
          board_id: boardId ?? 0,
          employee_id: emp.id,
          employee_name: emp.name,
          x: liveDrag.x,
          y: liveDrag.y
        }
      ]
    }
    return list.map(p =>
      p.employee_id === liveDrag.employeeId
        ? { ...p, x: liveDrag.x, y: liveDrag.y }
        : p
    )
  }, [view, liveDrag, activeEmployees, boardId])

  const displayArrows = useMemo(() => {
    const list = view?.arrows ?? []
    if (!liveDrag || liveDrag.fromBench) return list
    const dx = liveDrag.x - liveDrag.originX
    const dy = liveDrag.y - liveDrag.originY
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return list
    return list.map(arrow => {
      const anchored = arrow.from_employee_id === liveDrag.employeeId
      const nearStart = Math.hypot(arrow.x1 - liveDrag.originX, arrow.y1 - liveDrag.originY) <= 5.5
      if (!anchored && !nearStart) return arrow
      return {
        ...arrow,
        x1: clamp(arrow.x1 + dx, 2, 98),
        y1: clamp(arrow.y1 + dy, 2, 98),
        x2: clamp(arrow.x2 + dx, 2, 98),
        y2: clamp(arrow.y2 + dy, 2, 98),
        from_employee_id: liveDrag.employeeId
      }
    })
  }, [view, liveDrag])

  const loadBoards = useCallback(async () => {
    const list = await window.api.tactics.listBoards() as TacticsBoard[]
    const nextId = list[0]?.id ?? null
    setBoardId(nextId)
    return nextId
  }, [])

  const loadBoard = useCallback(async (id: number) => {
    const data = await window.api.tactics.getBoard(id) as TacticsBoardView
    setView(data)
  }, [])

  useEffect(() => {
    Promise.all([
      window.api.employees.getAll() as Promise<Employee[]>,
      loadBoards()
    ]).then(([emps, id]) => {
      setEmployees(emps)
      if (id) return loadBoard(id)
    }).catch(() => setError('No se pudo cargar Mi Equipo.'))
  }, [loadBoard, loadBoards])

  useEffect(() => {
    if (boardId == null) return
    loadBoard(boardId).catch(() => setError('No se pudo cargar la cancha.'))
  }, [boardId, loadBoard])

  const refresh = async () => {
    if (boardId == null) return
    await loadBoard(boardId)
  }

  const pointerToPitch = (event: React.PointerEvent | React.MouseEvent): { x: number; y: number } | null => {
    const svg = pitchRef.current
    if (!svg) return null
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const x = ((event.clientX - rect.left) / rect.width) * 100
    const y = ((event.clientY - rect.top) / rect.height) * 100
    return { x: clamp(x, 2, 98), y: clamp(y, 2, 98) }
  }

  useEffect(() => {
    if (draggingId == null || boardId == null) return
    const employeeId = draggingId
    const activeBoardId = boardId
    const startPlacement = view?.placements.find(p => p.employee_id === employeeId)
    const startedOnPitch = Boolean(startPlacement)

    const flushPendingPoint = () => {
      dragRafRef.current = null
      const pending = pendingDragPointRef.current
      if (!pending) return
      pendingDragPointRef.current = null
      setLiveDrag(prev => {
        if (!prev || prev.employeeId !== employeeId) {
          return {
            employeeId,
            originX: startPlacement?.x ?? pending.x,
            originY: startPlacement?.y ?? pending.y,
            x: pending.x,
            y: pending.y,
            grabDx: 0,
            grabDy: 0,
            fromBench: !startedOnPitch
          }
        }
        return { ...prev, x: pending.x, y: pending.y }
      })
    }

    const onMove = (event: PointerEvent) => {
      event.preventDefault()
      const svg = pitchRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const grab = liveDragRef.current
      const grabDx = grab?.employeeId === employeeId ? grab.grabDx : 0
      const grabDy = grab?.employeeId === employeeId ? grab.grabDy : 0
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100 - grabDx, 2, 98)
      const y = clamp(((event.clientY - rect.top) / rect.height) * 100 - grabDy, 2, 98)
      pendingDragPointRef.current = { x, y }
      if (dragRafRef.current == null) {
        dragRafRef.current = window.requestAnimationFrame(flushPendingPoint)
      }
    }

    const onUp = (event: PointerEvent) => {
      if (dragRafRef.current != null) {
        window.cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
      pendingDragPointRef.current = null
      setDraggingId(null)
      const svg = pitchRef.current
      if (!svg) {
        setLiveDrag(null)
        return
      }
      const rect = svg.getBoundingClientRect()
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      const grab = liveDragRef.current
      const grabDx = grab?.employeeId === employeeId ? grab.grabDx : 0
      const grabDy = grab?.employeeId === employeeId ? grab.grabDy : 0
      const x = clamp(((event.clientX - rect.left) / rect.width) * 100 - grabDx, 2, 98)
      const y = clamp(((event.clientY - rect.top) / rect.height) * 100 - grabDy, 2, 98)

      void (async () => {
        try {
          if (!inside) {
            if (startedOnPitch) {
              await window.api.tactics.removePlacement(activeBoardId, employeeId)
              setJoystick(prev => {
                const next = { ...prev }
                for (const key of Object.keys(next)) {
                  if (key.startsWith(`${employeeId}:`)) delete next[key]
                }
                return next
              })
            }
            setLiveDrag(null)
            const data = await window.api.tactics.getBoard(activeBoardId) as TacticsBoardView
            setView(data)
            return
          }

          if (startedOnPitch) {
            const data = await window.api.tactics.movePlayer(activeBoardId, employeeId, x, y) as TacticsBoardView
            setView(data)
          } else {
            await window.api.tactics.upsertPlacement(activeBoardId, employeeId, x, y)
            const data = await window.api.tactics.getBoard(activeBoardId) as TacticsBoardView
            setView(data)
          }
          setSelectedEmployeeId(employeeId)
          setSelectedArrowId(null)
          setLiveDrag(null)
        } catch {
          setLiveDrag(null)
          setError('No se pudo actualizar la posición.')
        }
      })()
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    return () => {
      if (dragRafRef.current != null) {
        window.cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
      pendingDragPointRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  // Intentionally only rebind when a new drag starts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, boardId])

  const handleBenchPointerDown = (employeeId: number) => (event: React.PointerEvent) => {
    event.preventDefault()
    const point = pointerToPitch(event)
    const x = point?.x ?? 50
    const y = point?.y ?? 50
    setDraggingId(employeeId)
    setSelectedEmployeeId(employeeId)
    setSelectedArrowId(null)
    setLiveDrag({
      employeeId,
      originX: x,
      originY: y,
      x,
      y,
      grabDx: 0,
      grabDy: 0,
      fromBench: true
    })
  }

  const handlePitchPlayerPointerDown = (employeeId: number) => (event: React.PointerEvent) => {
    event.stopPropagation()
    event.preventDefault()
    const placed = view?.placements.find(p => p.employee_id === employeeId)
    const point = pointerToPitch(event)
    const originX = placed?.x ?? point?.x ?? 50
    const originY = placed?.y ?? point?.y ?? 50
    const pointerX = point?.x ?? originX
    const pointerY = point?.y ?? originY
    setDraggingId(employeeId)
    setSelectedEmployeeId(employeeId)
    setSelectedArrowId(null)
    setLiveDrag({
      employeeId,
      originX,
      originY,
      x: originX,
      y: originY,
      grabDx: pointerX - originX,
      grabDy: pointerY - originY,
      fromBench: false
    })
  }

  const addDirectionalArrow = async (direction: DirectionKey) => {
    if (boardId == null || !selectedPlacement || joystickBusyRef.current) return
    joystickBusyRef.current = true
    const key = joystickKey(selectedPlacement.employee_id, direction)
    const current = joystickRef.current[key] ?? { stage: 'off' as JoystickStage }
    const geometry = buildDirectionalArrow(
      selectedPlacement.x,
      selectedPlacement.y,
      direction,
      DEFAULT_ARROW_STYLE
    )

    try {
      if (current.stage === 'off') {
        setJoystick(prev => ({
          ...prev,
          [key]: { stage: 'preview', preview: geometry }
        }))
        return
      }

      if (current.stage === 'preview') {
        const created = await window.api.tactics.addArrow(boardId, {
          ...geometry,
          from_employee_id: selectedPlacement.employee_id
        }) as TacticsArrow
        setJoystick(prev => ({
          ...prev,
          [key]: { stage: 'firm', arrowId: created.id }
        }))
        await refresh()
        return
      }

      // 3° toque: borrar todas las flechas de esa dirección (evita huérfanas, p.ej. ↑)
      const boardArrows = viewRef.current?.arrows ?? []
      const matching = findDirectionalArrows(
        boardArrows,
        selectedPlacement.employee_id,
        selectedPlacement.x,
        selectedPlacement.y,
        direction
      )
      const ids = new Set<number>()
      if (current.arrowId != null) ids.add(current.arrowId)
      for (const arrow of matching) ids.add(arrow.id)

      for (const id of ids) {
        await window.api.tactics.deleteArrow(id)
        if (selectedArrowId === id) setSelectedArrowId(null)
      }

      setJoystick(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      await refresh()
    } catch {
      setError('No se pudo actualizar la flecha.')
    } finally {
      joystickBusyRef.current = false
    }
  }

  const previewArrows = useMemo(() => {
    const placementsById = new Map(
      displayPlacements.map(player => [player.employee_id, player])
    )

    return Object.entries(joystick)
      .filter(([, slot]) => slot.stage === 'preview' && slot.preview)
      .map(([key, slot]) => {
        const sep = key.indexOf(':')
        if (sep < 0) return null
        const employeeId = Number(key.slice(0, sep))
        const dir = parseJoystickDirection(key)
        const placement = placementsById.get(employeeId)
        if (!dir || !placement || Number.isNaN(employeeId)) return null
        const geometry = buildDirectionalArrow(
          placement.x,
          placement.y,
          dir,
          slot.preview!.style
        )
        return { key, ...geometry }
      })
      .filter((arrow): arrow is NonNullable<typeof arrow> => arrow != null)
  }, [joystick, displayPlacements])

  const joystickStageFor = (direction: DirectionKey): JoystickStage => {
    if (!selectedPlacement) return 'off'
    return joystick[joystickKey(selectedPlacement.employee_id, direction)]?.stage ?? 'off'
  }

  // Sincroniza botones firm del joystick con flechas guardadas (útil tras recargar / mover)
  useEffect(() => {
    if (!view) return
    setJoystick(prev => {
      const next: Record<string, JoystickSlot> = {}
      for (const [key, slot] of Object.entries(prev)) {
        if (slot.stage === 'preview') next[key] = slot
      }

      for (const placement of view.placements) {
        for (const direction of DIRECTIONS) {
          const key = joystickKey(placement.employee_id, direction.key)
          if (next[key]?.stage === 'preview') continue
          const matching = findDirectionalArrows(
            view.arrows,
            placement.employee_id,
            placement.x,
            placement.y,
            direction.key
          )
          if (matching.length === 0) continue
          next[key] = { stage: 'firm', arrowId: matching[0].id }
        }
      }
      return next
    })
  }, [view])

  const handleDeleteSelected = async () => {
    if (boardId == null) return
    if (selectedArrowId != null) {
      await window.api.tactics.deleteArrow(selectedArrowId)
      setSelectedArrowId(null)
      await refresh()
      return
    }
    if (selectedEmployeeId != null && onPitchIds.has(selectedEmployeeId)) {
      await window.api.tactics.removePlacement(boardId, selectedEmployeeId)
      setSelectedEmployeeId(null)
      await refresh()
    }
  }

  const handleClear = async () => {
    if (boardId == null) return
    if (!confirm('¿Vaciar cancha y flechas?')) return
    await window.api.tactics.clearBoard(boardId)
    setSelectedArrowId(null)
    setSelectedEmployeeId(null)
    setJoystick({})
    await refresh()
  }

  const handleExport = async () => {
    const svg = pitchRef.current
    if (!svg || !view) return
    setExporting(true)
    setError('')
    setMessage('')
    try {
      const pngData = await pitchSvgToPngDataUrl(svg)
      const result = await window.api.tactics.exportPng(pngData) as ExportPdfResult
      if (result.success) {
        setMessage(result.message)
      } else if (result.message !== 'Exportación cancelada.') {
        setError(result.message)
      }
    } catch {
      setError('No se pudo exportar la imagen.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="tactics-page">
      <header className="tactics-page-header no-print">
        <div className="tactics-page-badge" aria-hidden="true">⚽</div>
        <div className="tactics-page-copy">
          <span className="tactics-page-kicker">Cancha</span>
          <h2>Mi Equipo</h2>
          <p>Armá la formación del equipo para el próximo partido y exportá tu estrategia.</p>
        </div>
        <SettingsInfoButton title="Cómo funciona" ariaLabel="Ayuda de Mi Equipo">
          <p>Arrastrá jugadores del banco a la cancha. Para sacarlos, arrastralos fuera.</p>
          <p>Joystick: 1° flecha en movimiento, 2° la fija, 3° la borra.</p>
          <p>Exportá la cancha como imagen PNG (con jugadores y flechas).</p>
        </SettingsInfoButton>
      </header>

      <div className="schedule-toolbar meals-toolbar no-print">
        <div className="schedule-toolbar-actions">
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-secondary"
            onClick={() => void handleDeleteSelected()}
            disabled={selectedArrowId == null && !(selectedEmployeeId && onPitchIds.has(selectedEmployeeId))}
            title="Quitar la selección actual"
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">✕</span>
            Quitar selección
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-secondary"
            onClick={() => void handleClear()}
            disabled={!view}
            title="Vaciar cancha y flechas"
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">⌫</span>
            Vaciar cancha
          </button>
          <button
            type="button"
            className="schedule-toolbar-btn schedule-toolbar-btn-primary"
            onClick={() => void handleExport()}
            disabled={!view || exporting}
            title="Exportar cancha como imagen PNG"
          >
            <span className="schedule-toolbar-btn-icon" aria-hidden="true">↓</span>
            {exporting ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </div>

      {message && <div className="alert alert-success no-print">{message}</div>}
      {error && <div className="alert alert-warning no-print">{error}</div>}

      <div className="tactics-layout">
        <section className="tactics-pitch-panel">
          <div className="tactics-print-title print-only">
            <strong>Bodega Esmeralda — Mi Equipo</strong>
          </div>

          <div className="tactics-pitch-wrap">
            <svg
              ref={pitchRef}
              className="tactics-pitch"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <marker id="tactics-arrowhead-move" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto">
                  <path d="M 0 0 L 5 2.5 L 0 5 z" fill="#f8fafc" />
                </marker>
                <marker id="tactics-arrowhead-pass" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto">
                  <path d="M 0 0 L 5 2.5 L 0 5 z" fill="#38bdf8" />
                </marker>
                <marker id="tactics-arrowhead-press" markerWidth="5" markerHeight="5" refX="4.2" refY="2.5" orient="auto">
                  <path d="M 0 0 L 5 2.5 L 0 5 z" fill="#f97316" />
                </marker>
                <linearGradient id="tactics-grass" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1f7a3f" />
                  <stop offset="50%" stopColor="#176533" />
                  <stop offset="100%" stopColor="#14532d" />
                </linearGradient>
              </defs>

              <FootballPitch />

              {displayArrows.map(arrow => (
                <g key={arrow.id} className={`tactics-arrow tactics-arrow-${arrow.style} ${selectedArrowId === arrow.id ? 'tactics-arrow-selected' : ''}`}>
                  <path
                    d={arrowPath(arrow)}
                    className="tactics-arrow-hit"
                    onClick={event => {
                      event.stopPropagation()
                      setSelectedArrowId(arrow.id)
                      setSelectedEmployeeId(null)
                    }}
                  />
                  <path
                    d={arrowPath(arrow)}
                    className="tactics-arrow-line"
                    style={{ color: arrow.color }}
                    markerEnd={`url(#tactics-arrowhead-${arrow.style})`}
                    onClick={event => {
                      event.stopPropagation()
                      setSelectedArrowId(arrow.id)
                      setSelectedEmployeeId(null)
                    }}
                  />
                </g>
              ))}

              {previewArrows.map(arrow => (
                <g key={arrow.key} className={`tactics-arrow tactics-arrow-${arrow.style} tactics-arrow-preview`}>
                  <path
                    d={arrowPath(arrow)}
                    className="tactics-arrow-line"
                    style={{ color: arrow.color }}
                    markerEnd={`url(#tactics-arrowhead-${arrow.style})`}
                  />
                </g>
              ))}

              {displayPlacements.map(player => (
                <g
                  key={player.employee_id}
                  className={`tactics-player ${selectedEmployeeId === player.employee_id ? 'tactics-player-selected' : ''} ${draggingId === player.employee_id ? 'tactics-player-dragging' : ''}`}
                  transform={`translate(${player.x} ${player.y})`}
                  onPointerDown={handlePitchPlayerPointerDown(player.employee_id)}
                >
                  <circle r="4.2" className="tactics-player-disc" />
                  <text
                    y="1.1"
                    textAnchor="middle"
                    className={`tactics-player-initials${(initialsById.get(player.employee_id) ?? '').length > 2 ? ' tactics-player-initials-long' : ''}`}
                  >
                    {initialsById.get(player.employee_id) ?? '?'}
                  </text>
                  <g className="tactics-player-nametip" pointerEvents="none">
                    <rect
                      className="tactics-player-nametip-bg"
                      x={-Math.min(28, Math.max(10, player.employee_name.length * 1.15)) / 2}
                      y="-9.4"
                      width={Math.min(28, Math.max(10, player.employee_name.length * 1.15))}
                      height="3.6"
                      rx="0.9"
                    />
                    <text
                      y="-6.85"
                      textAnchor="middle"
                      className={`tactics-player-nametip-text${player.employee_name.length > 18 ? ' tactics-player-nametip-text-long' : ''}`}
                    >
                      {player.employee_name}
                    </text>
                  </g>
                </g>
              ))}
            </svg>
          </div>
        </section>

        <aside className="tactics-bench-panel no-print">
          <div className="tactics-bench-header">
            <span className="tactics-page-kicker">Banco</span>
            <h3>Suplentes</h3>
            <p>{bench.length} disponibles · {view?.placements.length ?? 0} en cancha</p>
          </div>

          {bench.length === 0 ? (
            <p className="tactics-bench-empty">
              {activeEmployees.length === 0
                ? 'No hay empleados activos. Cargalos en Empleados.'
                : 'Todos están en cancha. Arrastrá alguno fuera para devolverlo al banco.'}
            </p>
          ) : (
            <div className="tactics-bench-list">
              {bench.map(emp => (
                <button
                  key={emp.id}
                  type="button"
                  className={`tactics-bench-chip ${selectedEmployeeId === emp.id ? 'tactics-bench-chip-selected' : ''} ${draggingId === emp.id ? 'tactics-bench-chip-dragging' : ''}`}
                  onPointerDown={handleBenchPointerDown(emp.id)}
                  onClick={() => {
                    setSelectedEmployeeId(emp.id)
                    setSelectedArrowId(null)
                  }}
                >
                  <span className="tactics-bench-avatar">{initialsById.get(emp.id) ?? '?'}</span>
                  <span className="tactics-bench-name">{emp.name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="tactics-joystick">
            <div className="tactics-joystick-pad" role="group" aria-label="Direcciones">
              {JOYSTICK_ORDER.map((dir, index) => {
                if (!dir) {
                  return <span key={`pad-${index}`} className="tactics-joy-gap" aria-hidden="true" />
                }
                const stage = joystickStageFor(dir)
                const meta = DIRECTIONS.find(item => item.key === dir)!
                return (
                  <button
                    key={dir}
                    type="button"
                    className={`tactics-joy-btn tactics-joy-btn-${stage}`}
                    disabled={!selectedPlacement}
                    onClick={() => void addDirectionalArrow(dir)}
                    title={
                      !selectedPlacement
                        ? 'Seleccioná un jugador en cancha'
                        : stage === 'off'
                          ? `Flecha en movimiento ${meta.label}`
                          : stage === 'preview'
                            ? `Fijar flecha ${meta.label}`
                            : `Borrar flecha ${meta.label}`
                    }
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
            <p className="tactics-joystick-hint">
              {selectedPlacement
                ? '1 movimiento · 2 fija · 3 borra'
                : 'Elegí un jugador en cancha'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
