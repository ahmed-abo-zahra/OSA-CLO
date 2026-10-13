import json,pathlib
p=pathlib.Path('src/lib/demo-products.json');products=json.loads(p.read_text())
corrections={
'abayas':[
('Minimal Crepe Abaya — Black','عباية كريب بسيطة — أسود','Black'),('Pearl-Button Abaya — Ivory','عباية بأزرار لؤلؤ — عاجي','Ivory'),('Belted Kimono Abaya — Sage','عباية كيمونو بحزام — سيج','Sage'),('Pleated Abaya — Navy','عباية بكسرات — كحلي','Navy'),('Butterfly-Sleeve Abaya — Dusty Rose','عباية بأكمام فراشة — وردي هادئ','Dusty Rose'),('Linen-Look Abaya — Taupe','عباية بملمس الكتان — تاوب','Taupe'),('Contrast-Cuff Abaya — Charcoal','عباية بأساور متباينة — فحمي','Charcoal'),('Satin Abaya — Chocolate','عباية ساتان — بني شوكولاتة','Chocolate'),('Open-Front Abaya — Sand','عباية مفتوحة — رملي','Sand'),('Embroidered Abaya — Black','عباية مطرزة — أسود','Black')],
'slippers':[
('Faux-Fur Crossover Slide — Blush','شبشب فرو متقاطع — وردي','Blush'),('Flat Leather Slide — Black','شبشب جلد مسطح — أسود','Black'),('Croc-Embossed Flat Slide — Beige','شبشب مسطح بنقشة جلد — بيج','Beige'),('Velvet House Slipper — Emerald','شبشب منزلي مخمل — زمردي','Emerald'),('EVA Clog — Ivory','شبشب كلوج — عاجي','Ivory'),('Fluffy Closed-Toe Slipper — Coffee','شبشب مغلق فرو — بني قهوة','Coffee'),('Cork-Sole Two-Strap Slide — Tan','شبشب بحزامين ونعل فلين — بني فاتح','Tan'),('Quilted House Slipper — Ivory','شبشب منزلي مبطن — عاجي','Ivory'),('Waffle House Slipper — Charcoal','شبشب منزلي بملمس وافل — فحمي','Charcoal'),('Pom-Pom Fluffy Slide — White','شبشب فرو ببوم بوم — أبيض','White')]
}
colors={
'isdals':['Black','Charcoal','Navy','Gold','Ivory','Burgundy','Blush','White','Black & Navy','Black'],
'dresses':['Sand','Black','Ivory','Khaki','Ivory','Terracotta','Blush','Blue','Cream','Beige'],
'tshirts':['Black','White','Ecru','Washed Black','Black & White','Black','White','Sage','Cream','Olive'],
'pants':['Camel','Olive','Blue','Black','White','Grey','Navy','Black','Light Blue','Cream'],
'sneakers':['White','White','Black','Cream','Off White','Crimson Red','Caramel','Charcoal','Clay White','Black & White'],
'heels':['Camel','Black','Nude','White','Tan','Beige','Black','Gold','Clear','Black'],
'girls_bags':['Black','Natural','Gold','Tan','Cognac','Brown & Clear','Natural','Beige','Camel','Olive'],
'accessories':['Black','Gold','Silver','Black & Gold','Charcoal','Black','Mixed','Pastels','Black','Camo'],
'makeup':['Nude Palette','Classic Red','Black','Rose Gold','Peach','Medium Beige','Translucent','Bronze','Clear','Brunette'],
'home_appliances':['Black & Steel','Steel','Ivory','Slate','Black','Ivory','Sage','Ivory','Black','Ivory']
}
counts={}
for product in products:
 cat=product['category'];i=counts.get(cat,0);counts[cat]=i+1
 if cat in corrections:
  en,ar,color=corrections[cat][i];product['name_en']='ASO '+en;product['name_ar']='ASO — '+ar
 else: color=colors[cat][i]
 product['colors']=[color]
 # Keep demo specifications faithful to what is depicted rather than invisible performance claims.
 product['description']=product['name_en']+'. ASO collection with a considered finish and a clean everyday design. The photograph shows the available color. Sample product for the store presentation.'
 product['description_ar']=product['name_ar']+'. قطعة من مجموعة ASO بتشطيب أنيق وتصميم عملي. الصورة تعرض اللون المتاح. منتج تجريبي لعرض المتجر.'
 if cat in ['sneakers','heels','slippers']:product['sizes']=['36','37','38','39','40','41']
 if cat in ['girls_bags','accessories','makeup','home_appliances']:product['sizes']=['One Size']
 # Remove unsupported composition and material weight claims from product names.
 product['name_en']=product['name_en'].replace('100% Silk Square Scarf','Satin Square Scarf').replace(' — 200GSM','').replace('Heavyweight Boxy','Boxy')
 assert product['name_en'].startswith('ASO ')
assert len(products)==120 and all(v==10 for v in counts.values())
p.write_text(json.dumps(products,ensure_ascii=False,indent=2))
print(counts)
