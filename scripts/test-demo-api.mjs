import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.DEMO_TEST_URL||'http://localhost:3000';
assert(new URL(base).hostname==='localhost','Only isolated localhost demo may be tested');
const products=JSON.parse(fs.readFileSync('src/lib/demo-products.json'));
const fixtures=JSON.parse(fs.readFileSync('src/lib/demo-orders.json'));
const file='.demo/database.json';fs.mkdirSync('.demo',{recursive:true});
const backup=fs.existsSync(file)?fs.readFileSync(file):null;
const reset=()=>fs.writeFileSync(file,JSON.stringify({products,orders:fixtures.orders,order_items:fixtures.order_items,discount_codes:[],store_settings:[],reviews:[]}));
async function call(path,body,cookie,method='POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
let checks=0;const status=(r,s)=>{assert.equal(r.status,s,JSON.stringify(r.data));checks++;};
try{
 reset();
 const own=products.find(p=>p.partner_id==='596c4367-1491-481f-b0f2-1825c2540ebd');
 const other=products.find(p=>p.partner_id!==own.partner_id);
 status(await call('/api/admin/products/'+own.id,{field:'in_stock',value:true},null,'PATCH'),401);
 status(await call('/api/admin/products/'+own.id,{field:'in_stock',value:true},'aso_admin_session='+Buffer.from(JSON.stringify({partnerId:'safia',partnerName:'Safia'})).toString('base64'),'PATCH'),401);
 const login=await call('/api/admin/login',{name:'Safia',password:'aso-demo-2026'});status(login,200);assert(login.cookie);
 status(await call('/api/admin/products/'+other.id,{field:'in_stock',value:false},login.cookie,'PATCH'),403);
 status(await call('/api/admin/products/'+other.id,null,login.cookie,'DELETE'),403);
 status(await call('/api/admin/products/'+own.id,{field:'in_stock',value:'false'},login.cookie,'PATCH'),400);
 status(await call('/api/admin/products/'+own.id,{field:'is_available',value:false},login.cookie,'PATCH'),200);
 status(await call('/api/admin/products/'+own.id,{field:'is_available',value:true},login.cookie,'PATCH'),200);
 const form=new FormData();for(const [key,value]of Object.entries({name_en:'ASO test upload',name_ar:'ASO اختبار صورة',description:'Test fixture',category:'tshirts',cost_price:'100',selling_price:'200',sizes:'M,L',colors:'Black',stock_quantity:'3'}))form.set(key,value);
 form.set('image',new Blob([fs.readFileSync('public/aso-logo.png')],{type:'image/png'}),'test.png');
 const createdResponse=await fetch(base+'/api/admin/products',{method:'POST',headers:{Cookie:login.cookie},body:form});const created={status:createdResponse.status,data:await createdResponse.json()};status(created,201);
 const createdProduct=created.data.product;assert(createdProduct.image_url.startsWith('/demo/uploads/'));checks++;
 status(await call('/api/admin/products/'+createdProduct.id,null,login.cookie,'DELETE'),200);
 fs.unlinkSync('public'+createdProduct.image_url);
 const order={customer_name:'عميل اختبار',customer_phone:'01000000000',shipping_address:'عنوان تجريبي القاهرة',items:[{productId:own.id,size:own.sizes[0],color:own.colors[0],quantity:1,price:1}],discount_amount:9999};
 status(await call('/api/checkout',{...order,items:[{...order.items[0],size:'invalid'}]}),400);
 status(await call('/api/checkout',{...order,items:[{...order.items[0],color:'invalid'}]}),400);
 status(await call('/api/checkout',{...order,items:[{...order.items[0],quantity:own.stock_quantity},{...order.items[0],quantity:1}]}),400);
 const placed=await call('/api/checkout',order);status(placed,201);
 const tracked=await call('/api/track/'+placed.data.orderIds[0],null,null,'GET');status(tracked,200);assert.equal(tracked.data.total,own.selling_price);assert.equal(tracked.data.paid,0);assert(!('customer_phone'in tracked.data));checks+=3;
 const after=JSON.parse(fs.readFileSync(file));assert.equal(after.products.find(p=>p.id===own.id).stock_quantity,own.stock_quantity-1);checks++;
 status(await call('/api/track/invalid',null,null,'GET'),400);
 console.log(`PASS: ${checks} demo API checks (session forgery, ownership, variants, stock, server totals, tracking).`);
}finally{if(backup)fs.writeFileSync(file,backup);else fs.unlinkSync(file);}
