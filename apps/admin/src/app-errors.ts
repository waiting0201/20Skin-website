// 最後一道網：沒有被任何畫面接住的錯誤。
//
// 🔴 **這不是「錯誤處理」，是安全網。** 每一個動作都應該在自己的 try/catch 裡
//    給出指得到欄位、講得出後果的訊息（這是 2026-09-17 那一輪把五十幾支
//    async 函式補起來的原因）。這裡只負責**讓漏掉的那一個不再無聲無息** ——
//    在此之前，一個沒接住的 rejection 就只是 console 裡的一行紅字：
//    使用者看到的是「按了沒反應」，然後再按一次。
//
// ⚠️ 顯示的是原始訊息，可能很技術。這是刻意的：它本來就是漏網之魚，
//    講得含糊反而查不出是哪裡出的問題。
//
// ⚠️ 不要把它變成通用的「顯示錯誤」入口去給畫面呼叫 —— 那會讓人懶得在
//    動作裡寫 catch，錯誤訊息就全部退化成這一句沒有上下文的浮動提示。

import { reactive, readonly, type App } from 'vue'
import { ApiError } from './api/errors'

interface UnhandledError {
  id: number
  message: string
  at: number
}

const state = reactive<{ errors: UnhandledError[] }>({ errors: [] })
export const unhandledErrors = readonly(state)

let nextId = 1

function describe(reason: unknown): string {
  if (reason instanceof ApiError) {
    return reason.details.length ? `${reason.message}（${reason.details.join('、')}）` : reason.message
  }
  if (reason instanceof Error) return reason.message
  return String(reason)
}

function report(reason: unknown) {
  const message = describe(reason)
  // 同一個錯誤連按三次不要疊三張卡片。
  if (state.errors.some((e) => e.message === message)) return
  state.errors.push({ id: nextId++, message, at: Date.now() })
}

export function dismissError(id: number) {
  const index = state.errors.findIndex((e) => e.id === id)
  if (index !== -1) state.errors.splice(index, 1)
}

export function installErrorNet(app: App) {
  // Vue 元件內（生命週期、事件處理器、watcher）拋出的錯誤。
  app.config.errorHandler = (err, _instance, info) => {
    console.error('[未處理的元件錯誤]', info, err)
    report(err)
  }
  // `@click="doSomething"` 這種沒有 await 的非同步處理器，錯誤只會走到這裡。
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[未處理的 promise rejection]', event.reason)
    report(event.reason)
  })
}
