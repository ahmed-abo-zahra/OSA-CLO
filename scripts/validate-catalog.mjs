import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const products=JSON.parse(readFileSync('src/lib/demo-products.json'));
const categories=['abayas','isdals','dresses','tshirts','pants','sneakers','heels','slippers','girls_bags','accessories','makeup','home_appliances'];
const ownerByCategory={abayas:'596c4367-1491-481f-b0f2-1825c2540ebd',isdals:'596c4367-1491-481f-b0f2-1825c2540ebd',dresses:'596c4367-1491-481f-b0f2-1825c2540ebd',tshirts:'596c4367-1491-481f-b0f2-1825c2540ebd',pants:'596c4367-1491-481f-b0f2-1825c2540ebd',sneakers:'2a304931-2230-4960-9e44-b19ed5e0178b',heels:'2a304931-2230-4960-9e44-b19ed5e0178b',slippers:'2a304931-2230-4960-9e44-b19ed5e0178b',girls_bags:'652f4263-d4e3-4bf6-a5c4-778e8a08c710',accessories:'652f4263-d4e3-4bf6-a5c4-778e8a08c710',makeup:'652f4263-d4e3-4bf6-a5c4-778e8a08c710',home_appliances:'652f4263-d4e3-4bf6-a5c4-778e8a08c710'};
assert.equal(products.length,120);
assert.equal(new Set(products.map(p=>p.id)).size,120);
for(const category of categories){const items=products.filter(p=>p.category===category);assert.equal(items.length,10,category);assert.equal(new Set(items.map(p=>p.image_url)).size,10,`${category}: unique photograph indices`);for(const p of items){assert.equal(p.partner_id,ownerByCategory[category],`${category}: incorrect partner assignment`);assert(p.name_en.startsWith('ASO '));assert(p.name_ar.startsWith('ASO'));assert(p.selling_price>0&&Number.isFinite(p.selling_price));assert(Number.isInteger(p.stock_quantity)&&p.stock_quantity>0);assert(p.sizes.length>0&&p.colors.length>0);assert(existsSync(`public${p.image_url.split('#')[0]}`));assert.equal(p.is_available,true);}}
const productsPerPartner=Object.values(ownerByCategory).reduce((counts,partnerId)=>({...counts,[partnerId]:products.filter(p=>p.partner_id===partnerId).length}),{});
assert.deepEqual(Object.values(productsPerPartner).sort((a,b)=>a-b),[30,40,50]);
console.log('PASS: 120 ASO products; each category is assigned to its designated partner; partner totals are 50/30/40 with valid distinct assets and stock.');
