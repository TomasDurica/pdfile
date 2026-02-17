<script setup lang="ts">
import { watch, nextTick, computed, ref } from 'vue'
import type { PdfElement } from '../composables/usePdf'

const props = defineProps<{
  items: PdfElement[]
  highlightedId: string | null
  selectedId: string | null
  showAllOverlays: boolean
}>()

const emit = defineEmits<{
  (e: 'hover', id: string | null): void
  (e: 'select', id: string): void
  (e: 'update:showAllOverlays', value: boolean): void
}>()

const collapsedPages = ref(new Set<number>())
const searchQuery = ref('')

// Filter items by search query
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((item: PdfElement) => {
    if (item.type === 'text' && item.str) {
      return item.str.toLowerCase().includes(q)
    }
    // For non-text, match type name or coordinates
    const label = `${item.type} ${Math.round(item.x)} ${Math.round(item.y)}`
    return label.toLowerCase().includes(q)
  })
})

const groupedItems = computed(() => {
  const groups = new Map<number, PdfElement[]>()
  for (const item of filteredItems.value) {
    if (!groups.has(item.page)) groups.set(item.page, [])
    groups.get(item.page)!.push(item)
  }
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
})

const selectedItem = computed(() =>
  props.items.find((i: PdfElement) => i.id === props.selectedId)
)

// Stats
const stats = computed(() => {
  const text = props.items.filter((i: PdfElement) => i.type === 'text').length
  const lines = props.items.filter((i: PdfElement) => i.type === 'line').length
  const rects = props.items.filter((i: PdfElement) => i.type === 'rect').length
  return { text, lines, rects, total: props.items.length }
})

function togglePage(page: number) {
  const s = collapsedPages.value
  s.has(page) ? s.delete(page) : s.add(page)
}

// Auto-scroll list when something is selected from the viewer
watch(() => props.selectedId, async (newId: string | null) => {
  if (!newId) return
  const item = props.items.find((i: PdfElement) => i.id === newId)
  if (item && collapsedPages.value.has(item.page)) {
    collapsedPages.value.delete(item.page)
  }
  await nextTick()
  document.getElementById(`list-item-${newId}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
})
</script>

<template>
  <div class="h-full flex flex-col bg-gray-900 text-gray-200 border-r border-gray-700">
    
    <!-- Search & Controls -->
    <div v-if="items.length > 0" class="border-b border-gray-800">
      <!-- Search -->
      <div class="p-2">
        <div class="relative">
          <span class="absolute left-2 top-1/2 -translate-y-1/2 i-carbon-search text-gray-500 text-sm" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search elements..."
            class="w-full pl-7 pr-8 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 top-1/2 -translate-y-1/2 i-carbon-close text-gray-500 hover:text-gray-300 text-sm cursor-pointer"
          />
        </div>
      </div>
      
      <!-- Stats & Toggle -->
      <div class="px-2 pb-2 flex items-center justify-between text-xs text-gray-500">
        <div class="flex gap-2">
          <span class="text-yellow-500">{{ stats.text }} text</span>
          <span class="text-blue-400">{{ stats.lines }} lines</span>
          <span class="text-green-400">{{ stats.rects }} rects</span>
        </div>
        <label class="flex items-center gap-1.5 cursor-pointer select-none">
          <span class="text-gray-400">Show all</span>
          <button
            :class="showAllOverlays ? 'bg-blue-600' : 'bg-gray-700'"
            class="relative w-8 h-4 rounded-full transition-colors"
            @click="emit('update:showAllOverlays', !showAllOverlays)"
          >
            <span
              :class="showAllOverlays ? 'translate-x-4' : 'translate-x-0.5'"
              class="absolute top-0.5 left-0 w-3 h-3 bg-white rounded-full transition-transform"
            />
          </button>
        </label>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div v-if="items.length === 0" class="p-4 text-center text-gray-500">
        No extracted elements yet. Upload a PDF to start.
      </div>

      <div v-else-if="filteredItems.length === 0" class="p-4 text-center text-gray-500">
        No matches for "{{ searchQuery }}"
      </div>

      <div v-else class="divide-y divide-gray-800">
        <div v-for="[page, pageItems] in groupedItems" :key="page">
          <!-- Page header -->
          <div
            class="sticky top-0 z-10 bg-gray-800 p-2 flex items-center justify-between cursor-pointer hover:bg-gray-750"
            @click="togglePage(page)"
          >
            <span class="font-bold text-sm">Page {{ page }}</span>
            <span class="text-xs text-gray-400">
              {{ pageItems.length }} items
              <span
                :class="collapsedPages.has(page) ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'"
                class="inline-block ml-1"
              />
            </span>
          </div>

          <!-- Items -->
          <ul v-show="!collapsedPages.has(page)" class="divide-y divide-gray-800/50">
            <li
              v-for="item in pageItems"
              :key="item.id"
              :id="`list-item-${item.id}`"
              class="p-2 cursor-pointer transition-colors text-sm hover:bg-gray-800 pl-4 border-l-2 border-transparent flex items-center gap-2"
              :class="{
                'bg-blue-900/30': highlightedId === item.id,
                'bg-blue-800/50 border-l-blue-500': selectedId === item.id,
              }"
              @mouseenter="emit('hover', item.id)"
              @mouseleave="emit('hover', null)"
              @click="emit('select', item.id)"
            >
              <!-- Icon -->
              <span v-if="item.type === 'text'" class="i-carbon-text-font text-yellow-500 flex-shrink-0" />
              <span v-else-if="item.type === 'line'" class="i-carbon-subtract text-blue-400 flex-shrink-0" />
              <span v-else class="i-carbon-checkbox text-green-400 flex-shrink-0" />

              <!-- Label -->
              <div class="truncate flex-1">
                <template v-if="item.type === 'text'">{{ item.str }}</template>
                <span v-else class="text-xs text-gray-400 font-mono">
                  {{ item.type }} [{{ Math.round(item.x) }}, {{ Math.round(item.y) }}, {{ Math.round(item.width) }}×{{ Math.round(item.height) }}]
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- JSON detail panel -->
    <div v-if="selectedItem" class="h-1/3 border-t border-gray-700 overflow-y-auto bg-gray-950 p-4 shadow-inner">
      <div class="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-gray-950 pb-2 border-b border-gray-800">
        Selected Element Details
      </div>
      <pre class="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">{{ JSON.stringify(selectedItem, null, 2) }}</pre>
    </div>
  </div>
</template>
