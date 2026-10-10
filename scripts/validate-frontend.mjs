import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='frontend-demo/';const products=JSON.parse(fs.readFileSync(root+'data/products.json'));
assert.equal(products.length,120);assert.equal(new Set(products.map(p=>p.id)).size,120);assert.equal(new Set(products.map(p=>p.image)).size,120);
const categories=new Set(products.map(p=>p.category));assert.equal(categories.size,12);
for(const c of categories)assert.equal(products.filter(p=>p.category===c).length,10);
for(const p of products){assert(p.name.en.startsWith('ASO'));assert(p.name.ar.startsWith('ASO'));assert(p.price>0&&Number.isFinite(p.price));assert(Number.isInteger(p.stock)&&p.stock>0);assert(p.sizes.length&&p.colors.length);assert(p.description.en&&p.description.ar);assert(p.image.endsWith('.webp'));assert(fs.existsSync(root+p.image));}
for(const page of ['index','product','contact','checkout','confirmation']){const html=fs.readFileSync(root+page+'.html','utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,page);assert(html.includes('name="viewport"'));assert(html.includes('<main'));assert(html.includes('js/store.js'));}
const js=fs.readFileSync(root+'js/store.js','utf8');assert(!/https?:\/\/|supabase|\/api\//i.test(js));
console.log('PASS: frontend catalog, 120 distinct WebP assets, 12×10 categories, valid bilingual data, semantic pages and no external API integration.');
