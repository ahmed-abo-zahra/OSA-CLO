import sharp from "sharp";
import fs from "node:fs/promises";
const products = JSON.parse(
  await fs.readFile("src/lib/demo-products.json", "utf8"),
);
const manifest = JSON.parse(
  await fs.readFile("src/lib/demo-image-manifest.json", "utf8"),
);
for (const p of products) {
  const [src, fragment] = p.image_url.split("#");
  const tile = Number(fragment.split("=")[1]);
  const d = manifest[src];
  const left = Math.ceil(((tile % 5) * d.width) / 5) + 1,
    top = Math.ceil((Math.floor(tile / 5) * d.height) / 2) + 1;
  const right = Math.floor((((tile % 5) + 1) * d.width) / 5) - 1,
    bottom = Math.floor(((Math.floor(tile / 5) + 1) * d.height) / 2) - 1;
  const name = `${p.category}-${String(tile + 1).padStart(2, "0")}.webp`;
  await sharp(`public${src}`)
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize({ width: 600, withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(`frontend-demo/img/${name}`);
  p.image = `img/${name}`;
  p.name = { en: p.name_en, ar: p.name_ar };
  p.description = { en: p.description, ar: p.description_ar };
  p.price = p.selling_price;
  p.stock = p.stock_quantity;
  delete p.cost_price;
  delete p.partner_id;
  delete p.image_url;
  delete p.image_urls;
  delete p.name_en;
  delete p.name_ar;
  delete p.selling_price;
  delete p.stock_quantity;
  delete p.description_ar;
}
await fs.writeFile(
  "frontend-demo/data/products.json",
  JSON.stringify(products, null, 2),
);
await sharp("public/aso-logo.png")
  .resize({ width: 240 })
  .webp({ quality: 90 })
  .toFile("frontend-demo/img/logo.webp");
await sharp("src/app/fonts/Cairo.ttf")
  .metadata()
  .catch(() => {});
await fs.copyFile("src/app/fonts/Cairo.ttf", "frontend-demo/fonts/Cairo.ttf");
await fs.copyFile(
  "src/app/fonts/Cairo-OFL.txt",
  "frontend-demo/fonts/Cairo-OFL.txt",
);
await fs.copyFile(
  "src/app/fonts/GeistVF.woff",
  "frontend-demo/fonts/GeistVF.woff",
);
console.log(
  "Optimized 120 individual photographs, with a standalone products.json.",
);
