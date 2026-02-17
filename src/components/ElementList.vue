<script setup lang="ts">
import { defineProps, defineEmits, watch, nextTick, computed, ref } from 'vue'

interface TextItem {
  str: string
  dir: string
  width: number
  height: number
  transform: number[]
  fontName: string
  hasEOL: boolean
  id: string
  page: number
}

const props = defineProps<{
  items: TextItem[]
  highlightedId: string | null
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'hover', id: string | null): void
  (e: 'select', id: string): void
}>()

const collapsedPages = ref(new Set<number>())

const groupedItems = computed(() => {
  const groups = new Map<number, TextItem[]>()
  props.items.forEach((item: TextItem) => {
    if (!groups.has(item.page)) {
      groups.set(item.page, [])
    }
    groups.get(item.page)!.push(item)
  })
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
})

const selectedItem = computed(() => {
  return props.items.find((item: TextItem) => item.id === props.selectedId)
})

const togglePage = (page: number) => {
  if (collapsedPages.value.has(page)) {
    collapsedPages.value.delete(page)
  } else {
    collapsedPages.value.add(page)
  }
}

const onHover = (id: string | null) => {
  emit('hover', id)
}

const onSelect = (id: string) => {
  emit('select', id)
}

watch(() => props.selectedId, async (newId: string | null) => {
  if (newId) {
    // Ensure the page of the selected item is expanded
    const item = props.items.find((i: TextItem) => i.id === newId)
    if (item && collapsedPages.value.has(item.page)) {
      collapsedPages.value.delete(item.page)
    }

    await nextTick()
    const el = document.getElementById(`list-item-${newId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
})
</script>

<template>
  <div class="h-full flex flex-col bg-gray-900 text-gray-200 border-r border-gray-700">
    <!-- List Area -->
    <div class="flex-1 overflow-y-auto min-h-0">
      <div v-if="props.items.length === 0" class="p-4 text-center text-gray-500">
        No extracted elements yet. Upload a PDF to start.
      </div>
      
      <div v-else class="divide-y divide-gray-800">
        <div v-for="[page, items] in groupedItems" :key="page">
          <!-- Page Header -->
          <div 
            class="sticky top-0 z-10 bg-gray-800 p-2 flex items-center justify-between cursor-pointer hover:bg-gray-750"
            @click="togglePage(page)"
          >
            <span class="font-bold text-sm">Page {{ page }}</span>
            <span class="text-xs text-gray-400">
              {{ items.length }} items
              <span :class="collapsedPages.has(page) ? 'i-carbon-chevron-right' : 'i-carbon-chevron-down'" class="inline-block ml-1"/>
            </span>
          </div>

          <!-- Items -->
          <ul v-show="!collapsedPages.has(page)" class="divide-y divide-gray-800/50">
            <li 
              v-for="item in items" 
              :key="item.id"
              :id="`list-item-${item.id}`"
              class="p-2 cursor-pointer transition-colors text-sm hover:bg-gray-800 pl-4 border-l-2 border-transparent"
              :class="{ 
                'bg-blue-900/30': props.highlightedId === item.id,
                'bg-blue-800/50 border-l-blue-500': props.selectedId === item.id
              }"
              @mouseenter="onHover(item.id)"
              @mouseleave="onHover(null)"
              @click="onSelect(item.id)"
            >
              <div class="truncate">{{ item.str }}</div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- JSON View Area -->
    <div v-if="selectedItem" class="h-1/3 border-t border-gray-700 overflow-y-auto bg-gray-950 p-4 shadow-inner">
      <div class="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-gray-950 pb-2 border-b border-gray-800">
        Selected Element Details
      </div>
      <pre class="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">{{ JSON.stringify(selectedItem, null, 2) }}</pre>
    </div>
  </div>
</template>
