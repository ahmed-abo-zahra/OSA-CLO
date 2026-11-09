export interface ParsedProduct {
  name_en: string;
  name_ar?: string;
  category: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  description?: string;
}

export function parseProductCsv(text: string, categoryKeys: readonly string[]): ParsedProduct[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }
  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('CSV headers must be unique.');
  const requiredHeaders = ['name_en', 'category', 'cost_price', 'selling_price', 'stock_quantity'];
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) throw new Error(`CSV is missing required columns: ${missingHeaders.join(', ')}.`);
  const categoryAliases = new Map(categoryKeys.map((key) => [key.replace(/[^a-z0-9]/gi, '').toLowerCase(), key]));

  return rows.slice(1).map((values, index) => {
    const rowNumber = index + 2;
    if (values.length > headers.length && values.slice(headers.length).some(Boolean)) {
      throw new Error(`Row ${rowNumber}: there are more values than CSV headers.`);
    }
    const record = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? ''])) as Record<string, string>;
    const rawCategory = record.category ?? '';
    const normalizedCategory = categoryAliases.get(rawCategory.replace(/[^a-z0-9]/gi, '').toLowerCase()) ?? '';
    if (!normalizedCategory) throw new Error(`Row ${rowNumber}: category must be one of ${categoryKeys.join(', ')}.`);

    const nameEn = record.name_en ?? '';
    const nameAr = record.name_ar ?? '';
    const description = record.description ?? '';
    const costPrice = Number(record.cost_price);
    const sellingPrice = Number(record.selling_price);
    const stockQuantity = Number(record.stock_quantity);
    if (nameEn.trim().length < 1 || nameEn.length > 160 || nameAr.length > 160) throw new Error(`Row ${rowNumber}: product names must be within 160 characters.`);
    if (description.length > 2000) throw new Error(`Row ${rowNumber}: description exceeds 2,000 characters.`);
    if (!Number.isFinite(costPrice) || costPrice < 0 || !Number.isFinite(sellingPrice) || sellingPrice <= 0) throw new Error(`Row ${rowNumber}: enter valid cost and selling prices.`);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || stockQuantity > 100000) throw new Error(`Row ${rowNumber}: stock quantity must be a whole number from 0 to 100,000.`);

    return {
      name_en: nameEn,
      name_ar: nameAr,
      category: normalizedCategory,
      cost_price: costPrice,
      selling_price: sellingPrice,
      stock_quantity: stockQuantity,
      description,
    };
  });
}
