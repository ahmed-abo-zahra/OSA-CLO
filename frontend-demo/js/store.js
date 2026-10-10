/* ASO CLO: framework-free storefront. No payment, backend or external tracking. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Browsing remains usable in private storage modes. */
  }
};
let lang = read("aso-language", "en") === "ar" ? "ar" : "en";
let theme = read("aso-theme", "light") === "dark" ? "dark" : "light";
let products = [],
  cart = [],
  loading = true,
  failed = false;
const page = document.body.dataset.page;
// Shareable language/theme previews also make audits reproducible.
const viewParams = new URLSearchParams(location.search);
if (["ar", "en"].includes(viewParams.get("lang"))) {
  lang = viewParams.get("lang");
  write("aso-language", lang);
}
if (["light", "dark"].includes(viewParams.get("theme"))) {
  theme = viewParams.get("theme");
  write("aso-theme", theme);
}
const filters = {
  search: "",
  category: "all",
  sort: "featured",
  min: "",
  max: "",
};
const text = (en, ar) => (lang === "ar" ? ar : en);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Isolate numeric direction and space the currency consistently in both languages.
const money = (n) =>
  `<span class="money"><bdi class="money-amount">${new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(n)}</bdi> <span class="money-currency">${text("EGP", "جنيه")}</span></span>`;
const normalize = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
const digits = (s) =>
  String(s)
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[\s()-]/g, "");
const categories = [
  [
    "clothing",
    "Clothing",
    "الملابس",
    ["abayas", "isdals", "dresses", "tshirts", "pants"],
  ],
  ["footwear", "Footwear", "الأحذية", ["sneakers", "heels", "slippers"]],
  [
    "bags_accessories",
    "Bags & accessories",
    "الشنط والإكسسوارات",
    ["girls_bags", "accessories"],
  ],
  [
    "beauty_home",
    "Beauty & home",
    "الجمال والمنزل",
    ["makeup", "home_appliances"],
  ],
];
const labels = {
  abayas: ["Abayas", "عبايات"],
  isdals: ["Isdals", "إسدالات"],
  dresses: ["Dresses", "فساتين"],
  tshirts: ["T-shirts", "تيشيرتات"],
  pants: ["Trousers", "بناطيل"],
  sneakers: ["Sneakers", "سنيكرز"],
  heels: ["Heels", "كعب"],
  slippers: ["Slippers", "شباشب"],
  girls_bags: ["Bags", "شنط"],
  accessories: ["Accessories", "إكسسوارات"],
  makeup: ["Makeup", "مكياج"],
  home_appliances: ["Home appliances", "أجهزة منزلية"],
};
const categoryName = (c) =>
  labels[c]
    ? text(...labels[c])
    : text(
        ...(categories.find((g) => g[0] === c)?.slice(1, 3) || [
          "All products",
          "كل المنتجات",
        ]),
      );
