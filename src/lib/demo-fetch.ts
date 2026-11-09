import 'server-only';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getPartnerCategoryKeys } from '@/lib/partners';
import { createCheckoutRequestHash } from '@/lib/checkout-idempotency';
import products from './demo-products.json';
import demoOrders from './demo-orders.json';

type Row = Record<string, unknown>;
type Database = Record<string, Row[]>;
const dir = join(process.cwd(), '.demo');
const file = join(dir, 'database.json');
function read(): Database {
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  return { products: structuredClone(products), orders: structuredClone(demoOrders.orders), order_items: structuredClone(demoOrders.order_items), discount_codes: [], store_settings: [], reviews: [], checkout_idempotency: [] };
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

export function placeDemoOrder(body:Record<string,unknown>, idempotency?: { key: string }){
 const name=String(body.customer_name??'').trim(),phone=String(body.customer_phone??'').trim(),address=String(body.customer_address??body.shipping_address??'').trim();
 const normalizedPhone=phone.replace(/[\s\-()]/g,'');
 const paymentType=body.payment_type;
 const notes=typeof body.notes==='string'?body.notes.trim():'';
 const discountCode=typeof body.discount_code==='string'?body.discount_code.trim().toUpperCase():'';
 if(name.length<2||name.length>120||!/^01[0125]\d{8}$/.test(normalizedPhone)||address.length<5||address.length>500)throw new Error('Enter valid customer details.');
 if(paymentType!=='full'&&paymentType!=='deposit')throw new Error('Invalid payment type.');
 if(notes.length>500||discountCode.length>50)throw new Error('Invalid order details.');
 const items=body.items as {productId?:string;product_id?:string;size?:string|null;color?:string|null;quantity:number}[];
 if(!Array.isArray(items)||!items.length||items.length>100)throw new Error('Cart must contain between 1 and 100 items.');
 const variantKeys=new Set<string>();
 for(const value of items){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('One or more cart items are invalid.');
  const item=value as {productId?:unknown;product_id?:unknown;size?:unknown;color?:unknown;quantity?:unknown};
  const productId=item.productId??item.product_id;
  if(typeof productId!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.test(productId)||!Number.isInteger(item.quantity)||Number(item.quantity)<1||Number(item.quantity)>50)throw new Error('One or more cart items are invalid.');
  if(item.size!==undefined&&item.size!==null&&(typeof item.size!=='string'||item.size.length>40))throw new Error('One or more cart items are invalid.');
  if(item.color!==undefined&&item.color!==null&&(typeof item.color!=='string'||item.color.length>80))throw new Error('One or more cart items are invalid.');
  const variantKey=`${productId}\0${typeof item.size==='string'?item.size.trim():''}\0${typeof item.color==='string'?item.color.trim():''}`;
  if(variantKeys.has(variantKey))throw new Error('Combine duplicate product variants into one cart line.');
  variantKeys.add(variantKey);
 }
 const canonicalItems=items.map(value=>{const item=value as {productId?:unknown;product_id?:unknown;size?:unknown;color?:unknown;quantity?:unknown};return {product_id:String(item.productId??item.product_id).toLowerCase(),quantity:Number(item.quantity),size:typeof item.size==='string'?item.size.trim()||null:null,color:typeof item.color==='string'?item.color.trim()||null:null};});
 const requestHash=idempotency?createCheckoutRequestHash({customerName:name,customerPhone:normalizedPhone,customerAddress:address,notes:notes||null,paymentType,discountCode:discountCode||null,items:canonicalItems}):null;
 const db=read();db.checkout_idempotency??=[];
 const previous=idempotency?db.checkout_idempotency.find(row=>row.idempotency_key===idempotency.key):undefined;
 if(previous){if(previous.request_hash!==requestHash)throw new Error('IDEMPOTENCY_KEY_REUSED');return previous.response as {success:true;orderIds:string[];createdAt:string;demo:true};}
 const quantities=new Map<string,number>();
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
 const response={success:true as const,orderIds,createdAt,demo:true as const};
 if(idempotency)db.checkout_idempotency.push({idempotency_key:idempotency.key,request_hash:requestHash!,response});
 save(db);return response;
}


type DemoOrderUpdateInput = {
  order_id: string;
  partner_id: string;
  partner_name: string;
  status?: string | null;
  paid_amount?: number | null;
  change_reason?: string | null;
};

export function updateDemoOrder(input: DemoOrderUpdateInput) {
  const db = read();
  const order = db.orders.find((row) => row.id === input.order_id && row.partner_id === input.partner_id);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const nextStatus = input.status ?? null;
  const nextPaid = input.paid_amount ?? null;
  if (nextPaid !== null && nextPaid > Number(order.total_amount)) throw new Error('PAID_AMOUNT_EXCEEDS_TOTAL');

  const statusChanged = nextStatus !== null && nextStatus !== order.status;
  const paymentChanged = nextPaid !== null && nextPaid !== Number(order.paid_amount ?? 0);
  if (statusChanged && !(
    (order.status === 'pending' && ['processing', 'cancelled'].includes(nextStatus!)) ||
    (order.status === 'processing' && ['shipped', 'cancelled'].includes(nextStatus!)) ||
    (order.status === 'shipped' && nextStatus === 'closed')
  )) throw new Error('INVALID_STATUS_TRANSITION');
  const reason = input.change_reason?.trim() ?? '';
  if (paymentChanged && nextPaid! < Number(order.paid_amount ?? 0) && reason.length < 5) {
    throw new Error('PAYMENT_DECREASE_REQUIRES_REASON');
  }
  if (statusChanged && nextStatus === 'cancelled' && Number(order.paid_amount ?? 0) > 0) {
    throw new Error('PAYMENT_REFUND_REQUIRED');
  }

  const now = new Date().toISOString();
  let activity: Row[] = [];
  try {
    const parsed = Array.isArray(order.activity_log)
      ? order.activity_log
      : typeof order.activity_log === 'string' ? JSON.parse(order.activity_log) : [];
    if (Array.isArray(parsed)) activity = parsed;
  } catch { activity = []; }

  if (statusChanged && nextStatus === 'cancelled') {
    const quantities = new Map<string, number>();
    for (const item of db.order_items.filter((row) => row.order_id === input.order_id)) {
      const productId = String(item.product_id ?? '');
      if (productId) quantities.set(productId, (quantities.get(productId) ?? 0) + Number(item.quantity ?? 0));
    }
    for (const [productId, quantity] of quantities) {
      const product = db.products.find((row) => row.id === productId);
      if (product) {
        product.stock_quantity = Number(product.stock_quantity ?? 0) + quantity;
        product.in_stock = Boolean(product.is_available) && Number(product.stock_quantity) > 0;
      }
    }
  }
  if (statusChanged) activity.push({ type: 'status_change', status: nextStatus!, previous_status: order.status, by: input.partner_name, at: now });
  if (paymentChanged) activity.push({
    type: 'payment_adjustment', status: 'payment_adjusted',
    previous_paid_amount: Number(order.paid_amount ?? 0), paid_amount: nextPaid!,
    reason: reason || 'Payment recorded by partner', by: input.partner_name, at: now,
  });

  if (nextStatus !== null) order.status = nextStatus;
  if (nextPaid !== null) order.paid_amount = nextPaid;
  order.activity_log = activity.slice(-100);
  order.updated_at = now;
  save(db);
  return {
    id: String(order.id),
    status: String(order.status),
    paid_amount: Number(order.paid_amount ?? 0),
    total_amount: Number(order.total_amount ?? 0),
    activity_log: order.activity_log,
    updated_at: String(order.updated_at),
  };
}

type DemoManualOrderInput = {
  partner_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  source: string;
  notes: string | null;
  paid_amount: number;
  items: { product_id: string; size: string | null; quantity: number }[];
};

export function placeDemoManualOrder(input: DemoManualOrderInput) {
  const db = read();
  const quantities = new Map<string, number>();
  const selected = input.items.map((item) => {
    const product = db.products.find((row) => row.id === item.product_id);
    if (!product || !product.is_available || !product.in_stock) {
      throw new Error('PRODUCT_UNAVAILABLE');
    }
    if (product.partner_id !== input.partner_id) throw new Error('PRODUCT_NOT_OWNED');
    if (!getPartnerCategoryKeys(input.partner_id).includes(String(product.category))) throw new Error('CATEGORY_NOT_ASSIGNED_TO_PARTNER');
    const requested = (quantities.get(item.product_id) ?? 0) + item.quantity;
    quantities.set(item.product_id, requested);
    if (requested > Number(product.stock_quantity)) throw new Error('PRODUCT_UNAVAILABLE');
    const sizes = Array.isArray(product.sizes) ? product.sizes.map(String) : [];
    if (sizes.length > 0 && (!item.size || !sizes.includes(item.size))) throw new Error('PRODUCT_OPTION_INVALID');
    return { product, item };
  });

  const total = selected.reduce((sum, entry) => sum + Number(entry.product.selling_price) * entry.item.quantity, 0);
  const paid = Math.min(Math.max(input.paid_amount, 0), total);
  const id = randomUUID();
  const now = new Date().toISOString();
  const order = {
    id,
    partner_id: input.partner_id,
    customer_name: input.customer_name,
    customer_phone: input.customer_phone,
    customer_address: input.customer_address,
    source: input.source,
    status: 'pending',
    notes: input.notes,
    total_amount: total,
    paid_amount: paid,
    discount_amount: 0,
    requested_payment_type: 'full',
    requested_deposit_amount: total,
    activity_log: [{ status: 'pending', by: 'Demo partner', at: now }],
    created_at: now,
    updated_at: now,
  };

  db.orders.push(order);
  for (const { product, item } of selected) {
    db.order_items.push({
      id: randomUUID(),
      order_id: id,
      product_id: product.id,
      product_name_en: product.name_en,
      product_name_ar: product.name_ar ?? null,
      image_url: product.image_url ?? null,
      quantity: item.quantity,
      size: item.size,
      color: null,
      unit_price: product.selling_price,
      cost_price: product.cost_price ?? 0,
    });
  }
  for (const [productId, quantity] of quantities) {
    const product = db.products.find((row) => row.id === productId)!;
    product.stock_quantity = Number(product.stock_quantity) - quantity;
    product.in_stock = Number(product.stock_quantity) > 0;
  }

  save(db);
  return order;
}
