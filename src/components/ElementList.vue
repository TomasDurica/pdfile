<script setup lang="ts">
import { watch, nextTick, computed, ref } from 'vue'
import type { PdfElement } from '../composables/usePdf'
import type { DetectedTable } from '../composables/useTableDetection'

const activeTab = defineModel<"elements" | "tables">()

const props = defineProps<{
  items: PdfElement[]
  tables: DetectedTable[]
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
const expandedTables = ref(new Set<string>())

// ── Element list logic ──────────────────────────────────────────────

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter((item: PdfElement) => {
    if (item.type === 'text' && item.str) {
      return item.str.toLowerCase().includes(q)
    }
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

// ── Tables logic ────────────────────────────────────────────────────

const tablesByPage = computed(() => {
  const groups = new Map<number, DetectedTable[]>()
  for (const t of props.tables) {
    if (!groups.has(t.page)) groups.set(t.page, [])
    groups.get(t.page)!.push(t)
  }
  return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
})

function toggleTable(id: string) {
  const s = expandedTables.value
  s.has(id) ? s.delete(id) : s.add(id)
}

// ── Auto-scroll on select ───────────────────────────────────────────

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
    
    <!-- Tab bar -->
    <div class="flex border-b border-gray-800 bg-gray-900">
      <button
        class="flex-1 py-2 text-sm font-medium transition-colors text-center"
        :class="activeTab === 'elements'
          ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
          : 'text-gray-500 hover:text-gray-300'"
        @click="activeTab = 'elements'"
      >
        <span class="i-carbon-list mr-1" />
        Elements
        <span v-if="items.length" class="ml-1 text-xs opacity-60">({{ items.length }})</span>
      </button>
      <button
        class="flex-1 py-2 text-sm font-medium transition-colors text-center"
        :class="activeTab === 'tables'
          ? 'text-purple-400 border-b-2 border-purple-400 bg-gray-800/50'
          : 'text-gray-500 hover:text-gray-300'"
        @click="activeTab = 'tables'"
      >
        <span class="i-carbon-table mr-1" />
        Tables
        <span v-if="tables.length" class="ml-1 text-xs opacity-60">({{ tables.length }})</span>
      </button>
    </div>

    <!-- ═══════ ELEMENTS TAB ═══════ -->
    <template v-if="activeTab === 'elements'">
      <!-- Search & Controls -->
      <div v-if="items.length > 0" class="border-b border-gray-800">
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
                <span v-if="item.type === 'text'" class="i-carbon-text-font text-yellow-500 flex-shrink-0" />
                <span v-else-if="item.type === 'line'" class="i-carbon-subtract text-blue-400 flex-shrink-0" />
                <span v-else class="i-carbon-checkbox text-green-400 flex-shrink-0" />
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
    </template>

    <!-- ═══════ TABLES TAB ═══════ -->
    <template v-if="activeTab === 'tables'">
      <div class="flex-1 overflow-y-auto min-h-0">
        <div v-if="tables.length === 0" class="p-4 text-center text-gray-500">
          <div class="i-carbon-table text-4xl mb-2 mx-auto opacity-40" />
          <p>No tables detected.</p>
          <p class="text-xs mt-1">Tables are inferred from intersecting horizontal and vertical lines.</p>
        </div>

        <div v-else class="divide-y divide-gray-800">
          <div v-for="[page, pageTables] in tablesByPage" :key="page">
            <!-- Page header -->
            <div class="sticky top-0 z-10 bg-gray-800 p-2 font-bold text-sm">
              Page {{ page }}
            </div>

            <!-- Tables on this page -->
            <div v-for="table in pageTables" :key="table.id" class="border-b border-gray-800/50">
              <!-- Table header -->
              <div
                class="p-2 pl-4 flex items-center gap-2 cursor-pointer hover:bg-gray-800 transition-colors"
                :class="{
                  'bg-purple-900/30': highlightedId === table.id,
                  'bg-purple-800/40 border-l-2 border-l-purple-500': selectedId === table.id,
                }"
                @mouseenter="emit('hover', table.id)"
                @mouseleave="emit('hover', null)"
                @click="emit('select', table.id)"
              >
                <span class="i-carbon-table text-purple-400 flex-shrink-0" />
                <div class="flex-1">
                  <div class="text-sm font-medium">
                    {{ table.rows }}×{{ table.cols }} Table
                  </div>
                  <div class="text-xs text-gray-500 font-mono">
                    at [{{ Math.round(table.x) }}, {{ Math.round(table.y) }}]
                    · {{ table.lineIds.length }} lines
                  </div>
                </div>
                <button
                  class="text-gray-500 hover:text-gray-300 p-1 transition-colors"
                  @click.stop="toggleTable(table.id)"
                >
                  <span :class="expandedTables.has(table.id) ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right'" />
                </button>
              </div>

              <!-- Expanded: show table grid -->
              <div v-if="expandedTables.has(table.id)" class="px-4 pb-3 bg-gray-850">
                <div class="overflow-x-auto">
                  <table class="w-full text-xs border-collapse mt-1">
                    <tbody>
                      <tr v-for="(row, ri) in table.cells" :key="ri">
                        <td
                          v-for="(cell, ci) in row"
                          :key="ci"
                          class="border border-gray-700 p-1.5 text-gray-300 max-w-32 truncate"
                          :class="cell.text ? 'bg-gray-800' : 'bg-gray-900 text-gray-600 italic'"
                          :title="cell.text || '(empty)'"
                        >
                          {{ cell.text || '—' }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Table JSON detail -->
      <div v-if="selectedId?.startsWith('table-')" class="h-1/3 border-t border-gray-700 overflow-y-auto bg-gray-950 p-4 shadow-inner">
        <div class="text-xs font-bold text-gray-500 mb-2 sticky top-0 bg-gray-950 pb-2 border-b border-gray-800">
          Table Details
        </div>
        <pre class="text-xs font-mono text-purple-400 whitespace-pre-wrap break-all">{{ JSON.stringify(tables.find(t => t.id === selectedId), null, 2) }}</pre>
      </div>
    </template>
  </div>
</template>
