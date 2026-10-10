"use client";
import { useLanguage } from "@/context/LanguageContext";
export default function LocalizedProductName({en,ar}:{en:string;ar?:string|null}){
 const {lang}=useLanguage();return <>{lang==='ar'?(ar||en):en}</>;
}
