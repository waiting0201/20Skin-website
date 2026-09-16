// `/llms-full.txt` —— FAQ 全文語料。
// 🔴 語料來源是 Faqs.AiAnswer，不是 WebAnswer（docs/04 §2）—— 後者是給人看的版本。
export default defineEventHandler((event) => proxySeo(event, 'llms-full.txt', 'text/plain; charset=utf-8'))
