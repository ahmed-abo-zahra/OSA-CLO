'use client';
import {createContext,useContext,useState,useEffect,useCallback} from 'react';
export interface CartItem {productId:string;partnerId:string;nameEn:string;nameAr?:string;price:number;imageUrl?:string;size:string;color?:string;quantity:number;maxStock?:number}
interface CartContextType {items:CartItem[];isHydrated:boolean;isOpen:boolean;setIsOpen:(v:boolean)=>void;addItem:(item:CartItem)=>void;removeItem:(id:string,size:string,color?:string)=>void;updateQty:(id:string,size:string,qty:number,color?:string)=>void;clearCart:()=>void;total:number;count:number}
const Context=createContext<CartContextType|null>(null);
const KEY='aso-cart-v1';
const same=(a:CartItem,id:string,size:string,color?:string)=>a.productId===id&&a.size===size&&(a.color??'')===(color??'');
export function CartProvider({children}:{children:React.ReactNode}){
 const [items,setItems]=useState<CartItem[]>([]),[isOpen,setIsOpen]=useState(false),[isHydrated,setHydrated]=useState(false);
 useEffect(()=>{try{const raw=JSON.parse(localStorage.getItem(KEY)??'[]');if(Array.isArray(raw))setItems(raw.filter(i=>i&&typeof i.productId==='string'&&typeof i.partnerId==='string'&&typeof i.nameEn==='string'&&typeof i.size==='string'&&Number.isFinite(i.price)&&i.price>=0&&Number.isInteger(i.quantity)&&i.quantity>0).map(i=>({...i,quantity:Math.min(i.quantity,Number.isInteger(i.maxStock)&&i.maxStock>0?i.maxStock:99)})));}catch{}finally{setHydrated(true);}},[]);
 useEffect(()=>{if(isHydrated)try{localStorage.setItem(KEY,JSON.stringify(items));}catch{}},[items,isHydrated]);
 const addItem=useCallback((item:CartItem)=>{if(!Number.isFinite(item.price)||!Number.isInteger(item.quantity)||item.quantity<=0)return;setItems(prev=>{const available=(item.maxStock??99)-prev.filter(i=>i.productId===item.productId).reduce((s,i)=>s+i.quantity,0);const qty=Math.min(item.quantity,available);if(qty<=0)return prev;const existing=prev.find(i=>same(i,item.productId,item.size,item.color));return existing?prev.map(i=>i===existing?{...i,quantity:i.quantity+qty}:i):[...prev,{...item,quantity:qty}];});setIsOpen(true);},[]);
 const removeItem=useCallback((id:string,size:string,color?:string)=>setItems(prev=>prev.filter(i=>!same(i,id,size,color))),[]);
 const updateQty=useCallback((id:string,size:string,qty:number,color?:string)=>{if(!Number.isInteger(qty))return;if(qty<=0){removeItem(id,size,color);return;}setItems(prev=>prev.map(i=>{if(!same(i,id,size,color))return i;const other=prev.filter(x=>x.productId===id&&x!==i).reduce((s,x)=>s+x.quantity,0);return {...i,quantity:Math.min(qty,Math.max(1,(i.maxStock??99)-other))};}));},[removeItem]);
 const clearCart=useCallback(()=>setItems([]),[]);
 return <Context.Provider value={{items,isHydrated,isOpen,setIsOpen,addItem,removeItem,updateQty,clearCart,total:items.reduce((s,i)=>s+i.price*i.quantity,0),count:items.reduce((s,i)=>s+i.quantity,0)}}>{children}</Context.Provider>;
}
export function useCart(){const ctx=useContext(Context);if(!ctx)throw new Error('useCart requires CartProvider');return ctx;}
