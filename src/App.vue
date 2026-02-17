<script setup lang="ts">
import { ref } from 'vue'
import { useDropZone, useFileDialog } from '@vueuse/core'
import { usePdf } from './composables/usePdf'
import PdfViewer from './components/PdfViewer.vue'
import ElementList from './components/ElementList.vue'

const mainRef = ref<HTMLElement | null>(null)
const { loadPdf, pdfDoc, textItems, loading, error } = usePdf()

const highlightedId = ref<string | null>(null)
const selectedId = ref<string | null>(null)

const onDrop = (files: File[] | null) => {
  if (files && files.length > 0 && files[0].type === 'application/pdf') {
    loadPdf(files[0])
  }
}

const { isOverDropZone } = useDropZone(mainRef, {
  onDrop,
  dataTypes: ['application/pdf']
})

const { open, onChange } = useFileDialog({
  accept: 'application/pdf',
  multiple: false,
})

onChange((files) => {
  if (files && files.length > 0) {
    loadPdf(files[0])
  }
})

const onHover = (id: string | null) => {
  highlightedId.value = id
}

const onSelect = (id: string) => {
  selectedId.value = id
}

</script>

<template>
  <main ref="mainRef" class="h-screen w-screen flex bg-gray-950 text-gray-200 overflow-hidden relative">
    
    <!-- Drag & Drop Overlay -->
    <div 
      v-if="isOverDropZone" 
      class="absolute inset-0 z-50 bg-blue-500/50 flex items-center justify-center backdrop-blur-sm pointer-events-none"
    >
      <div class="text-4xl font-bold text-white">Drop PDF here</div>
    </div>

    <!-- Sidebar -->
    <aside class="w-80 flex-shrink-0 border-r border-gray-800 flex flex-col">
      <div class="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-900">
        <h1 class="font-bold text-lg">PDF Explorer</h1>
        <button 
          @click="open()" 
          class="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
        >
          Open File
        </button>
      </div>

      <div v-if="loading" class="p-4 text-center text-blue-400">
        Loading PDF...
      </div>
      
      <div v-if="error" class="p-4 text-center text-red-500">
        {{ error }}
      </div>

      <ElementList 
        class="flex-1"
        :items="textItems" 
        :highlighted-id="highlightedId"
        :selected-id="selectedId"
        @hover="onHover"
        @select="onSelect"
      />
    </aside>

    <!-- Main Content -->
    <section class="flex-1 overflow-hidden relative bg-gray-900">
      <PdfViewer 
        :pdf-doc="pdfDoc"
        :highlighted-id="highlightedId"
        :selected-id="selectedId"
        @hover="onHover"
        @select="onSelect"
      />
    </section>

  </main>
</template>

<style>
/* Global scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: #111827; 
}
::-webkit-scrollbar-thumb {
  background: #374151; 
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #4b5563; 
}
</style>
