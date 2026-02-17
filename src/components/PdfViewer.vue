<script setup lang="ts">
import { ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import type { PdfElement } from '../composables/usePdf'

const props = defineProps<{
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  elements: PdfElement[]
  highlightedId: string | null
  selectedId: string | null
  showAllOverlays: boolean
}>()

const emit = defineEmits<{
  (e: 'hover', id: string | null): void
  (e: 'select', id: string): void
}>()

const container = ref<HTMLElement | null>(null)
const itemMap = new Map<string, HTMLElement>()
const SCALE = 1.5

// ── Render one page ──────────────────────────────────────────────────

async function renderPage(pageNum: number) {
  if (!props.pdfDoc || !container.value) return

  const page = await props.pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale: SCALE })

  // Page wrapper
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `position:relative;margin:0 auto 20px;width:${viewport.width}px;height:${viewport.height}px`
  wrapper.className = 'pdf-page shadow-lg bg-white'
  container.value.appendChild(wrapper)

  // Canvas
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  wrapper.appendChild(canvas)
  await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise

  // Overlay layer (sits on top of canvas, captures mouse events)
  const overlayLayer = document.createElement('div')
  overlayLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden'
  wrapper.appendChild(overlayLayer)

  // Create one overlay div per element on this page
  const pageEls = props.elements.filter(el => el.page === pageNum)

  for (const item of pageEls) {
    const box = toViewportBox(item, viewport)
    if (!box) continue

    const div = document.createElement('div')
    div.dataset.id = item.id
    div.dataset.type = item.type
    div.style.cssText = `
      position:absolute;
      left:${box.x}px;top:${box.y}px;
      width:${box.w}px;height:${box.h}px;
      cursor:pointer;
      transition:background .05s;
    `

    // Type-specific styling
    div.classList.add('overlay-base', `overlay-${item.type}`)

    div.addEventListener('mouseenter', () => emit('hover', item.id))
    div.addEventListener('mouseleave', () => emit('hover', null))
    div.addEventListener('click', (ev) => { ev.stopPropagation(); emit('select', item.id) })

    overlayLayer.appendChild(div)
    itemMap.set(item.id, div)
  }
}

// ── Convert a PdfElement to pixel coordinates in the viewport ────────

function toViewportBox(item: PdfElement, viewport: any) {
  let x: number, y: number, w: number, h: number

  if (item.type === 'text' && item.transform) {
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
    const fontH = Math.hypot(tx[2], tx[3])
    const realH = item.height > 0 ? item.height * viewport.scale : fontH

    x = tx[4]
    y = tx[5] - realH
    w = item.width * viewport.scale
    h = realH

    if (w < 1 && h < 1) return null
  } else {
    const p1: [number, number] = [item.x, item.y]
    const p2: [number, number] = [item.x + item.width, item.y + item.height]
    pdfjsLib.Util.applyTransform(p1, viewport.transform)
    pdfjsLib.Util.applyTransform(p2, viewport.transform)

    x = Math.min(p1[0], p2[0])
    y = Math.min(p1[1], p2[1])
    w = Math.abs(p2[0] - p1[0])
    h = Math.abs(p2[1] - p1[1])

    if (w < 3) { x -= 1.5; w = 3 }
    if (h < 3) { y -= 1.5; h = 3 }
  }

  return { x, y, w, h }
}

// ── Full re-render when doc or elements change ──────────────────────

async function renderAll() {
  if (!container.value) return
  container.value.innerHTML = ''
  itemMap.clear()
  if (!props.pdfDoc) return
  for (let i = 1; i <= props.pdfDoc.numPages; i++) {
    await renderPage(i)
  }
  // Apply "show all" state after render
  applyShowAll(props.showAllOverlays)
}

watch(() => props.pdfDoc, renderAll)
watch(() => props.elements, renderAll)

// ── "Show All" toggle ────────────────────────────────────────────────

function applyShowAll(show: boolean) {
  itemMap.forEach((el) => {
    if (show) {
      el.classList.add('show-all')
    } else {
      el.classList.remove('show-all')
    }
  })
}

watch(() => props.showAllOverlays, (show) => {
  applyShowAll(show)
})

// ── Highlight / select watchers ──────────────────────────────────────

watch(() => props.highlightedId, (newId, oldId) => {
  if (oldId) {
    const el = itemMap.get(oldId)
    if (el) el.classList.remove('is-highlighted')
  }
  if (newId) {
    const el = itemMap.get(newId)
    if (el) el.classList.add('is-highlighted')
  }
})

watch(() => props.selectedId, (newId, oldId) => {
  if (oldId) {
    const el = itemMap.get(oldId)
    if (el) el.classList.remove('is-selected')
  }
  if (newId) {
    const el = itemMap.get(newId)
    if (el) {
      el.classList.add('is-selected')
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
})
</script>

<template>
  <div ref="container" class="bg-gray-500/20 p-8 h-full w-full overflow-y-auto">
    <div v-if="!pdfDoc" class="flex flex-col items-center justify-center h-full text-gray-500">
      <div class="i-carbon-document-pdf text-6xl mb-4" />
      <p class="text-xl">Drop a PDF file here to start exploring</p>
    </div>
  </div>
</template>

<style>
/* Base overlay — invisible until hovered / highlighted / selected */
.overlay-base {
  box-sizing: border-box;
}

/* Hover colors per type */
.overlay-text:hover  { background: rgba(234, 179, 8, 0.2); }
.overlay-line:hover  { background: rgba(59, 130, 246, 0.3); }
.overlay-rect:hover  { background: rgba(34, 197, 94, 0.25); }

/* "Show All" mode — type-based tint always visible */
.overlay-text.show-all { background: rgba(234, 179, 8, 0.15);  outline: 1px solid rgba(234, 179, 8, 0.3); }
.overlay-line.show-all { background: rgba(59, 130, 246, 0.20); outline: 1px solid rgba(59, 130, 246, 0.5); }
.overlay-rect.show-all { background: rgba(34, 197, 94, 0.15);  outline: 1px solid rgba(34, 197, 94, 0.4); }

/* Hover intensifies in show-all mode */
.overlay-text.show-all:hover { background: rgba(234, 179, 8, 0.35); }
.overlay-line.show-all:hover { background: rgba(59, 130, 246, 0.45); }
.overlay-rect.show-all:hover { background: rgba(34, 197, 94, 0.40); }

/* Individual highlight (from list hover) */
.is-highlighted { background: rgba(96, 165, 250, 0.35) !important; outline: 1px solid rgba(96, 165, 250, 0.6) !important; }

/* Selected element */
.is-selected {
  background: rgba(34, 197, 94, 0.35) !important;
  outline: 2px solid rgba(74, 222, 128, 0.7) !important;
}
</style>
