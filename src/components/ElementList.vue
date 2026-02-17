<script setup lang="ts">
import { defineProps, defineEmits, watch, nextTick } from 'vue'

interface TextItem {
  str: string
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

const onHover = (id: string | null) => {
  emit('hover', id)
}

const onSelect = (id: string) => {
  emit('select', id)
}

watch(() => props.selectedId, async (newId: string | null) => {
  if (newId) {
    await nextTick()
    const el = document.getElementById(`list-item-${newId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-gray-900 text-gray-200 border-r border-gray-700">
    <div v-if="props.items.length === 0" class="p-4 text-center text-gray-500">
      No extracted elements yet. Upload a PDF to start.
    </div>
    
    <ul v-else class="divide-y divide-gray-800">
      <li 
        v-for="item in props.items" 
        :key="item.id"
        :id="`list-item-${item.id}`"
        class="p-2 cursor-pointer transition-colors text-sm hover:bg-gray-800"
        :class="{ 
          'bg-blue-900/30': props.highlightedId === item.id,
          'bg-blue-800/50 border-l-4 border-blue-500': props.selectedId === item.id
        }"
        @mouseenter="onHover(item.id)"
        @mouseleave="onHover(null)"
        @click="onSelect(item.id)"
      >
        <div class="font-mono text-xs text-gray-500 mb-1">Page {{ item.page }}</div>
        <div class="truncate">{{ item.str }}</div>
      </li>
    </ul>
  </div>
</template>
