// `/llms.txt` —— 核心資訊與頁面索引（docs/03 §4 ④）。
export default defineEventHandler((event) => proxySeo(event, 'llms.txt', 'text/plain; charset=utf-8'))
