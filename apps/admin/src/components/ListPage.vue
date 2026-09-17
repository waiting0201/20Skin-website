<script setup lang="ts">
// 通用清單畫面：九個內容模型共用（docs/09-frontend.md §8）。
// 分頁 20 筆、關鍵字、狀態／分類篩選、批次上下架、排序（此輪先用上／下移動
// 按鈕代替真正拖曳——之後要換成拖曳排序時，只需要換 UI，呼叫的仍是同一支
// `adminApi.content.sort()`，不用動資料層）。
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { adminApi, ApiError } from '@/api/client'
import { currentUser } from '@/auth'
import { can, canCreateTerm } from '@/permissions'
import type { AdminRecord, ContentStatus, UnitKey } from '@/types'
import { STATUS_LABEL } from '@/types'
import { UNIT_REGISTRY } from '@/units'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ unit: UnitKey }>()
const router = useRouter()
const def = computed(() => UNIT_REGISTRY[props.unit])
const user = currentUser()
const permCtx = user ? { roles: user.roles, isSuperAdmin: user.isSuperAdmin } : null

const canView = computed(() => can(permCtx, props.unit, 'view'))
const canEdit = computed(() => can(permCtx, props.unit, 'edit'))
const canPublish = computed(() => can(permCtx, props.unit, 'publish'))
const canCreateGeneric = computed(() => {
  if (props.unit === 'term') return false // term 另有兩顆專用按鈕，見下方
  return canEdit.value
})

const items = ref<AdminRecord[]>([])
const totalCount = ref(0)
const loading = ref(true)
const selected = ref<Set<number>>(new Set())

const query = reactive({ page: 1, pageSize: 20, keyword: '', status: '' as '' | ContentStatus, categoryId: '' })
const categoryOptions = ref<{ value: string; label: string }[]>([])

// 醫師角色只能編輯自己的內容——清單預設先幫他們濾出自己的（docs/10-api.md §3.3：
// OwnerUserId 判定）。這是體驗上的便利，不是安全邊界；勾掉一樣看得到別人的（若有 view 權限）。
const onlyMine = ref(Boolean(user?.roles.includes('Doctor') && !user?.isSuperAdmin && def.value.ownershipRestricted))

async function loadCategoryOptions() {
  if (def.value.categoryTermType) {
    categoryOptions.value = await adminApi.taxonomy.termOptions(def.value.categoryTermType)
  }
}

async function load() {
  loading.value = true
  const result = await adminApi.content.list(props.unit, {
    page: query.page,
    pageSize: query.pageSize,
    keyword: query.keyword || undefined,
    status: query.status || undefined,
    categoryId: query.categoryId ? Number(query.categoryId) : undefined,
    ownerUserId: onlyMine.value && user ? user.id : undefined,
  })
  items.value = result.items
  totalCount.value = result.totalCount
  selected.value = new Set()
  loading.value = false
}

onMounted(async () => {
  await loadCategoryOptions()
  await load()
})
watch(() => props.unit, async () => { query.page = 1; await loadCategoryOptions(); await load() })
watch([() => query.keyword, () => query.status, () => query.categoryId, onlyMine], () => { query.page = 1; load() })
watch(() => query.page, load)

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / query.pageSize)))

function toggleSelect(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}
function toggleSelectAll() {
  selected.value = selected.value.size === items.value.length ? new Set() : new Set(items.value.map((i) => i.id))
}

async function batchPublish(status: 3 | 4) {
  for (const id of selected.value) {
    await adminApi.content.setPublishState(props.unit, id, status, user!.id)
  }
  await load()
}

async function move(id: number, direction: -1 | 1) {
  const index = items.value.findIndex((i) => i.id === id)
  const target = index + direction
  if (target < 0 || target >= items.value.length) return
  const ids = items.value.map((i) => i.id)
  ;[ids[index], ids[target]] = [ids[target], ids[index]]
  await adminApi.content.sort(props.unit, ids, user!.id)
  await load()
}

const creating = ref(false)
const errorMessage = ref('')

