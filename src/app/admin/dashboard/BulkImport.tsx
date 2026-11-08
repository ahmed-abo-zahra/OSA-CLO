"use client";

import { useState, useRef } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { ALL_SUBCATEGORY_KEYS } from "@/lib/categories";

interface Props {
  onSuccess: () => void;
}

const TEMPLATE_CSV = "name_en,name_ar,category,cost_price,selling_price,stock_quantity,description\n";
const MAX_CSV_BYTES = 2_000_000;
const MAX_IMPORT_ROWS = 100;
const IMPORT_CONCURRENCY = 5;

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = "aso-products-template.csv";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ParsedProduct {
  name_en: string;
  name_ar?: string;
  category?: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  description?: string;
}

function parseCSV(text: string): ParsedProduct[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const categoryAliases = new Map(ALL_SUBCATEGORY_KEYS.map((key) => [key.replace(/[^a-z0-9]/gi, "").toLowerCase(), key]));
  return rows.slice(1).map((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])) as Record<string, string>;
    const rawCategory = record.category ?? "";
    const normalizedCategory = categoryAliases.get(rawCategory.replace(/[^a-z0-9]/gi, "").toLowerCase()) ?? "";
    return {
      name_en: record.name_en ?? "",
      name_ar: record.name_ar ?? "",
      category: normalizedCategory,
      cost_price: Number(record.cost_price),
      selling_price: Number(record.selling_price),
      stock_quantity: Number(record.stock_quantity),
      description: record.description ?? "",
    };
  });
}

export default function BulkImport({ onSuccess }: Props) {
  const { t, lang } = useLanguage();
  const [preview, setPreview]   = useState<ParsedProduct[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]     = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPreview([]);
    setResult(null);
    if (file.size > MAX_CSV_BYTES) {
      setResult({ success: 0, errors: ["CSV file must be 2 MB or smaller."] });
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = typeof ev.target?.result === "string" ? ev.target.result : "";
        const products = parseCSV(text);
        if (products.length > MAX_IMPORT_ROWS) {
          setResult({ success: 0, errors: [`A single import can contain at most ${MAX_IMPORT_ROWS} products.`] });
        } else if (products.length === 0) {
          setResult({ success: 0, errors: ["No product rows found. Check the CSV header and add at least one row."] });
        } else {
          setPreview(products);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not read this CSV file.";
        setResult({ success: 0, errors: [message] });
      }
    };
    reader.onerror = () => setResult({ success: 0, errors: ["Could not read this CSV file."] });
    reader.readAsText(file, "utf-8");
  }

  async function handleUpload() {
    if (!preview.length) return;
    setUploading(true);
    const errors: string[] = [];
    let success = 0;
    try {
      for (let offset = 0; offset < preview.length; offset += IMPORT_CONCURRENCY) {
        const batch = preview.slice(offset, offset + IMPORT_CONCURRENCY);
        const results = await Promise.all(batch.map(async (product) => {
          const formData = new FormData();
          formData.append("name_en", product.name_en);
          formData.append("name_ar", product.name_ar ?? "");
          formData.append("category", product.category ?? "");
          formData.append("cost_price", String(product.cost_price));
          formData.append("selling_price", String(product.selling_price));
          formData.append("stock_quantity", String(product.stock_quantity));
          formData.append("description", product.description ?? "");
          formData.append("sizes", "");
          formData.append("colors", "");

          try {
            const response = await fetch("/api/admin/products", { method: "POST", body: formData });
            const data = await response.json().catch(() => ({})) as { error?: string };
            return response.ok ? { ok: true as const, name: product.name_en } : {
              ok: false as const,
              name: product.name_en,
              error: data.error ?? `Request failed (${response.status}).`,
            };
          } catch {
            return { ok: false as const, name: product.name_en, error: "Network request failed." };
          }
        }));

        for (const result of results) {
          if (result.ok) success += 1;
          else errors.push(`"${result.name || "(unnamed product)"}": ${result.error}`);
        }
      }
    } catch {
      errors.push("Import was interrupted. Some earlier rows may already have been created.");
    } finally {
      setResult({ success, errors });
      setPreview([]);
      if (fileRef.current) fileRef.current.value = "";
      if (success > 0) onSuccess();
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{t("admin.bulk.title")}</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.bulk.subtitle")}</p>
      </div>

      {/* Step 1: Download template */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-brand-border/10 p-4 sm:p-6">
        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-600 dark:text-gray-400 mb-3">{t("admin.bulk.step1")}</p>
        <button onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-400 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {t("admin.bulk.downloadBtn")}
        </button>
        <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-2">{t("admin.bulk.step1desc")}</p>
        <p className="mt-2 break-words text-[10px] text-gray-600 dark:text-gray-400">
          {lang === "ar" ? "الحقول: name_en, name_ar, category, cost_price, selling_price, stock_quantity, description. الحد الأقصى 100 منتج. الفئات: " : "Columns: name_en, name_ar, category, cost_price, selling_price, stock_quantity, description. Maximum 100 products. Categories: "}
          {ALL_SUBCATEGORY_KEYS.join(", ")}
        </p>
      </div>

      {/* Step 2: Upload */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-brand-border/10 p-4 sm:p-6">
        <p className="text-[10px] font-bold tracking-widest uppercase text-gray-600 dark:text-gray-400 mb-3">{t("admin.bulk.step2")}</p>
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-600 p-8 cursor-pointer hover:border-gray-400 dark:hover:border-gray-400 transition-all">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-300 dark:text-gray-500 mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.bulk.clickToSelect")}</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
        </label>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-brand-border/10 overflow-x-auto">
          <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
            <p className="text-xs font-bold text-gray-900 dark:text-gray-100">{preview.length} {t("admin.bulk.readyToImport")}</p>
            <button onClick={handleUpload} disabled={uploading}
              className="btn-dark text-[11px] disabled:opacity-50 flex items-center gap-2">
              {uploading ? (
                <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />{t("admin.bulk.importing")}</>
              ) : `${t("admin.bulk.importBtn")} ${preview.length}`}
            </button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="th-style">{t("checkout_name")}</th>
                <th className="th-style">{t("admin.bulk.tableCategory")}</th>
                <th className="th-style">{t("admin.dashboard.manage.table.cost")}</th>
                <th className="th-style">{t("admin.dashboard.manage.table.selling")}</th>
                <th className="th-style">{t("admin.dashboard.manage.table.stock")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="px-4 py-2.5 font-semibold text-gray-900 dark:text-gray-100">{p.name_en}</td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{p.category || "—"}</td>
                  <td className="px-4 py-2.5 font-mono">EGP {p.cost_price}</td>
                  <td className="px-4 py-2.5 font-mono font-bold">EGP {p.selling_price}</td>
                  <td className="px-4 py-2.5 font-mono">{p.stock_quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`p-4 border ${result.errors.length === 0 ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}`}>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            ✓ {result.success} {t("admin.bulk.successMsg")}
          </p>
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-bold text-red-600 mb-1">{result.errors.length} {t("admin.bulk.errorsMsg")}</p>
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-500">{e}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
