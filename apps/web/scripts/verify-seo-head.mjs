// `usePageHead` 兩支純函式的行為驗證。**不需要 Nuxt 執行環境**，所以進得了 CI 的快速閘。
//
// 🔴 `serializeJsonLd` 守的是一條 stored XSS：`JSON.stringify` **不會跳脫 `<`**，
//    所以字串裡只要有 `</script>` 就會提前結束標籤，後面的內容變成可執行的 HTML。
//    在「結構化資料覆寫」接上資料庫之後（2026-09-17），那個字串就是院方可以編輯的。
//
// ⚠️ `parseOverride` 守的是另一件事：覆寫值壞掉時**退回自動產生的結構化資料**，
//    不讓一頁的 JSON-LD 把整頁一起拖成 500。
//
// 用法：node scripts/verify-seo-head.mjs（在 apps/web 底下）

const src = (await import('node:fs')).readFileSync(
  'app/composables/usePageHead.ts', 'utf8')

// 把兩支函式抽出來 eval —— 它們沒有外部相依。
const pick = (name) => {
  const i = src.indexOf(`export function ${name}`)
  let depth = 0, started = false
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1).replace('export ', '') }
  }
}
const code = [pick('serializeJsonLd'), pick('parseOverride')]
  .join('\n')
  .replace(/: Record<string, unknown>\[\] \| null/g, '')
  .replace(/: Record<string, unknown>/g, '')
  .replace(/: string \| null \| undefined/g, '')
  .replace(/: string/g, '')
const { serializeJsonLd, parseOverride } = new Function(`${code}; return { serializeJsonLd, parseOverride }`)()

let fail = 0
const ok = (name, cond, got) => { console.log(`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : `  got=${got}`}`); if (!cond) fail++ }

console.log('── serializeJsonLd：</script> 必須跳脫 ──')
const hostile = serializeJsonLd({ name: '</script><img onerror=alert(1)>' })
ok('輸出裡沒有生的 <', !hostile.includes('<'), hostile)
ok('跳脫後 parse 回來一模一樣',
   JSON.parse(hostile).name === '</script><img onerror=alert(1)>')

console.log('\n── parseOverride ──')
ok('空值 → null', parseOverride('') === null && parseOverride(null) === null)
ok('單一物件 → 包成陣列', parseOverride('{"@type":"Thing"}')?.length === 1)
ok('陣列 → 原樣', parseOverride('[{"a":1},{"b":2}]')?.length === 2)
ok('壞掉的 JSON → null（退回自動產生，不讓整頁掛掉）', parseOverride('{"a":') === null)
ok('純量 → null', parseOverride('"just a string"') === null)
ok('陣列裡有純量 → null', parseOverride('[{"a":1},"bad"]') === null)

console.log(fail ? `\n✗ ${fail} 項失敗` : '\n✓ 全數通過')
process.exit(fail ? 1 : 0)