function defaultFieldsFor(): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const f of def.value.fields) {
    if (f.readOnly) continue
    if (f.type === 'boolean') fields[f.key] = f.key === 'isPhysician' // 14 位成員多數是醫師，預設打開，安喬那筆進去再手動關閉
    else if (['repeater', 'gallery', 'tags', 'hours'].includes(f.type)) fields[f.key] = []
    else fields[f.key] = ''
  }
  return fields
}

async function createDraft(overrideFields: Record<string, unknown> = {}) {
  creating.value = true
  errorMessage.value = ''
  try {
    const fields = { ...defaultFieldsFor(), ...overrideFields }
    if (props.unit === 'page') fields.pageKind = '1' // UI 新增一律是自由頁，系統頁只能由種子建立（docs/02 §1）
    // 醫師角色新增自己的個人頁／文章時，直接把 OwnerUserId 設成自己，
    // 不然剛建立完馬上就會被自己的「僅能編輯自己的內容」規則擋下（docs/10 §3.3）。
    const ownerUserId = def.value.ownershipRestricted && user?.roles.includes('Doctor') && !user.isSuperAdmin ? user.id : undefined
    const created = await adminApi.content.create(
      props.unit,
      { title: '未命名', slug: def.value.producesUrl ? `untitled-${Date.now()}` : undefined, fields, ownerUserId },
      user!.id,
    )
    await router.push(`/${props.unit}/${created.id}`)
  } catch (e) {
    errorMessage.value = e instanceof ApiError ? e.message : '建立失敗。'
  } finally {
    creating.value = false
  }
}

const newTagTermType = ref('1')
</script>

