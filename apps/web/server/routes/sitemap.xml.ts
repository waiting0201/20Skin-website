// `/sitemap.xml` —— 索引檔，指向各分檔。
export default defineEventHandler((event) => proxySeo(event, 'sitemap.xml', 'application/xml; charset=utf-8'))
