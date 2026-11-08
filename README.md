# ASO CLO — متجر إلكتروني ولوحة شركاء

تطبيق Full Stack لمتجر أزياء متعدد الشركاء، يتضمن واجهة متجر ثنائية اللغة (العربية والإنجليزية)، لوحة إدارة للشركاء، واجهات REST API، وقاعدة بيانات PostgreSQL على Supabase. المشروع الرئيسي مبني بـNext.js وReact وTypeScript ويعمل بخادم Node.js؛ أما `frontend-demo/` فهو عرض ثابت منفصل لا يحتوي على Backend.

## الروابط

- **التطبيق الرئيسي:** https://aso-clo-platform.vercel.app
- **العرض الثابت للواجهة:** https://aso-clo-frontend-demo.vercel.app
- **مستودع GitHub:** https://github.com/ahmed-abo-zahra/OSA-CLO

> روابط العرض لا تعني أن الدفع الإلكتروني مفعّل. إتمام الطلب يسجل طلبًا غير مدفوع؛ لا توجد بوابة دفع أو تحصيل أموال.

## التقنية والمعمارية

| الطبقة | التقنية |
|---|---|
| واجهة المستخدم | React 19، Next.js 16 App Router، TypeScript، Tailwind CSS |
| Backend | Node.js عبر Next.js Route Handlers وواجهات REST API |
| قاعدة البيانات | Supabase PostgreSQL مع migrations محفوظة في `supabase/migrations/` |
| الصور | Supabase Storage في bucket باسم `product-images`، مع تحقق من نوع الملف ومحتواه وحجمه |
| المصادقة الإدارية | دخول للشركاء بجلسات HMAC موقعة، cookie من نوع HttpOnly، وكلمات مرور من متغيرات بيئة الخادم |
| النشر | Vercel للتطبيق الرئيسي؛ النشر الثابت في `frontend-demo/` مستقل عنه |

مسار الطلب الإلكتروني يتحقق من الأسعار والملكية والقياسات والألوان والمخزون والخصم داخل PostgreSQL، ثم ينشئ الطلبات ويخصم المخزون ضمن معاملة قاعدة بيانات واحدة. عند احتواء السلة على منتجات من أكثر من شريك، ينشئ النظام طلبًا لكل شريك. الطلب اليدوي في لوحة الإدارة يستخدم معاملة RPC منفصلة أيضًا.

يُستخدم `SUPABASE_SECRET_KEY` على الخادم فقط. الواجهة العامة لا تستطيع الكتابة مباشرة إلى جداول الطلبات أو المنتجات؛ وصولها المباشر مقيد بـRLS إلى بيانات الكتالوج العامة والتقييمات المعتمدة والإعداد الترويجي المحدد.

## الوظائف الرئيسية

- متجر متجاوب عربي/إنجليزي مع دعم RTL، البحث، التصفية، ترتيب المنتجات، تفاصيل المنتج والسلة.
- Checkout للضيف، والتحقق الخادمي من بيانات العميل والمنتجات والخيارات والمخزون والأسعار والخصومات.
- تتبع طلب برقم الطلب مع عرض أقل قدر ممكن من البيانات الشخصية وإخفاء اسم العميل.
- لوحة شريك لإدارة منتجاته وطلباته والخصومات وإعدادات المتجر والتقارير.
- تسجيل دخول للشركاء الثلاثة: Safia وOmaima وAisha. الجلسة موقعة وتنتهي بعد 12 ساعة، مع تحديد لمحاولات الدخول في قاعدة البيانات.
- حفظ صور المنتجات في Supabase Storage؛ الأنواع المقبولة JPEG وPNG وWebP.

**لا توجد حسابات عملاء أو تسجيل دخول Google/WhatsApp في النسخة الحالية.** المشتري يستخدم Checkout كضيف، والمصادقة الموجودة مخصصة لدخول لوحة الشركاء.

## المتطلبات

- Node.js `>=22.13.0 <27` (Node.js 22–26).
- npm.
- مشروع Supabase جديد أو مخصص لهذا التطبيق.

## التشغيل المحلي

```bash
npm ci
cp .env.example .env.local
```

للتجربة المعزولة دون اتصال بـSupabase، اجعل `NEXT_PUBLIC_DEMO_MODE=true` في `.env.local` ثم شغّل:

```bash
npm run dev
```

