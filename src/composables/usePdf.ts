import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url'
import { ref, shallowRef } from 'vue'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

// ── Types ────────────────────────────────────────────────────────────

export type ElementType = 'text' | 'line' | 'rect'

export interface PdfElement {
  id: string
  page: number
  type: ElementType
  // Text
  str?: string
  dir?: string
  fontName?: string
  hasEOL?: boolean
  // Geometry (PDF user-space coordinates)
  x: number
  y: number
  width: number
  height: number
  transform?: number[]
}

// ── OPS from pdf.js (hardcoded to avoid ESM import issues) ───────────

const OPS_MOVE_TO      = 13
const OPS_LINE_TO      = 14
// PathOps sub-op codes used inside constructPath (different from main OPS!)
// 0=moveTo, 1=lineTo, 2=cubicTo(6), 3=cubicTo2(4), 4=close, 5=rect(4)
const OPS_RECTANGLE    = 19
const OPS_CONSTRUCT_PATH = 91

// ── Composable ───────────────────────────────────────────────────────

export function usePdf() {
  const pdfDoc = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pages = ref(0)
  const elements = ref<PdfElement[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const loadPdf = async (file: File) => {
    loading.value = true
    error.value = null
    pdfDoc.value = null
    elements.value = []
    pages.value = 0

    try {
      const arrayBuffer = await file.arrayBuffer()
      const doc = await pdfjsLib.getDocument(arrayBuffer).promise

      pdfDoc.value = doc
      pages.value = doc.numPages

      const all: PdfElement[] = []

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p)

        // ── 1. Text ──────────────────────────────────────────────
        const tc = await page.getTextContent()
        tc.items.forEach((item: any, idx: number) => {
          if (!('str' in item) || item.str === '') return
          const t = item.transform // [scaleX, skewY, skewX, scaleY, tx, ty]
          all.push({
            type: 'text',
            id: `p${p}-t${idx}`,
            page: p,
            str: item.str,
            dir: item.dir,
            fontName: item.fontName,
            hasEOL: item.hasEOL,
            x: t[4],
            y: t[5],
            width: item.width,
            height: item.height,
            transform: item.transform,
          })
        })

        // ── 2. Graphics (operator list) ──────────────────────────
        const opList = await page.getOperatorList()
        const { fnArray, argsArray } = opList

        let cx = 0
        let cy = 0


        for (let j = 0; j < fnArray.length; j++) {
          const fn = fnArray[j]
          const args = argsArray[j]

          if (fn === OPS_MOVE_TO) {
            cx = args[0]; cy = args[1]
          }
          else if (fn === OPS_LINE_TO) {
            addLine(all, p, `p${p}-l${j}`, cx, cy, args[0], args[1])
            cx = args[0]; cy = args[1]
          }
          else if (fn === OPS_RECTANGLE) {
            addRect(all, p, `p${p}-r${j}`, args[0], args[1], args[2], args[3])
          }
          else if (fn === OPS_CONSTRUCT_PATH) {
            // pdfjs v5 constructPath format:
            //   args = [fillRule, [Float32Array], Float32Array(bbox)]
            // The Float32Array contains ops and coords INTERLEAVED.
            // IMPORTANT: sub-ops use PathOps enum, NOT the main OPS constants!
            //   PathOps: 0=moveTo, 1=lineTo, 2=cubicTo(6), 3=cubicTo2(4), 4=close, 5=rect(4)

            const PATH_MOVE = 0, PATH_LINE = 1, PATH_CUBIC = 2
            const PATH_CUBIC2 = 3, PATH_CLOSE = 4, PATH_RECT = 5

            let data: ArrayLike<number> | null = null

            if (Array.isArray(args) && args.length >= 2) {
              const rawOps = args[1]
              if (Array.isArray(rawOps) && rawOps.length > 0) {
                data = rawOps[0]
              } else if (rawOps && rawOps.length > 0) {
                data = rawOps
              }
            }

            if (!data || data.length === 0) continue

            let idx = 0, px = 0, py = 0
            while (idx < data.length) {
              const op = data[idx++]

              if (op === PATH_MOVE) {
                px = data[idx++]; py = data[idx++]
              }
              else if (op === PATH_LINE) {
                const lx = data[idx++], ly = data[idx++]
                addLine(all, p, `p${p}-cp${j}-${idx}`, px, py, lx, ly)
                px = lx; py = ly
              }
              else if (op === PATH_RECT) {
                const rx = data[idx++], ry = data[idx++]
                const rw = data[idx++], rh = data[idx++]
                addRect(all, p, `p${p}-cpr${j}-${idx}`, rx, ry, rw, rh)
              }
              else if (op === PATH_CUBIC) {
                idx += 6  // skip 6 control-point coords
              }
              else if (op === PATH_CUBIC2) {
                idx += 4
              }
              else if (op === PATH_CLOSE) {
                // no coords consumed
              }
              else {
                // Truly unknown sub-op — break to avoid infinite loop
                break
              }
            }
          }
          // All other ops (save/restore/setFont/showText/etc.) are irrelevant for geometry
        }
      }

      console.log(`Extracted ${all.length} elements (${all.filter(e => e.type !== 'text').length} non-text)`)
      elements.value = all
    } catch (e: any) {
      console.error('PDF load error:', e)
      error.value = e.message || 'Failed to load PDF'
    } finally {
      loading.value = false
    }
  }

  return { pdfDoc, pages, elements, loading, error, loadPdf }
}

// ── Helpers ──────────────────────────────────────────────────────────

function addLine(arr: PdfElement[], page: number, id: string, x1: number, y1: number, x2: number, y2: number) {
  const w = Math.abs(x2 - x1)
  const h = Math.abs(y2 - y1)
  if (w < 0.5 && h < 0.5) return // skip zero-length
  arr.push({
    type: 'line', id, page,
    x: Math.min(x1, x2), y: Math.min(y1, y2),
    width: w, height: h,
  })
}

function addRect(arr: PdfElement[], page: number, id: string, x: number, y: number, w: number, h: number) {
  arr.push({
    type: 'rect', id, page,
    x, y, width: Math.abs(w), height: Math.abs(h),
  })
}
