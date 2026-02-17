<script setup lang="ts">
import { ref, watch } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'

const props = defineProps<{
  pdfDoc: pdfjsLib.PDFDocumentProxy | null
  highlightedId: string | null
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'hover', id: string | null): void
  (e: 'select', id: string): void
}>()

const container = ref<HTMLElement | null>(null)

// Map to store text items with their DOM elements for highlighting
const itemMap = new Map<string, HTMLElement>()
const pageScale = ref(1.5)

const renderPage = async (pageNumber: number) => {
  if (!props.pdfDoc || !container.value) return

  const page = await props.pdfDoc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: pageScale.value })

  // Create wrapper for page
  const pageWrapper = document.createElement('div')
  pageWrapper.style.position = 'relative'
  pageWrapper.style.marginBottom = '20px'
  pageWrapper.style.width = `${viewport.width}px`
  pageWrapper.style.height = `${viewport.height}px`
  pageWrapper.className = 'pdf-page shadow-lg mx-auto bg-white'
  container.value.appendChild(pageWrapper)

  // Canvas for rendering
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  canvas.height = viewport.height
  canvas.width = viewport.width
  pageWrapper.appendChild(canvas)

  const renderContext = {
    canvasContext: context!,
    viewport: viewport,
    canvas,
  }
  
  await page.render(renderContext).promise

  // Text layer for selection and highlighting
  const textLayerDiv = document.createElement('div')
  textLayerDiv.className = 'textLayer'
  textLayerDiv.style.width = `${viewport.width}px`
  textLayerDiv.style.height = `${viewport.height}px`
  pageWrapper.appendChild(textLayerDiv)

  const textContent = await page.getTextContent()
  
  // Custom rendering of text items to allow for efficient highlighting and interaction
  // Alternatively we could use pdfjsLib.renderTextLayer but we want custom interactivity easily mapped to our items
  
  textContent.items.forEach((item: any, index: number) => {
    if (!('str' in item)) return
    
    // We need to match the logic in usePdf to generate IDs
    const id = `page-${pageNumber}-item-${index}`
    
    // Create an overlay element
    // Note: PDF.js viewport.transform is [scaleX, skewY, skewX, scaleY, tx, ty]
    // We need to convert PDF coordinates to Viewport coordinates
    
    // A simplified approach for now - this might need refinement for complex transforms
    // But for now let's try to map the item to the viewport
    
    // We can use the viewport to convert the rect
    // item.transform is [scaleX, skewY, skewX, scaleY, x, y]
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
    
    // Width and height need to be calculated based on font size and scale
    // This is tricky without the full font metric logic from PDF.js
    // For now, let's try to wrap the bare minimum.
    
    // Better yet, let's use the PDF.js text layer builder approach or at least similar logic?
    // Actually, let's create simple spans positioned absolutely.
    
    const span = document.createElement('span')
    span.textContent = item.str
    span.id = `pdf-item-${id}`
    span.dataset.id = id
    span.style.position = 'absolute'
    span.style.left = `${tx[4]}px`
    span.style.top = `${tx[5] - item.height * viewport.scale}px` // PDF y is bottom-up? Check viewport conversion.
    // PDF.js coordinate system: (0,0) is usually bottom-left. Viewport.transform handles the flip.
    // But wait, tx[5] from viewport transform should be correct top-left based.
    
    // Let's refine the position.
    // If we assume horizontal writing mode:
    const fontHeight = Math.hypot(tx[2], tx[3]);
    
    span.style.fontSize = `${fontHeight}px`
    span.style.fontFamily = 'sans-serif' // Fallback
    span.style.color = 'transparent' // Hide text but keep it selectable/interactive? 
    // Or we make it semi-transparent for debugging?
    // The requirements say "highlight", so maybe we just render the highlight box *under* or *over*?
    // Let's make it a highlight overlay.
    span.style.cursor = 'pointer'
    
    // We need the width. item.width is in PDF units.
    const width = item.width * viewport.scale
    const height = item.height * viewport.scale || fontHeight
    
    // Let's position a div *over* the text for interaction
    const overlay = document.createElement('div')
    overlay.dataset.id = id
    overlay.style.position = 'absolute'
    
    // PDF.js util transform returns [x, y] for a point.
    // The item.transform [4] and [5] are the translation.
    
    // Let's use the viewport.convertToViewportPoint equivalent logic if needed.
    // Actually viewport.transform[4] and [5] are the offset.
    
    // To match PDF.js text layer exactly is hard without their CSS.
    // Let's try to approximate the bounding box.
    // x = tx[4]
    // y = tx[5] - height (since PDF origin for text is usually baseline)
    
    overlay.style.left = `${tx[4]}px`
    overlay.style.top = `${tx[5] - height}px` 
    overlay.style.width = `${width}px`
    overlay.style.height = `${height}px`
    overlay.className = 'hover:bg-blue-500/20 absolute transition-colors duration-75'
    
    // Add event listeners
    overlay.addEventListener('mouseenter', () => emit('hover', id))
    overlay.addEventListener('mouseleave', () => emit('hover', null))
    overlay.addEventListener('click', (e) => {
        e.stopPropagation()
        emit('select', id)
    })
    
    textLayerDiv.appendChild(overlay)
    itemMap.set(id, overlay)
  })
}

const renderPdf = async () => {
    if (!container.value) return
    container.value.innerHTML = '' // Clear previous
    itemMap.clear()
    
    if (!props.pdfDoc) return
    
    for (let i = 1; i <= props.pdfDoc.numPages; i++) {
        await renderPage(i)
    }
}

watch(() => props.pdfDoc, renderPdf)

watch(() => props.highlightedId, (newId: string | null, oldId: string | null) => {
    if (oldId) {
        const el = itemMap.get(oldId)
        if (el) el.classList.remove('bg-blue-500/40', 'ring-2', 'ring-blue-400')
    }
    if (newId) {
        const el = itemMap.get(newId)
        if (el) {
            el.classList.add('bg-blue-500/40')
        }
    }
})

watch(() => props.selectedId, (newId: string | null, oldId: string | null) => {
    if (oldId) {
         const el = itemMap.get(oldId)
         if (el) el.classList.remove('bg-green-500/40', 'ring-2', 'ring-green-400')
    }
    if (newId) {
         const el = itemMap.get(newId)
         if (el) {
             el.classList.add('bg-green-500/40', 'ring-2', 'ring-green-400')
             el.scrollIntoView({ behavior: 'smooth', block: 'center' })
         }
    }
})
</script>

<template>
  <div ref="container" class="pdf-viewer bg-gray-500/20 p-8 h-full w-full overflow-y-auto">
    <div v-if="!pdfDoc" class="flex flex-col items-center justify-center h-full text-gray-500">
      <div class="i-carbon-document-pdf text-6xl mb-4" />
      <p class="text-xl">Drop a PDF file here to start exploring</p>
    </div>
  </div>
</template>

<style>
.textLayer {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    line-height: 1.0;
}
</style>