افتح http://localhost:3000. دخول العرض المحلي: `Safia` أو `Omaima` أو `Aisha`، وكلمة المرور `aso-demo-2026`. هذه بيانات عرض محلية فقط ولا تصلح للإنتاج. تغييرات العرض تُحفظ في `.demo/database.json`، والصور تحت `public/demo/uploads/`؛ كلاهما مستثنى من Git. وضع العرض يعتمد على ملفات الجهاز ولا يصلح لاستضافة متعددة النسخ.

## إعداد Supabase

ملف `.env.example` يوضح المتغيرات المطلوبة. للإنتاج المحلي أو Vercel، استخدم:

```dotenv
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<server-only-secret-key>
ADMIN_SESSION_SECRET=<random-secret-at-least-32-characters>
ADMIN_PASSWORD_SAFIA=<unique-long-random-password>
ADMIN_PASSWORD_OMAIMA=<unique-long-random-password>
ADMIN_PASSWORD_AISHA=<unique-long-random-password>
```

أنشئ `ADMIN_SESSION_SECRET` عشوائيًا، مثلًا باستخدام `openssl rand -base64 48`، وضع جميع القيم في مخزن الأسرار المحلي أو Vercel. لا تضف `.env.local` إلى Git، ولا تضع المفتاح السري في أي متغير يبدأ بـ`NEXT_PUBLIC_`.

لتطبيق المخطط من مستودع المشروع:

```bash
npx supabase login
npx supabase link --project-ref rtokjrupdvftacewvmxm
npx supabase db push
```

الترحيلات المسجلة هي `20261108132251_initial_schema.sql` (الجداول وRLS وStorage ودوال المعاملات)، و`20261108132622_seed_sample_catalog.sql` (**120 منتجًا وصورًا تجريبية خيالية** لأغراض العرض)، و`20261108132723_explicit_access_policies.sql` (سياسات رفض صريحة للجداول الحساسة وفهرس إضافي). لا تستخدم الأسعار أو التكلفة أو المخزون التجريبي كبيانات متجر حقيقية؛ استبدلها ببيانات معتمدة قبل تلقي طلبات فعلية.

## الأوامر والفحوص

```bash
npm run dev        # خادم التطوير
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run build      # بناء الإنتاج
npm run validate   # lint + typecheck + فحوص الكتالوج والـAPI
```

للاختبار المحلي الإضافي، شغّل التطبيق بوضع العرض ثم نفّذ:

```bash
node scripts/test-demo-api.mjs
```

هذا الاختبار يعمل على localhost فقط ويختبر الجلسات المزورة وعزل الشركاء والتحقق من الخيارات والكميات والإجماليات والتتبع. وهو لا يثبت إعدادات حساب Supabase أو نشر Vercel الحي.

## النشر على Vercel

اربط مستودع `ahmed-abo-zahra/OSA-CLO` بمشروع Vercel مبني على Next.js، ثم أضف متغيرات الإنتاج الموجودة في `.env.example` إلى إعدادات المشروع. يجب أن تكون `NEXT_PUBLIC_DEMO_MODE=false` في Production، وأن تكون كلمات مرور الشركاء مختلفة وقوية. بعد إضافة المتغيرات وإتمام نشر ناجح، اختبر تسجيل الدخول والمنتجات وCheckout والتتبع في بيئة Preview أولًا، ثم Production.

لا تنشر أي ملف `.env`، ولا تطبع المفاتيح في سجلات CI، ولا تشارك كلمة المرور التجريبية للمستخدمين الحقيقيين.

## العرض الثابت منفصل عن التطبيق الكامل

`frontend-demo/` نسخة HTML وCSS وJavaScript مستقلة لخدمة عرض الواجهة. لا تستخدم قاعدة بيانات أو تسجيل دخول أو Backend، ولا ينبغي احتسابها وحدها بوصفها مشروع Full Stack. التطبيق الرئيسي الذي يحقق المعمارية الكاملة هو تطبيق Next.js في جذر المستودع.

## حدود النسخة الحالية

- لا يوجد دفع إلكتروني؛ الطلبات غير مدفوعة حتى تأكيدها خارج التطبيق.
- لا توجد حسابات للمشترين؛ Checkout متاح كضيف.
- البيانات التجريبية والصور المولدة للعرض فقط، وليست مخزونًا أو عروضًا حقيقية.
- لا تعتمد على وضع `.demo` كقاعدة بيانات إنتاجية أو متعددة النسخ.
