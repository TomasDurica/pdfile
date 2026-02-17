import * as pdfjsLib from 'pdfjs-dist'

// Set up the worker source
// In Vite, we can import the worker script as a URL
import pdfWorker from 'pdfjs-dist/build/pdf.worker?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

import { ref, shallowRef } from 'vue'

export interface TextItem {
  str: string
  dir: string
  width: number
  height: number
  transform: number[]
  fontName: string
  hasEOL: boolean
  id: string // We will generate a unique ID
  page: number
}

export function usePdf() {
  const pdfDoc = shallowRef<pdfjsLib.PDFDocumentProxy | null>(null)
  const pages = ref<number>(0)
  const textItems = ref<TextItem[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const loadPdf = async (file: File) => {
    loading.value = true
    error.value = null
    pdfDoc.value = null
    textItems.value = []
    pages.value = 0

    try {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjsLib.getDocument(arrayBuffer)
      const doc = await loadingTask.promise
      
      pdfDoc.value = doc
      pages.value = doc.numPages

      // Extract text from all pages
      const items: TextItem[] = []
      
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const textContent = await page.getTextContent()
        
        textContent.items.forEach((item: any, index) => {
          if ('str' in item) {
             items.push({
               ...item,
               id: `page-${i}-item-${index}`,
               page: i
             })
          }
        })
      }
      
      textItems.value = items

    } catch (e: any) {
      console.error('Error loading PDF:', e)
      error.value = e.message || 'Failed to load PDF'
    } finally {
      loading.value = false
    }
  }

  return {
    pdfDoc,
    pages,
    textItems,
    loading,
    error,
    loadPdf
  }
}
