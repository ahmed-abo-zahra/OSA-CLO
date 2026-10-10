import 'server-only';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import products from './demo-products.json';
import demoOrders from './demo-orders.json';

type Row = Record<string, unknown>;
type Database = Record<string, Row[]>;
const dir = join(process.cwd(), '.demo');
const file = join(dir, 'database.json');
function read(): Database {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  return { products: structuredClone(products), orders: structuredClone(demoOrders.orders), order_items: structuredClone(demoOrders.order_items), discount_codes: [], store_settings: [], reviews: [] };
}
function save(db: Database) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(db)); }
function match(row: Row, query: URLSearchParams): boolean {
  return Array.from(query.entries()).every(([key, filter]) => {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) return true;
    const [operator, ...rest] = filter.split('.'); const value = rest.join('.');
    if (operator === 'eq') return String(row[key]) === value;
    if (operator === 'neq') return String(row[key]) !== value;
    if (operator === 'in') return value.slice(1, -1).split(',').map(x => x.replaceAll('"', '')).includes(String(row[key]));
    return false;
  });
}
// Local PostgREST transport for the isolated presentation. Never contacts Supabase.
export const demoFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const method = init?.method ?? 'GET';
  const headers = new Headers(init?.headers);
  const db = read();
  if (!url.pathname.startsWith('/rest/v1/')) return new Response(JSON.stringify({message:'Unsupported demo operation'}), {status:400});
  const table = url.pathname.split('/').pop()!;
  if (url.pathname.includes('/rpc/')) return new Response(JSON.stringify({message:'Live stock RPC disabled in demo'}), {status:400});
  db[table] ??= [];
  let result = db[table].filter(row => match(row, url.searchParams));
  if (method === 'POST') {
    const raw = JSON.parse(String(init?.body ?? '{}')); const incoming = Array.isArray(raw) ? raw : [raw];
    result = incoming.map(row => ({id:randomUUID(),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),...row}));
    if (headers.get('prefer')?.includes('resolution=merge-duplicates')) {
      const key = url.searchParams.get('on_conflict') ?? 'id';
      for (const row of result) { const old = db[table].find(x=>x[key]===row[key]); if (old) Object.assign(old,row); else db[table].push(row); }
    } else db[table].push(...result);
    save(db);
  } else if (method === 'PATCH') {
    const patch = JSON.parse(String(init?.body ?? '{}')); result.forEach(row=>Object.assign(row,patch,{updated_at:new Date().toISOString()})); save(db);
  } else if (method === 'DELETE') {
    db[table] = db[table].filter(row=>!result.includes(row)); save(db);
  }
  const order = url.searchParams.get('order');
  if (order) { const [key,direction] = order.split('.'); result.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(direction==='desc'?-1:1)); }
  const limit = Number(url.searchParams.get('limit') ?? result.length); result = result.slice(0,limit);
  const select = url.searchParams.get('select') ?? '*';
  result = result.map(row => {
    const copy = {...row};
    if (select.includes('order_items')) copy.order_items = db.order_items.filter(item=>item.order_id===row.id).map(item=>({...item,products:db.products.find(p=>p.id===item.product_id)}));
    if (select.includes('products(')) copy.products = db.products.find(p=>p.id===row.product_id);
    if (select === '*' || select.includes('(')) return copy;
    return Object.fromEntries(select.split(',').map(key=>[key,copy[key]]));
  });
  const single = headers.get('accept')?.includes('vnd.pgrst.object');
  if (single && result.length!==1) return new Response(JSON.stringify({code:'PGRST116',message:'Not found'}),{status:406});
  return new Response(JSON.stringify(single ? result[0] : result),{status:method==='POST'?201:200,headers:{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,result.length-1)}/${result.length}`}});
};

export function placeDemoOrder(body:Record<string,unknown>){
 const name=String(body.customer_name??'').trim(),phone=String(body.customer_phone??'').trim(),address=String(body.shipping_address??body.customer_address??'').trim();
 if(!name||!/^01[0125]\d{8}$/.test(phone)||!address)throw new Error('Customer name, valid Egyptian phone and address are required.');
 const items=body.items as {productId?:string;product_id?:string;size?:string;color?:string;quantity:number}[];
 if(!Array.isArray(items)||!items.length)throw new Error('Cart is empty.');
 const db=read();const quantities=new Map<string,number>();
 const normalized=items.map(item=>{const product=db.products.find(p=>p.id===(item.productId??item.product_id));if(!product||!product.is_available||!product.in_stock)throw new Error('Product is unavailable.');if(!Number.isInteger(item.quantity)||item.quantity<1)throw new Error('Invalid quantity.');
 if((product.sizes as string[])?.length&&!(product.sizes as string[]).includes(item.size??''))throw new Error('Select an available size.');
 if((product.colors as string[])?.length&&!(product.colors as string[]).includes(item.color??''))throw new Error('Select an available color.');
 const count=(quantities.get(String(product.id))??0)+item.quantity;quantities.set(String(product.id),count);if(count>Number(product.stock_quantity))throw new Error('Quantity exceeds available stock.');return {product,item};});
 const orderIds:string[]=[];const createdAt=new Date().toISOString();
 const partnerIds=Array.from(new Set(normalized.map(n=>n.product.partner_id)));
 for(const partnerId of partnerIds){const group=normalized.filter(n=>n.product.partner_id===partnerId);const id=randomUUID();orderIds.push(id);const total=group.reduce((s,n)=>s+Number(n.product.selling_price)*n.item.quantity,0);
 db.orders.push({id,partner_id:partnerId,customer_name:name,customer_phone:phone,customer_address:address,shipping_address:address,source:'online_store',order_source:'online_store',status:'pending',payment_status:'pending',total_amount:total,paid_amount:0,deposit_amount:0,created_at:createdAt,updated_at:createdAt,notes:'Demo order — no payment collected',activity_log:JSON.stringify([{status:'pending',by:'Demo checkout',at:createdAt}])});
 for(const {product,item} of group)db.order_items.push({id:randomUUID(),order_id:id,product_id:product.id,partner_id:partnerId,quantity:item.quantity,size:item.size,color:item.color,unit_price:product.selling_price,cost_price:product.cost_price,selling_price_at_time:product.selling_price,cost_price_at_time:product.cost_price});}
 for(const [id,count]of Array.from(quantities)){const product=db.products.find(p=>p.id===id)!;product.stock_quantity=Number(product.stock_quantity)-count;product.in_stock=Number(product.stock_quantity)>0;}
 save(db);return {success:true,orderIds,createdAt,demo:true};
}
