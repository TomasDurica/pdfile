import type { PdfElement } from './usePdf'

// ── Public Types ─────────────────────────────────────────────────────

export interface TableCell {
  row: number
  col: number
  x: number
  y: number
  width: number
  height: number
  text: string
  textElementIds: string[]
}

export interface DetectedTable {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  rows: number
  cols: number
  cells: TableCell[][]
  lineIds: string[]
}

// ── Internal helpers ─────────────────────────────────────────────────

const SNAP = 1.5       // snap tolerance for coordinate grouping
const INTERSECT_TOL = 3 // tolerance for intersection checks

interface ClassifiedLine {
  el: PdfElement
  dir: 'h' | 'v'
  // Normalised positions (snapped)
  pos: number           // Y for h-lines, X for v-lines (the "thin" axis)
  start: number         // start of the long axis
  end: number           // end of the long axis
}

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP
}

function classifyLines(elements: PdfElement[]): ClassifiedLine[] {
  const out: ClassifiedLine[] = []
  for (const el of elements) {
    if (el.type !== 'line' && el.type !== 'rect') continue
    const w = Math.abs(el.width)
    const h = Math.abs(el.height)

    if (w < 0.5 && h < 0.5) continue // skip dots

    if (h < 3 || (w > 5 && w / h > 4)) {
      // Horizontal
      out.push({
        el,
        dir: 'h',
        pos: snap(el.y + h / 2),    // Y centre
        start: el.x,
        end: el.x + w,
      })
    } else if (w < 3 || (h > 5 && h / w > 4)) {
      // Vertical
      out.push({
        el,
        dir: 'v',
        pos: snap(el.x + w / 2),   // X centre
        start: el.y,
        end: el.y + h,
      })
    }
    // else: diagonal / square — skip
  }
  return out
}

/** Check if an H-line and a V-line intersect (within tolerance). */
function intersects(h: ClassifiedLine, v: ClassifiedLine): boolean {
  // H-line at y=h.pos, spanning x=[h.start, h.end]
  // V-line at x=v.pos, spanning y=[v.start, v.end]
  const t = INTERSECT_TOL
  const xOk = v.pos >= h.start - t && v.pos <= h.end + t
  const yOk = h.pos >= Math.min(v.start, v.end) - t && h.pos <= Math.max(v.start, v.end) + t
  return xOk && yOk
}

/** Union-Find for connected components. */
class UnionFind {
  parent: number[]
  rank: number[]

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
    this.rank = new Array(n).fill(0)
  }

  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x])
    return this.parent[x]
  }

  union(a: number, b: number) {
    const ra = this.find(a), rb = this.find(b)
    if (ra === rb) return
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra
    else { this.parent[rb] = ra; this.rank[ra]++ }
  }
}

/** De-duplicate sorted numbers that are within `tol` of each other. */
function dedup(arr: number[], tol: number = SNAP): number[] {
  if (arr.length === 0) return []
  const out = [arr[0]]
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] - out[out.length - 1] > tol) out.push(arr[i])
  }
  return out
}

// ── Main detection ───────────────────────────────────────────────────

export function detectTables(elements: PdfElement[]): DetectedTable[] {
  const tables: DetectedTable[] = []

  // Group elements by page
  const byPage = new Map<number, PdfElement[]>()
  for (const el of elements) {
    if (!byPage.has(el.page)) byPage.set(el.page, [])
    byPage.get(el.page)!.push(el)
  }

  for (const [page, pageEls] of byPage) {
    const lines = classifyLines(pageEls)
    const hLines = lines.filter(l => l.dir === 'h')
    const vLines = lines.filter(l => l.dir === 'v')

    if (hLines.length < 2 || vLines.length < 2) continue

    // Build intersection graph with Union-Find
    const allLines = [...hLines, ...vLines]
    const uf = new UnionFind(allLines.length)
    const hOffset = 0
    const vOffset = hLines.length

    for (let hi = 0; hi < hLines.length; hi++) {
      for (let vi = 0; vi < vLines.length; vi++) {
        if (intersects(hLines[hi], vLines[vi])) {
          uf.union(hOffset + hi, vOffset + vi)
        }
      }
    }

    // Group into connected components
    const components = new Map<number, number[]>()
    for (let i = 0; i < allLines.length; i++) {
      const root = uf.find(i)
      if (!components.has(root)) components.set(root, [])
      components.get(root)!.push(i)
    }

    // Process each component
    let tableIdx = 0
    for (const [, members] of components) {
      const compH = members.filter(i => i < vOffset).map(i => allLines[i])
      const compV = members.filter(i => i >= vOffset).map(i => allLines[i])

      // Need at least 2 horizontal AND 2 vertical lines for a grid
      if (compH.length < 2 || compV.length < 2) continue

      // Collect unique grid coordinates
      const ys = dedup(compH.map(l => l.pos).sort((a, b) => a - b))
      const xs = dedup(compV.map(l => l.pos).sort((a, b) => a - b))

      if (ys.length < 2 || xs.length < 2) continue

      const rows = ys.length - 1
      const cols = xs.length - 1

      // Build cells
      const cells: TableCell[][] = []
      for (let r = 0; r < rows; r++) {
        const row: TableCell[] = []
        for (let c = 0; c < cols; c++) {
          row.push({
            row: r,
            col: c,
            x: xs[c],
            y: ys[r],
            width: xs[c + 1] - xs[c],
            height: ys[r + 1] - ys[r],
            text: '',
            textElementIds: [],
          })
        }
        cells.push(row)
      }

      // Map text elements into cells
      const textEls = pageEls.filter(e => e.type === 'text' && e.str)
      for (const te of textEls) {
        // Use text midpoint
        const tx = te.x + (te.width || 0) / 2
        const ty = te.y + (te.height || 0) / 2

        // Find which cell contains this point
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const cell = cells[r][c]
            // Y axis: PDF coords may go bottom-up, so check both orderings
            const inX = tx >= cell.x - 1 && tx <= cell.x + cell.width + 1
            const cellYMin = Math.min(cell.y, cell.y + cell.height)
            const cellYMax = Math.max(cell.y, cell.y + cell.height)
            const inY = ty >= cellYMin - 1 && ty <= cellYMax + 1
            if (inX && inY) {
              cell.textElementIds.push(te.id)
              cell.text = cell.text ? cell.text + ' ' + te.str : te.str!
            }
          }
        }
      }

      const lineIds = [...compH, ...compV].map(l => l.el.id)
      const tableX = xs[0], tableY = ys[0]

      tables.push({
        id: `table-p${page}-${tableIdx++}`,
        page,
        x: tableX,
        y: tableY,
        width: xs[xs.length - 1] - tableX,
        height: ys[ys.length - 1] - tableY,
        rows,
        cols,
        cells,
        lineIds,
      })
    }
  }

  return tables
}
