import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { getPartnerById } from './partners';
import { DEMO_MODE } from './demo-mode';
export const COOKIE_NAME='aso_admin_session';
export const COOKIE_MAX_AGE=60*60*24*7;
export interface SessionPayload {partnerId:string;partnerName:string}
const scope=globalThis as typeof globalThis & {asoDemoSecret?:string};
if(DEMO_MODE) scope.asoDemoSecret ??= randomBytes(32).toString('hex');
function secret(){const key=process.env.ADMIN_SESSION_SECRET ?? (DEMO_MODE?scope.asoDemoSecret:undefined);if(!key)throw new Error('ADMIN_SESSION_SECRET is required');return key;}
function sign(value:string){return createHmac('sha256',secret()).update(value).digest('base64url');}
export function encodeSession(payload:SessionPayload){const value=Buffer.from(JSON.stringify({...payload,expiresAt:Date.now()+COOKIE_MAX_AGE*1000})).toString('base64url');return `${value}.${sign(value)}`;}
export function decodeSessionValue(value:string|undefined):SessionPayload|null{
 if(!value)return null;
 try{const [body,signature,...extra]=value.split('.');if(extra.length||!body||!signature)return null;const expected=Buffer.from(sign(body));const actual=Buffer.from(signature);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));const partner=getPartnerById(payload.partnerId);
 if(!partner||partner.name!==payload.partnerName||!Number.isFinite(payload.expiresAt)||payload.expiresAt<Date.now())return null;
 return {partnerId:partner.id,partnerName:partner.name};}catch{return null;}
}
export function getSession(){return decodeSessionValue(cookies().get(COOKIE_NAME)?.value);}
