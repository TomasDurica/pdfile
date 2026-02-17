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
const OPS_CURVE_TO     = 15
const OPS_CURVE_TO_2   = 16
const OPS_CURVE_TO_3   = 17
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
            // args structure (pdfjs v5): [fillRule, [opsTypedArray], valsTypedArray]
            // The ops array is wrapped in an extra array.
            let pathOps: ArrayLike<number>
            let pathVals: ArrayLike<number>

            if (Array.isArray(args) && args.length >= 3) {
              const rawOps = args[1]
              pathOps  = Array.isArray(rawOps) && rawOps.length > 0 ? rawOps[0] : rawOps
              pathVals = args[2]
            } else if (Array.isArray(args) && args.length === 2) {
              // Alternate format: [opsArray, valsArray]
              pathOps  = args[0]
              pathVals = args[1]
            } else {
              continue
            }

            let px = 0, py = 0, vi = 0
            for (let k = 0; k < pathOps.length; k++) {
              const op = pathOps[k]
              if (op === OPS_MOVE_TO) {
                px = pathVals[vi++]; py = pathVals[vi++]
              } else if (op === OPS_LINE_TO) {
                const lx = pathVals[vi++], ly = pathVals[vi++]
                addLine(all, p, `p${p}-cp${j}-${k}`, px, py, lx, ly)
                px = lx; py = ly
              } else if (op === OPS_RECTANGLE) {
                const rx = pathVals[vi++], ry = pathVals[vi++]
                const rw = pathVals[vi++], rh = pathVals[vi++]
                addRect(all, p, `p${p}-cpr${j}-${k}`, rx, ry, rw, rh)
              } else if (op === OPS_CURVE_TO) {
                vi += 6
              } else if (op === OPS_CURVE_TO_2 || op === OPS_CURVE_TO_3) {
                vi += 4
              }
              // closePath (18) and others consume 0 extra values
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