<template>
  <div>
    <div class="adm-page__head">
      <div>
        <h1 class="adm-page__title">{{ def.label }}</h1>
        <p class="adm-page__desc">共 {{ totalCount }} 筆</p>
      </div>
      <div class="adm-page__actions">
        <template v-if="unit === 'term'">
          <select v-model="newTagTermType" class="adm-select" style="width:auto" v-if="user?.isSuperAdmin">
            <option value="1">療程分類</option>
            <option value="2">文章分類</option>
            <option value="3">FAQ 分類</option>
          </select>
          <button v-if="canCreateTerm(permCtx, false)" type="button" class="btn btn--ghost" :disabled="creating" @click="createDraft({ termType: newTagTermType })">
            ＋ 新增分類（限超級管理員）
          </button>
          <button v-if="canCreateTerm(permCtx, true)" type="button" class="btn btn--primary" :disabled="creating" @click="createDraft({ termType: '4' })">
            ＋ 新增標籤
          </button>
        </template>
        <button v-else-if="canCreateGeneric" type="button" class="btn btn--primary" :disabled="creating" @click="createDraft()">
          ＋ 新增{{ def.labelSingular }}
        </button>
      </div>
    </div>

    <p v-if="errorMessage" class="adm-alert adm-alert--danger" role="alert" style="margin-bottom: var(--sp-4)">{{ errorMessage }}</p>

    <div v-if="!canView" class="adm-empty">
      <div class="adm-empty__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="5" y="10.5" width="14" height="9" rx="1.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
      </div>
      <p class="adm-empty__title">沒有檢視權限</p>
      <p class="adm-empty__desc">你的帳號角色目前沒有「{{ def.label }}」的檢視權限，如果這是誤判，請聯絡系統管理員調整角色權限設定。</p>
    </div>

    <template v-else>
      <div class="adm-filters">
        <input v-model="query.keyword" type="search" placeholder="關鍵字（標題）">
        <select v-model="query.status">
          <option value="">全部狀態</option>
          <!-- ⚠️ 必須 Number(value)：STATUS_LABEL 是物件，v-for 給出的 key 一律是**字串**，
               直接綁上去 query.status 會變成 "3"，而 client.ts 是 `r.status === query.status`
               （數字），比對永遠 false —— 症狀是選了狀態就一筆都不剩，而且不會報錯。
               上面 `status: '' as '' | ContentStatus` 的型別斷言在這種情況下是假的，
               typecheck 也擋不下來。 -->
          <option v-for="(label, value) in STATUS_LABEL" :key="value" :value="Number(value)">{{ label }}</option>
        </select>
        <select v-if="def.categoryTermType" v-model="query.categoryId">
          <option value="">全部分類</option>
          <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <label v-if="def.ownershipRestricted && user?.roles.includes('Doctor') && !user?.isSuperAdmin" class="adm-checkbox">
          <input v-model="onlyMine" type="checkbox"> 只看我自己的
        </label>
        <div class="adm-filters__spacer"></div>
        <template v-if="canPublish && selected.size">
          <button type="button" class="btn btn--ghost btn--sm" @click="batchPublish(3)">批次上架（{{ selected.size }}）</button>
          <button type="button" class="btn btn--line btn--sm" @click="batchPublish(4)">批次下架（{{ selected.size }}）</button>
        </template>
      </div>

      <div v-if="loading" class="adm-loading">
        <span class="adm-spinner" aria-hidden="true"></span>
        <span>載入{{ def.label }}中…</span>
      </div>
      <div v-else-if="!items.length" class="adm-empty">
        <div class="adm-empty__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3.5 9 6 4h12l2.5 5" />
            <path d="M3.5 9v9a1.2 1.2 0 0 0 1.2 1.2h14.6a1.2 1.2 0 0 0 1.2-1.2V9" />
            <path d="M3.5 9h5.7l.8 2.2a1.2 1.2 0 0 0 1.13.8h1.74a1.2 1.2 0 0 0 1.13-.8L14.8 9h5.7" />
          </svg>
        </div>
        <p class="adm-empty__title">目前沒有{{ def.label }}</p>
        <p class="adm-empty__desc">
          <template v-if="query.keyword || query.status || query.categoryId || onlyMine">目前的篩選條件下沒有符合的項目，調整關鍵字或篩選條件再試一次。</template>
          <template v-else>還沒有任何資料，用右上角的新增功能建立第一筆。</template>
        </p>
      </div>

      <div v-else class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th class="adm-table__check"><input type="checkbox" :checked="selected.size === items.length" @change="toggleSelectAll"></th>
              <th v-for="col in def.listColumns" :key="col.key">{{ col.label }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, idx) in items" :key="item.id">
              <td><input type="checkbox" :checked="selected.has(item.id)" @change="toggleSelect(item.id)"></td>
              <td v-for="col in def.listColumns" :key="col.key" :class="{ 'is-wrap': col.key === 'title' }">
                <span v-if="col.key === 'title'" class="adm-table__title">
                  <RouterLink :to="`/${unit}/${item.id}`">{{ item.title }}</RouterLink>
                </span>
                <StatusBadge v-else-if="col.render === 'status'" :status="item.status" :publish-at="item.publishAt" />
                <span v-else-if="col.render === 'boolean'">{{ item.fields[col.key] ? '是' : '否' }}</span>
                <span v-else-if="col.render === 'date'">{{ String(item.fields[col.key] ?? (item as unknown as Record<string, string>)[col.key] ?? '').slice(0, 10) }}</span>
                <!-- relation-single 欄位（例如分類、對應療程）優先顯示 client.ts 算好的 __label -->
                <span v-else>{{ item.fields[`${col.key}__label`] ?? item.fields[col.key] ?? (item as unknown as Record<string, unknown>)[col.key] ?? '—' }}</span>
              </td>
              <td class="adm-table__actions">
                <button type="button" class="adm-table__drag" title="上移" :disabled="idx === 0" @click="move(item.id, -1)">↑</button>
                <button type="button" class="adm-table__drag" title="下移" :disabled="idx === items.length - 1" @click="move(item.id, 1)">↓</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="adm-pagination">
        <span>第 {{ query.page }} ／ {{ totalPages }} 頁</span>
        <div class="adm-pagination__controls">
          <button type="button" class="btn btn--line btn--sm" :disabled="query.page <= 1" @click="query.page--">上一頁</button>
          <button type="button" class="btn btn--line btn--sm" :disabled="query.page >= totalPages" @click="query.page++">下一頁</button>
        </div>
      </div>
    </template>
  </div>
</template>
