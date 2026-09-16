// `/faq.json` —— FAQ 語料的結構化版本（docs/04 §3）。
export default defineEventHandler((event) => proxySeo(event, 'faq.json', 'application/json; charset=utf-8'))