const colorLabels = {
  Black: "أسود",
  White: "أبيض",
  Ivory: "عاجي",
  Sage: "سيج",
  Navy: "كحلي",
  "Dusty Rose": "وردي هادئ",
  Taupe: "تاوب",
  Charcoal: "فحمي",
  Chocolate: "بني شوكولاتة",
  Sand: "رملي",
  Gold: "ذهبي",
  Burgundy: "عنابي",
  Blush: "وردي",
  "Black & Navy": "أسود وكحلي",
  Khaki: "كاكي",
  Terracotta: "طوبي",
  Blue: "أزرق",
  Cream: "كريمي",
  Beige: "بيج",
  Ecru: "أوف وايت",
  "Washed Black": "أسود مغسول",
  "Black & White": "أسود وأبيض",
  Olive: "زيتوني",
  Camel: "جملي",
  Grey: "رمادي",
  "Light Blue": "أزرق فاتح",
  "Off White": "أوف وايت",
  "Crimson Red": "أحمر قرمزي",
  Caramel: "كراميل",
  "Clay White": "أبيض طيني",
  Nude: "نيود",
  Tan: "بني فاتح",
  Clear: "شفاف",
  Emerald: "زمردي",
  Coffee: "بني قهوة",
  Natural: "طبيعي",
  Cognac: "بني كونياك",
  "Brown & Clear": "بني وشفاف",
  Silver: "فضي",
  "Black & Gold": "أسود وذهبي",
  Mixed: "متعدد الألوان",
  Pastels: "باستيل",
  Camo: "تمويه",
  "Nude Palette": "درجات نيود",
  "Classic Red": "أحمر كلاسيكي",
  "Rose Gold": "روز جولد",
  Peach: "خوخي",
  "Medium Beige": "بيج متوسط",
  Translucent: "شفاف",
  Bronze: "برونزي",
  Brunette: "بني",
  "Black & Steel": "أسود وفضي",
  Steel: "فضي",
  Slate: "رمادي مزرق",
};
const colorName = (c) => (lang === "ar" ? colorLabels[c] || c : c);
const sizeName = (s) => (s === "One Size" ? text("One size", "مقاس موحد") : s);
const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24">${{ bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>', filter: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>' }[name] || ""}</svg>`;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3500);
}
function openDialog(id) {
  const dialog = $(id);
  if (!dialog.open) {
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }
}
function closeDialog(id) {
  $(id).close();
  document.body.style.overflow = "";
}
function shell() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.theme = theme;
  const links = [
    ["index.html", text("Shop", "المتجر")],
    ["index.html#collections", text("Collections", "المجموعات")],
    ["contact.html", text("Contact", "تواصل معنا")],
  ];
  $("#header").innerHTML =
    `<a class="skip-link" href="#main">${text("Skip to content", "انتقل للمحتوى")}</a><div class="demo-bar">${text("ASO presentation · Sample products · No online payment", "نسخة عرض ASO · منتجات تجريبية · بدون دفع إلكتروني")}</div><header class="site-header"><div class="wrap header-inner"><a class="logo" href="index.html" aria-label="${text("ASO CLO home", "الرئيسية ASO CLO")}"><img src="img/logo.webp" width="112" height="38" alt="ASO CLO" fetchpriority="high"></a><nav class="desktop-nav" aria-label="${text("Main navigation", "التنقل الرئيسي")}">${links.map(([href, label]) => `<a href="${href}" ${href.split(".")[0] === page ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav><div class="header-actions"><button class="icon-btn theme-control" data-action="theme" aria-label="${text("Switch color theme", "تغيير وضع الألوان")}">${icon("sun")}</button><button class="icon-btn lang-btn" data-action="language" aria-label="${text("Switch to Arabic", "Switch to English")}">${lang === "ar" ? "EN" : "AR"}</button><button class="icon-btn" data-action="cart" aria-label="${text("Open shopping bag", "فتح سلة التسوق")}">${icon("bag")}<span id="cart-count" class="cart-badge" hidden></span></button><button class="icon-btn mobile-only" data-action="menu" aria-label="${text("Open menu", "فتح القائمة")}">${icon("menu")}</button></div></div></header>`;
  $("#footer").innerHTML =
    `<footer class="site-footer"><div class="wrap footer-inner"><a href="index.html" class="footer-brand">ASO CLO.</a><nav class="footer-links" aria-label="${text("Footer navigation", "روابط أسفل الصفحة")}"><a href="index.html">${text("Shop the collection", "تسوق المجموعة")}</a><a href="contact.html">${text("Contact us", "تواصل معنا")}</a><a href="checkout.html">${text("Checkout", "إتمام الطلب")}</a></nav><p class="footer-copy">© ${new Date().getFullYear()} ASO CLO. ${text("A storefront presentation.", "نسخة عرض واجهة متجر.")}</p></div></footer>`;
  $("#dialogs").innerHTML =
    `<dialog id="cart-dialog" class="drawer" aria-labelledby="cart-heading"><div class="drawer-inner"><div class="drawer-head"><h2 id="cart-heading">${text("Your shopping bag", "سلة التسوق")}</h2><button class="icon-btn" data-close="cart-dialog" aria-label="${text("Close bag", "إغلاق السلة")}">${icon("close")}</button></div><div class="drawer-body" id="cart-items"></div><div class="drawer-foot" id="cart-footer"></div></div></dialog><dialog id="menu-dialog" class="drawer" aria-labelledby="menu-heading"><div class="drawer-inner"><div class="drawer-head"><h2 id="menu-heading">ASO CLO.</h2><button class="icon-btn" data-close="menu-dialog" aria-label="${text("Close menu", "إغلاق القائمة")}">${icon("close")}</button></div><nav class="drawer-body menu-links" aria-label="${text("Mobile navigation", "قائمة الموبايل")}">${links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</nav><div class="menu-bottom"><button class="btn secondary" data-action="theme">${text("Change color theme", "تغيير وضع الألوان")}</button></div></div></dialog>`;
  for (const dialog of $$("dialog")) {
    dialog.addEventListener("close", () => (document.body.style.overflow = ""));
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) {
        const r = dialog.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          dialog.close();
      }
    });
  }
  renderCart();
}
function cleanCart(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [],
    totals = new Map();
  for (const item of raw) {
    const p = products.find((p) => p.id === item.id);
    if (
      !p ||
      !p.sizes.includes(item.size) ||
      !p.colors.includes(item.color) ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1
    )
      continue;
    const qty = Math.min(
      item.quantity,
      Math.max(0, p.stock - (totals.get(p.id) || 0)),
    );
    if (!qty) continue;
    const key = variantKey(item);
    const found = result.find((x) => variantKey(x) === key);
    if (found) found.quantity += qty;
    else
      result.push({
        id: p.id,
        size: item.size,
        color: item.color,
        quantity: qty,
      });
    totals.set(p.id, (totals.get(p.id) || 0) + qty);
  }
  return result;
}
const variantKey = (item) => `${item.id}|${item.size}|${item.color}`;
const cartTotal = () =>
  cart.reduce(
    (sum, item) =>
      sum + products.find((p) => p.id === item.id).price * item.quantity,
    0,
  );
function saveCart() {
  write("aso-frontend-cart-v1", cart);
  renderCart();
}
function renderCart() {
  const count = cart.reduce((sum, i) => sum + i.quantity, 0);
  const badge = $("#cart-count");
  if (badge) {
    badge.textContent = count;
    badge.hidden = !count;
  }
  const target = $("#cart-items");
  if (!target) return;
  target.innerHTML = loading
    ? `<p role="status" class="help-note">${text("Loading your bag…", "جاري تحميل السلة…")}</p>`
    : cart.length
      ? cart
          .map((item) => {
            const p = products.find((p) => p.id === item.id);
            const other = cart
              .filter((x) => x.id === item.id && x !== item)
              .reduce((s, x) => s + x.quantity, 0);
            return `<article class="cart-item"><img src="${p.image}" alt="${escape(p.name[lang])}" width="80" height="108"><div><h3>${escape(p.name[lang])}</h3><p class="variant-info">${text("Size", "المقاس")}: ${escape(sizeName(item.size))} · ${escape(colorName(item.color))}</p><p class="price">${money(p.price * item.quantity)}</p><div class="qty-row"><div class="stepper"><button data-quantity="${escape(variantKey(item))}" data-delta="-1" aria-label="${text("Decrease quantity", "تقليل الكمية")}">−</button><span>${item.quantity}</span><button data-quantity="${escape(variantKey(item))}" data-delta="1" ${other + item.quantity >= p.stock ? "disabled" : ""} aria-label="${text("Increase quantity", "زيادة الكمية")}">+</button></div><button class="text-btn" data-remove="${escape(variantKey(item))}">${text("Remove", "حذف")}</button></div></div></article>`;
          })
          .join("")
      : `<div class="empty-state"><h2>${text("Your bag is empty", "السلة فارغة")}</h2><p>${text("Choose something from the ASO collection.", "اختر ما يناسبك من مجموعة ASO.")}</p><button class="btn" data-close="cart-dialog">${text("Continue shopping", "متابعة التسوق")}</button></div>`;
  $("#cart-footer").innerHTML = cart.length
    ? `<div class="total-row"><span>${text("Total", "الإجمالي")}</span><span>${money(cartTotal())}</span></div><p class="help-note">${text("Sample order only. No payment will be collected.", "طلب تجريبي فقط. لن يتم تحصيل أي مبلغ.")}</p><a class="btn accent" href="checkout.html">${text("Proceed to checkout", "متابعة لإتمام الطلب")}</a>`
    : "";
}
function productCard(p, index = 10) {
  return `<article class="product-card"><a class="photo" href="product.html?id=${encodeURIComponent(p.id)}"><img src="${p.image}" alt="${escape(p.name[lang])}" width="400" height="500" loading="${index < 2 ? "eager" : "lazy"}" decoding="async">${p.stock < 5 ? `<span class="stock-badge">${text(`${p.stock} available`, `${p.stock} قطع متاحة`)}</span>` : ""}</a><p class="category">${categoryName(p.category)}</p><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escape(p.name[lang])}</a></h3><div class="price-row"><span class="price">${money(p.price)}</span><a class="card-link" href="product.html?id=${encodeURIComponent(p.id)}">${text("View product", "عرض المنتج")} <span aria-hidden="true">↗</span></a></div></article>`;
}
function categoryOptions() {
  return (
    `<option value="all">${text("All categories", "كل الفئات")}</option>` +
    categories
      .map(
        (g) =>
          `<optgroup label="${text(g[1], g[2])}"><option value="${g[0]}">${text(`All ${g[1].toLowerCase()}`, `كل ${g[2]}`)}</option>${g[3].map((c) => `<option value="${c}">${categoryName(c)}</option>`).join("")}</optgroup>`,
      )
      .join("")
  );
}
function home() {
  $("#filter-dialog")?.remove();
  $("#main").innerHTML =
    `<section class="hero"><div class="wrap hero-inner"><div><p class="eyebrow">ASO / ${text("Everyday, considered", "تفاصيل لكل يوم")}</p><h1>${text("Your style.<br>A new standard.", "أسلوبك.<br>بمعيار جديد.")}</h1><p class="description">${text("Considered silhouettes. Everyday essentials. A collection that feels like you.", "تصاميم مدروسة وقطع أساسية لكل يوم. مجموعة تعكس أسلوبك.")}</p><a class="btn accent" href="#collections">${text("Explore the collection", "اكتشف المجموعة")} <span aria-hidden="true">↗</span></a></div><div class="hero-photos"><img src="img/tshirts-01.webp" width="400" height="500" alt="${text("ASO black everyday T-shirt", "تيشيرت ASO أسود")}" fetchpriority="high"><img src="img/dresses-02.webp" width="400" height="500" alt="${text("ASO black satin dress", "فستان ASO ساتان أسود")}" loading="lazy"><img src="img/abayas-03.webp" width="400" height="500" alt="${text("ASO sage belted abaya", "عباية ASO أخضر بحزام")}" loading="lazy"></div></div></section><section class="wrap collections" id="collections" aria-labelledby="collection-heading"><div class="section-heading"><h2 id="collection-heading">${text("The ASO collection", "مجموعة ASO")}</h2><p>${text("Made for your everyday.", "قطع تناسب يومك.")}</p></div><div class="filter-toolbar"><div class="field search"><label for="product-search">${text("Search products", "ابحث عن منتج")}</label><div class="search-field">${icon("search")}<input type="search" id="product-search" placeholder="${text("Name or category…", "اسم المنتج أو الفئة…")}" value="${escape(filters.search)}" autocomplete="off"></div></div><div class="field category-field"><label for="category">${text("Category", "الفئة")}</label><select id="category">${categoryOptions()}</select></div><div class="field sort-field"><label for="sort">${text("Sort by", "الترتيب")}</label><select id="sort"><option value="featured">${text("Featured", "المختارات")}</option><option value="price-asc">${text("Price: low to high", "السعر: الأقل أولًا")}</option><option value="price-desc">${text("Price: high to low", "السعر: الأعلى أولًا")}</option></select></div><button class="btn secondary" data-action="filters">${icon("filter")} ${text("Price", "السعر")}</button></div><nav class="group-tabs" aria-label="${text("Collection groups", "أقسام المجموعة")}">${[["all", "All", "الكل"], ...categories].map((g) => `<button data-category="${g[0]}" aria-pressed="false">${text(g[1], g[2])}</button>`).join("")}</nav><div class="filter-bottom"><p id="result-count" class="result-count" role="status" aria-live="polite"></p><button class="clear-filters" data-action="clear">${text("Reset filters", "مسح الفلاتر")}</button></div><div id="products" class="product-grid">${Array.from({ length: 4 }, () => '<div class="skeleton" aria-hidden="true"></div>').join("")}</div></section>`;
  $("#category").value = filters.category;
  $("#sort").value = filters.sort;
  $("#product-search").addEventListener("input", (e) => {
    filters.search = e.target.value;
    renderProducts();
  });
  $("#category").addEventListener("change", (e) => {
    filters.category = e.target.value;
    renderProducts();
  });
  $("#sort").addEventListener("change", (e) => {
    filters.sort = e.target.value;
    renderProducts();
  });
  $("#dialogs").insertAdjacentHTML(
    "beforeend",
    `<dialog id="filter-dialog" class="filter-dialog" aria-labelledby="filter-heading"><form id="filter-form"><div class="dialog-heading"><h2 id="filter-heading">${text("Price range", "نطاق السعر")}</h2><button type="button" class="icon-btn" data-close="filter-dialog" aria-label="${text("Close filters", "إغلاق الفلاتر")}">${icon("close")}</button></div><div class="filter-fields"><div class="field"><label for="min-price">${text("Minimum (EGP)", "أقل سعر (ج.م)")}</label><input id="min-price" type="number" min="0" step="1" inputmode="numeric" value="${filters.min}"></div><div class="field"><label for="max-price">${text("Maximum (EGP)", "أقصى سعر (ج.م)")}</label><input id="max-price" type="number" min="0" step="1" inputmode="numeric" value="${filters.max}"></div></div><p class="field-error" id="price-error" role="alert"></p><div class="dialog-actions"><button class="btn" type="submit">${text("Apply", "تطبيق")}</button><button class="btn secondary" type="button" data-action="clear-price">${text("Reset", "مسح")}</button></div></form></dialog>`,
  );
  $("#filter-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const min = $("#min-price").value,
      max = $("#max-price").value;
    if (min && max && Number(min) > Number(max)) {
      $("#price-error").textContent = text(
        "Minimum price must not exceed maximum price.",
        "أقل سعر يجب ألا يزيد عن أقصى سعر.",
      );
      return;
    }
    filters.min = min;
    filters.max = max;
    closeDialog("#filter-dialog");
    renderProducts();
  });
  renderProducts();
}
function renderProducts() {
  if (page !== "index") return;
  if (loading) {
    $("#result-count").textContent = text(
      "Loading the collection…",
      "جاري تحميل المجموعة…",
    );
    return;
  }
  if (failed) {
    $("#products").innerHTML =
      `<div class="empty-state" role="alert"><h2>${text("The collection could not load", "تعذر تحميل المنتجات")}</h2><p>${text("Check your connection and try again.", "تحقق من الاتصال وحاول مرة أخرى.")}</p><button class="btn" data-action="retry">${text("Try again", "إعادة المحاولة")}</button></div>`;
    $("#result-count").textContent = "";
    return;
  }
  let list = products.filter((p) => p.is_available);
  const group = categories.find((g) => g[0] === filters.category);
  if (filters.category !== "all")
    list = list.filter((p) =>
      group ? group[3].includes(p.category) : p.category === filters.category,
    );
  const tokens = normalize(filters.search).split(/\s+/).filter(Boolean);
  if (tokens.length)
    list = list.filter((p) => {
      const hay = normalize(
        `${p.name.en} ${p.name.ar} ${categoryName(p.category)} ${labels[p.category]?.join(" ")}`,
      );
      return tokens.every((t) => hay.includes(t));
    });
  if (filters.min !== "")
    list = list.filter((p) => p.price >= Number(filters.min));
  if (filters.max !== "")
    list = list.filter((p) => p.price <= Number(filters.max));
  if (filters.sort !== "featured")
    list.sort(
      (a, b) => (a.price - b.price) * (filters.sort === "price-asc" ? 1 : -1),
    );
  $("#result-count").textContent =
    text(`${list.length} products`, `${list.length} منتج`) +
    (filters.min || filters.max
      ? text(" · Price filter applied", " · فلتر السعر مفعل")
      : "");
  $("#category").value = filters.category;
  for (const btn of $$("[data-category]"))
    btn.setAttribute(
      "aria-pressed",
      String(
        btn.dataset.category === filters.category ||
          categories
            .find((g) => g[0] === btn.dataset.category)?.[3]
            .includes(filters.category),
      ),
    );
  $("#products").innerHTML = list.length
    ? list.map(productCard).join("")
    : `<div class="empty-state"><h2>${text("No products found", "لا توجد نتائج")}</h2><p>${text("Try another name or reset your filters.", "جرّب اسمًا آخر أو امسح الفلاتر.")}</p><button class="btn secondary" data-action="clear">${text("Reset filters", "مسح الفلاتر")}</button></div>`;
}
let selectedSize = "",
  selectedColor = "";
function detail() {
  const p = products.find(
    (p) => p.id === new URLSearchParams(location.search).get("id"),
  );
  if (!p) {
    $("#main").innerHTML =
      `<div class="wrap page-intro"><h1>${text("Product not found", "المنتج غير موجود")}</h1><p>${text("This link may be incomplete.", "قد يكون رابط المنتج غير مكتمل.")}</p><a class="btn" href="index.html">${text("Back to collection", "العودة للمتجر")}</a></div>`;
    return;
  }
  document.title = `${p.name[lang]} — ASO CLO`;
  selectedSize = p.sizes.length === 1 ? p.sizes[0] : "";
  selectedColor = p.colors[0];
  $("#main").innerHTML =
    `<div class="wrap"><div class="page-intro"><nav class="breadcrumb" aria-label="${text("Breadcrumb", "مسار الصفحة")}"><a href="index.html">${text("Shop", "المتجر")}</a><span aria-hidden="true">/</span><span>${categoryName(p.category)}</span></nav></div><section class="product-detail"><div class="detail-photo"><img src="${p.image}" alt="${escape(p.name[lang])}" width="600" height="750" fetchpriority="high"></div><div class="detail-info"><p class="eyebrow muted">ASO / ${categoryName(p.category)}</p><h1>${escape(p.name[lang])}</h1><p class="price">${money(p.price)}</p><p class="detail-description">${escape(p.description[lang])}</p><div class="variant-section"><div class="variant-heading"><span>${text("Size", "المقاس")}</span>${["clothing", "footwear"].includes(categories.find((g) => g[3].includes(p.category))?.[0]) ? `<button class="text-btn" data-action="size-guide">${text("Size guide", "دليل المقاسات")}</button>` : ""}</div><div class="variant-options" role="group" aria-label="${text("Select size", "اختر المقاس")}">${p.sizes.map((s) => `<button data-size="${escape(s)}" aria-pressed="${selectedSize === s}">${escape(sizeName(s))}</button>`).join("")}</div></div><div class="variant-section"><div class="variant-heading"><span>${text("Color", "اللون")}</span></div><div class="variant-options" role="group" aria-label="${text("Select color", "اختر اللون")}">${p.colors.map((c) => `<button data-color="${escape(c)}" aria-pressed="${c === selectedColor}">${escape(colorName(c))}</button>`).join("")}</div></div><p class="stock-line">${text(`${p.stock} pieces available · Sample inventory`, `${p.stock} قطعة متاحة · مخزون تجريبي`)}</p><p class="field-error" id="variant-error" role="alert"></p><div class="product-submit"><button class="btn accent" id="add-product" ${p.stock <= 0 ? "disabled" : ""}>${icon("bag")} ${p.stock <= 0 ? text("Sold out", "غير متاح") : text("Add to bag", "أضف للسلة")}</button></div><p class="help-note">${text("The photograph shows the available color. This is a sample product; checkout does not collect payment.", "الصورة تعرض اللون المتاح. هذا منتج للعرض؛ إتمام الطلب لا يتضمن دفعًا.")}</p><a class="text-btn" href="contact.html">${text("Need help choosing? Contact us", "تحتاج مساعدة في الاختيار؟ تواصل معنا")}</a></div></section><section class="related"><h2>${text("From the same collection", "من نفس المجموعة")}</h2><div class="product-grid">${products
      .filter((x) => x.category === p.category && x.id !== p.id)
      .slice(0, 4)
      .map((x) => productCard(x))
      .join("")}</div></section></div>`;
  $("#add-product").addEventListener("click", () => {
    if (!selectedSize) {
      $("#variant-error").textContent = text(
        "Choose your size before adding to the bag.",
        "اختر المقاس قبل إضافة المنتج للسلة.",
      );
      $("[data-size]")?.focus();
      return;
    }
    const count = cart
      .filter((i) => i.id === p.id)
      .reduce((s, i) => s + i.quantity, 0);
    if (count >= p.stock) {
      $("#variant-error").textContent = text(
        "You have reached the available stock for this product.",
        "وصلت للكمية المتاحة من هذا المنتج.",
      );
      return;
    }
    const item = {
      id: p.id,
      size: selectedSize,
      color: selectedColor,
      quantity: 1,
    };
    const found = cart.find((x) => variantKey(x) === variantKey(item));
    if (found) found.quantity++;
    else cart.push(item);
    saveCart();
    $("#variant-error").textContent = "";
    openDialog("#cart-dialog");
  });
  const apparel =
    p.category !== "sneakers" &&
    p.category !== "heels" &&
    p.category !== "slippers";
  $("#dialogs").insertAdjacentHTML(
    "beforeend",
    `<dialog id="size-dialog" class="filter-dialog" aria-labelledby="size-heading"><div class="dialog-heading"><h2 id="size-heading">${text("Size guide", "دليل المقاسات")}</h2><button class="icon-btn" data-close="size-dialog" aria-label="${text("Close guide", "إغلاق الدليل")}">${icon("close")}</button></div><p class="help-note">${text("Illustrative sizing for this presentation. Verify actual measurements before a real purchase.", "مقاسات توضيحية لنسخة العرض. يجب تأكيد القياسات الفعلية قبل شراء حقيقي.")}</p>${
      apparel
        ? `<table class="size-table"><caption class="sr-only">${text("Body measurements in centimeters", "قياسات الجسم بالسنتيمتر")}</caption><thead><tr><th>${text("Size", "المقاس")}</th><th>${text("Bust (cm)", "الصدر (سم)")}</th><th>${text("Waist (cm)", "الخصر (سم)")}</th></tr></thead><tbody>${[
            ["S", "84–88", "66–70"],
            ["M", "89–94", "71–76"],
            ["L", "95–100", "77–82"],
            ["XL", "101–108", "83–90"],
            ["XXL", "109–116", "91–98"],
          ]
            .map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join("")}</tr>`)
            .join("")}</tbody></table>`
        : `<p class="help-note">${text("Sizes are EU sizes. Measure your foot length and compare with the actual supplier size chart.", "المقاسات بالنظام الأوروبي. قِس طول القدم وقارنه بجدول المورد الفعلي.")}</p>`
    }</dialog>`,
  );
}
function field(
  id,
  label,
  {
    type = "text",
    autocomplete = "",
    placeholder = "",
    required = true,
    full = false,
    textarea = false,
    options = null,
  } = {},
) {
  return `<div class="field ${full ? "full" : ""}"><label for="${id}">${label}${required ? ' <span aria-hidden="true">*</span>' : ""}</label>${textarea ? `<textarea id="${id}" name="${id}" rows="4" ${required ? "required" : ""} aria-describedby="${id}-error"></textarea>` : options ? `<select id="${id}" name="${id}" ${required ? "required" : ""} aria-describedby="${id}-error">${options}</select>` : `<input id="${id}" name="${id}" type="${type}" ${autocomplete ? `autocomplete="${autocomplete}"` : ""} ${placeholder ? `placeholder="${placeholder}"` : ""} ${required ? "required" : ""} aria-describedby="${id}-error" ${type === "tel" ? 'dir="ltr" inputmode="tel"' : ""}>`}<p id="${id}-error" class="field-error"></p></div>`;
}
function summary() {
  return `<aside class="summary" aria-labelledby="summary-heading"><h2 id="summary-heading">${text("Order summary", "ملخص الطلب")}</h2><div class="summary-items">${cart
    .map((item) => {
      const p = products.find((p) => p.id === item.id);
      return `<article class="summary-item"><img src="${p.image}" alt="${escape(p.name[lang])}" width="55" height="74" loading="lazy"><div><h3>${escape(p.name[lang])}</h3><p class="variant-info">${escape(sizeName(item.size))} · ${escape(colorName(item.color))} · × ${item.quantity}</p><span class="price">${money(p.price * item.quantity)}</span></div></article>`;
    })
    .join(
      "",
    )}</div><div class="summary-row"><span>${text("Subtotal", "المجموع الفرعي")}</span><span>${money(cartTotal())}</span></div><div class="summary-row"><span>${text("Shipping", "الشحن")}</span><span>${text("Not charged in demo", "بدون تحصيل في العرض")}</span></div><div class="summary-row summary-total"><span>${text("Total", "الإجمالي")}</span><span>${money(cartTotal())}</span></div><p class="help-note">${text("No card details or money transfers are requested.", "لا نطلب بيانات بطاقة أو تحويل أموال.")}</p><a class="text-btn" href="index.html">${text("Continue shopping", "متابعة التسوق")}</a></aside>`;
}
const governorates = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "القليوبية",
  "الشرقية",
  "الغربية",
  "المنوفية",
  "الدقهلية",
  "البحيرة",
  "الفيوم",
  "بني سويف",
  "المنيا",
  "أسيوط",
  "سوهاج",
  "قنا",
  "الأقصر",
  "أسوان",
  "الإسماعيلية",
  "بورسعيد",
  "السويس",
  "دمياط",
  "كفر الشيخ",
  "مطروح",
  "شمال سيناء",
  "جنوب سيناء",
  "البحر الأحمر",
  "الوادي الجديد",
];
const governoratesEn = [
  "Cairo",
  "Giza",
  "Alexandria",
  "Qalyubia",
  "Sharqia",
  "Gharbia",
  "Monufia",
  "Dakahlia",
  "Beheira",
  "Faiyum",
  "Beni Suef",
  "Minya",
  "Asyut",
  "Sohag",
  "Qena",
  "Luxor",
  "Aswan",
  "Ismailia",
  "Port Said",
  "Suez",
  "Damietta",
  "Kafr El Sheikh",
  "Matrouh",
  "North Sinai",
  "South Sinai",
  "Red Sea",
  "New Valley",
];
function checkout() {
  if (!cart.length) {
    $("#main").innerHTML =
      `<div class="wrap page-intro"><div class="empty-state"><h1>${text("Your bag is empty", "السلة فارغة")}</h1><p>${text("Add a product to continue to checkout.", "أضف منتجًا للسلة قبل إتمام الطلب.")}</p><a class="btn" href="index.html">${text("Browse the collection", "تصفح المجموعة")}</a></div></div>`;
    return;
  }
  $("#main").innerHTML =
    `<div class="wrap"><div class="page-intro"><nav class="breadcrumb" aria-label="${text("Breadcrumb", "مسار الصفحة")}"><a href="index.html">${text("Shop", "المتجر")}</a><span aria-hidden="true">/</span><span>${text("Checkout", "إتمام الطلب")}</span></nav><h1>${text("Checkout", "إتمام الطلب")}</h1><p>${text("Enter your contact and delivery details to confirm a sample order. No payment is required.", "أدخل بيانات التواصل وعنوان التوصيل لتأكيد طلب تجريبي. لن يتم تحصيل أي مبلغ.")}</p></div><div class="checkout-layout"><form id="checkout-form" class="form-panel" novalidate><fieldset class="form-section"><legend>${text("01 / Your details", "01 / بياناتك")}</legend><div class="form-grid">${field("customer-name", text("Full name", "الاسم الكامل"), { autocomplete: "name", placeholder: text("Your full name", "اسمك الكامل") })}${field("customer-phone", text("Mobile number", "رقم الموبايل"), { type: "tel", autocomplete: "tel", placeholder: "010 0000 0000" })}${field("customer-email", text("Email (optional)", "البريد الإلكتروني (اختياري)"), { type: "email", autocomplete: "email", required: false, full: true })}</div></fieldset><fieldset class="form-section"><legend>${text("02 / Delivery address", "02 / عنوان التوصيل")}</legend><div class="form-grid">${field("governorate", text("Governorate", "المحافظة"), { options: `<option value="">${text("Select governorate", "اختر المحافظة")}</option>` + governorates.map((g, i) => `<option value="${g}">${text(governoratesEn[i], g)}</option>`).join("") })}${field("city", text("City / district", "المدينة / المنطقة"), { autocomplete: "address-level2", placeholder: text("City or district", "المدينة أو المنطقة") })}${field("address", text("Street, building and apartment", "الشارع والمبنى والشقة"), { autocomplete: "street-address", full: true, placeholder: text("Street name, building number, floor and apartment", "اسم الشارع، رقم المبنى، الدور والشقة") })}${field("notes", text("Delivery notes (optional)", "ملاحظات التوصيل (اختياري)"), { full: true, textarea: true, required: false })}</div></fieldset><section class="payment-note" aria-labelledby="payment-heading"><h2 id="payment-heading">${text("03 / Payment is disabled", "03 / الدفع غير مفعّل")}</h2><p>${text("This is a frontend demo. The order is saved only in this browser. Nothing is sent to a seller and no money is collected.", "هذه نسخة عرض للواجهة. الطلب يُحفظ في هذا المتصفح فقط، ولا يُرسل للبائع ولا يتم تحصيل أموال.")}</p></section><label class="check-label"><input type="checkbox" id="demo-agreement" aria-describedby="demo-agreement-error"><span>${text("I understand this is a sample order without payment or delivery.", "أفهم أن هذا طلب تجريبي بدون دفع أو توصيل فعلي.")}</span></label><p id="demo-agreement-error" class="field-error"></p><button type="submit" class="btn accent checkout-submit">${text("Place sample order", "تأكيد الطلب التجريبي")}</button><p id="checkout-error" class="field-error" role="alert"></p></form>${summary()}</div></div>`;
  attachValidation($("#checkout-form"), validateCheckout, (values) => {
    const order = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      items: structuredClone(cart),
      total: cartTotal(),
      paid: 0,
      status: "received",
      customer: values["customer-name"],
      demo: true,
    };
    write("aso-demo-last-order", order);
    cart = [];
    saveCart();
    location.href = "confirmation.html";
  });
}
const validName = (v) => /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,99}$/u.test(v);
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
function validateCheckout(values) {
  const errors = {};
  if (!validName(values["customer-name"]))
    errors["customer-name"] = text(
      "Enter your full name using letters.",
      "أدخل اسمك الكامل باستخدام الحروف.",
    );
  const phone = digits(values["customer-phone"]).replace(/^\+?20/, "0");
  if (!/^01[0125]\d{8}$/.test(phone))
    errors["customer-phone"] = text(
      "Enter a valid Egyptian mobile number (11 digits).",
      "أدخل رقم موبايل مصري صحيح من 11 رقمًا.",
    );
  if (values["customer-email"] && !validEmail(values["customer-email"]))
    errors["customer-email"] = text(
      "Enter a valid email address.",
      "أدخل بريدًا إلكترونيًا صحيحًا.",
    );
  if (!governorates.includes(values.governorate))
    errors.governorate = text("Select a governorate.", "اختر المحافظة.");
  if (values.city.length < 2)
    errors.city = text(
      "Enter your city or district.",
      "أدخل المدينة أو المنطقة.",
    );
  if (values.address.length < 8)
    errors.address = text(
      "Include your street, building and apartment details.",
      "أدخل تفاصيل الشارع والمبنى والشقة.",
    );
  if (!$("#demo-agreement").checked)
    errors["demo-agreement"] = text(
      "Confirm that you understand this is a demo.",
      "أكد فهمك أن هذا طلب تجريبي.",
    );
  return errors;
}
function attachValidation(form, validate, onSuccess) {
  form.addEventListener("input", (e) => {
    const id = e.target.id;
    const error = $(`#${id}-error`);
    if (error) {
      error.textContent = "";
      e.target.removeAttribute("aria-invalid");
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(form)].map(([key, value]) => [
        key,
        String(value).trim(),
      ]),
    );
    const errors = validate(values);
    for (const field of $$("input,select,textarea", form)) {
      field.removeAttribute("aria-invalid");
      const message = $(`#${field.id}-error`);
      if (message) message.textContent = errors[field.id] || "";
      if (errors[field.id]) field.setAttribute("aria-invalid", "true");
    }
    if (Object.keys(errors).length) {
      $("#" + Object.keys(errors)[0])?.focus();
      return;
    }
    onSuccess(values);
  });
}
function contact() {
  $("#main").innerHTML =
    `<div class="wrap"><div class="page-intro"><p class="eyebrow muted">ASO / ${text("Here to help", "معك في كل خطوة")}</p><h1>${text("Get in touch", "تواصل معنا")}</h1><p>${text("Have a question about a product or your size? Start here.", "لديك سؤال عن منتج أو مقاسك؟ ابدأ من هنا.")}</p></div><div class="contact-layout"><form id="contact-form" class="form-panel" novalidate><div class="form-grid">${field("contact-name", text("Full name", "الاسم الكامل"), { autocomplete: "name" })}${field("contact-email", text("Email", "البريد الإلكتروني"), { type: "email", autocomplete: "email" })}${field("subject", text("Subject", "الموضوع"), { full: true })}${field("message", text("Your message", "رسالتك"), { full: true, textarea: true })}</div><button class="btn accent checkout-submit" type="submit">${text("Preview your message", "تجهيز الرسالة")}</button><p class="help-note">${text("Demo form: validates locally. It does not send email or store personal data.", "نموذج تجريبي يتحقق من البيانات محليًا. لا يرسل بريدًا ولا يحفظ البيانات الشخصية.")}</p><div id="contact-status" class="form-status" role="status" hidden></div></form><aside class="contact-info"><h2>${text("A little help choosing", "مساعدة في الاختيار")}</h2><p>${text("Choose the size and color shown on each product page. Available stock appears before you add to your bag.", "اختر المقاس واللون من صفحة المنتج. المخزون المتاح يظهر قبل الإضافة للسلة.")}</p><h2>${text("About this presentation", "عن نسخة العرض")}</h2><p>${text("ASO CLO is presented here with fictional products. All checkout and contact interactions are frontend-only.", "ASO CLO معروض هنا بمنتجات وهمية. إتمام الطلب والتواصل يعملان كواجهة فقط.")}</p><a href="index.html">${text("Explore the collection", "تصفح المجموعة")} ↗</a></aside></div></div>`;
  attachValidation(
    $("#contact-form"),
    (values) => {
      const errors = {};
      if (!validName(values["contact-name"]))
        errors["contact-name"] = text(
          "Enter your full name.",
          "أدخل اسمك الكامل.",
        );
      if (!validEmail(values["contact-email"]))
        errors["contact-email"] = text(
          "Enter a valid email address.",
          "أدخل بريدًا إلكترونيًا صحيحًا.",
        );
      if (values.subject.length < 3)
        errors.subject = text(
          "Add a subject of at least 3 characters.",
          "أدخل موضوعًا من 3 أحرف على الأقل.",
        );
      if (values.message.length < 10)
        errors.message = text(
          "Write a message of at least 10 characters.",
          "اكتب رسالة من 10 أحرف على الأقل.",
        );
      return errors;
    },
    () => {
      const status = $("#contact-status");
      status.hidden = false;
      status.textContent = text(
        "Your message is valid and ready. This demo has not sent it to anyone.",
        "الرسالة صحيحة وجاهزة. نسخة العرض لم ترسلها لأي شخص.",
      );
      status.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  );
}
function confirmation() {
  const order = read("aso-demo-last-order", null);
  $("#main").innerHTML =
    `<div class="wrap"><section class="success-box"><div class="success-mark" aria-hidden="true">✓</div><h1>${order ? text("Your sample order is ready", "طلبك التجريبي جاهز") : text("No sample order yet", "لا يوجد طلب تجريبي بعد")}</h1><p>${text("No payment was collected. This order exists only in this browser and has not been sent to a seller.", "لم يتم تحصيل أموال. الطلب موجود في هذا المتصفح فقط ولم يُرسل للبائع.")}</p>${order ? `<h2 class="eyebrow muted">${text("Order reference", "رقم الطلب")}</h2><div class="order-ref">${escape(order.id)}</div><div class="summary-row"><span>${text("Total", "الإجمالي")}</span><strong>${money(order.total)}</strong></div><div class="summary-row"><span>${text("Payment collected", "المبلغ المحصل")}</span><strong>${money(0)}</strong></div><div class="progress" aria-label="${text("Demo status", "حالة العرض")}"><div class="current">${text("Saved locally", "محفوظ محليًا")}</div><div>${text("No payment", "بدون دفع")}</div><div>${text("No real delivery", "بدون توصيل فعلي")}</div></div>` : ""}<a class="btn" href="index.html">${text("Back to collection", "العودة للمتجر")}</a></section></div>`;
}
function render() {
  shell();
  if (loading && page !== "index") {
    $("#main").innerHTML =
      `<div class="wrap page-intro"><p role="status">${text("Loading…", "جاري التحميل…")}</p></div>`;
    return;
  }
  if (failed && page !== "index") {
    $("#main").innerHTML =
      `<div class="wrap page-intro"><h1>${text("Could not load the catalog", "تعذر تحميل المنتجات")}</h1><button class="btn" data-action="retry">${text("Try again", "إعادة المحاولة")}</button></div>`;
    return;
  }
  (
    ({ index: home, product: detail, checkout, contact, confirmation })[page] ||
    home
  )();
}
async function load() {
  loading = true;
  failed = false;
  render();
  try {
    const response = await fetch("data/products.json");
    if (!response.ok) throw new Error("Catalog unavailable");
    const data = await response.json();
    if (
      !Array.isArray(data) ||
      !data.every(
        (p) =>
          p.id &&
          p.name?.en &&
          p.image &&
          Number.isFinite(p.price) &&
          Array.isArray(p.sizes) &&
          Array.isArray(p.colors),
      )
    )
      throw new Error("Invalid catalog");
    products = data;
    cart = cleanCart(read("aso-frontend-cart-v1", []));
    write("aso-frontend-cart-v1", cart);
  } catch {
    failed = true;
  } finally {
    loading = false;
    render();
  }
}
// Keep delivery details when editing the bag during checkout.
function refreshCheckout() {
  const fields = $$("input,textarea,select", $("#main")).map((el) => ({
    id: el.id,
    value: el.value,
    checked: el.checked,
  }));
  checkout();
  for (const item of fields) {
    const el = $("#" + item.id);
    if (el) {
      el.value = item.value;
      el.checked = item.checked;
    }
  }
}

document.addEventListener("click", (event) => {
  const close = event.target.closest("[data-close]");
  if (close) {
    closeDialog("#" + close.dataset.close);
    return;
  }
  const category = event.target.closest("[data-category]");
  if (category) {
    filters.category = category.dataset.category;
    renderProducts();
    return;
  }
  const size = event.target.closest("[data-size]");
  if (size) {
    selectedSize = size.dataset.size;
    for (const btn of $$("[data-size]"))
      btn.setAttribute("aria-pressed", String(btn === size));
    $("#variant-error").textContent = "";
    return;
  }
  const color = event.target.closest("[data-color]");
  if (color) {
    selectedColor = color.dataset.color;
    for (const btn of $$("[data-color]"))
      btn.setAttribute("aria-pressed", String(btn === color));
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove) {
    cart = cart.filter((i) => variantKey(i) !== remove.dataset.remove);
    saveCart();
    if (page === "checkout") refreshCheckout();
    return;
  }
  const qty = event.target.closest("[data-quantity]");
  if (qty) {
    const item = cart.find((i) => variantKey(i) === qty.dataset.quantity);
    if (!item) return;
    const p = products.find((p) => p.id === item.id);
    const total = cart
      .filter((i) => i.id === p.id)
      .reduce((s, i) => s + i.quantity, 0);
    const next = item.quantity + Number(qty.dataset.delta);
    if (next < 1) {
      cart = cart.filter((i) => i !== item);
    } else if (total + Number(qty.dataset.delta) <= p.stock) {
      item.quantity = next;
    }
    saveCart();
    if (page === "checkout") refreshCheckout();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "language") {
    const preserved =
      page === "checkout" || page === "contact"
        ? $$("input,textarea,select", $("#main")).map((e) => ({
            id: e.id,
            value: e.value,
            checked: e.checked,
          }))
        : [];
    lang = lang === "en" ? "ar" : "en";
    write("aso-language", lang);
    render();
    for (const item of preserved) {
      const el = $("#" + item.id);
      if (el) {
        el.value = item.value;
        el.checked = item.checked;
      }
    }
  }
  if (action === "theme") {
    theme = theme === "dark" ? "light" : "dark";
    write("aso-theme", theme);
    document.documentElement.dataset.theme = theme;
  }
  if (action === "cart") openDialog("#cart-dialog");
  if (action === "menu") openDialog("#menu-dialog");
  if (action === "filters") openDialog("#filter-dialog");
  if (action === "size-guide") openDialog("#size-dialog");
  if (action === "retry") load();
  if (action === "clear") {
    Object.assign(filters, {
      search: "",
      category: "all",
      sort: "featured",
      min: "",
      max: "",
    });
    home();
  }
  if (action === "clear-price") {
    filters.min = "";
    filters.max = "";
    $("#min-price").value = "";
    $("#max-price").value = "";
    $("#price-error").textContent = "";
  }
});
window.addEventListener("storage", (event) => {
  if (event.key === "aso-frontend-cart-v1" && !loading) {
    cart = cleanCart(read("aso-frontend-cart-v1", []));
    renderCart();
    if (page === "checkout") refreshCheckout();
  }
});
document.addEventListener(
  "close",
  (event) => {
    if (event.target instanceof HTMLDialogElement)
      document.body.style.overflow = "";
  },
  true,
);
load();
