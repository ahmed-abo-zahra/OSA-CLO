import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const products=JSON.parse(readFileSync('src/lib/demo-products.json'));
const categories=['abayas','isdals','dresses','tshirts','pants','sneakers','heels','slippers','girls_bags','accessories','makeup','home_appliances'];
assert.equal(products.length,120);
assert.equal(new Set(products.map(p=>p.id)).size,120);
for(const category of categories){const items=products.filter(p=>p.category===category);assert.equal(items.length,10,category);assert.equal(new Set(items.map(p=>p.image_url)).size,10,`${category}: unique photograph indices`);for(const p of items){assert(p.name_en.startsWith('ASO '));assert(p.name_ar.startsWith('ASO'));assert(p.selling_price>0&&Number.isFinite(p.selling_price));assert(Number.isInteger(p.stock_quantity)&&p.stock_quantity>0);assert(p.sizes.length>0&&p.colors.length>0);assert(existsSync(`public${p.image_url.split('#')[0]}`));assert.equal(p.is_available,true);}}
console.log('PASS: 120 ASO products, exactly 10 per category; unique image references, bilingual names, valid prices, sizes, colors and stock.');
