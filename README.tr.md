# Horror Director

Tek kişilik psikolojik korku oyunu projeleri (özellikle Unreal Engine 5.x) için tarayıcı tabanlı bir planlama aracı.
Sahne akışınızı düğüm grafı olarak tasarlayın, korku olaylarını zaman çizelgesinde planlayın, karakter davranışlarını
takip edin ve her şeyi ileride Unreal Engine'e aktarmak üzere JSON olarak dışa aktarın. Sunucu ve ücretli API gerekmez;
projeler tarayıcınızın `localStorage` alanında saklanır.

## Özellikler

- **Sahne grafı** (React Flow): Gerçeklik / Rüya / Kâbus / Anı / Final sahnelerini sürükleyip bırakın; sahneleri tipli
  geçişlerle (sert kesme, solma, glitch, karartma, morf, geri döngü), koşul ve sürelerle bağlayın.
- **Rüya ⇄ gerçeklik geçişleri** otomatik algılanır; kesikli ve renkli kenarlarla gösterilir (↓ dalış, ↑ uyanış).
- **Döngülü sahneler**: kendine bağlanan kenarlar, sahne başına döngü ayarları (en fazla tekrar, çıkış koşulu) ve otomatik döngü tespiti.
- **Korku olayı zaman çizelgesi**: sahne başına tetikleyici hattı, sürüklenebilir işaretler, 0–10 yoğunluk eğrisi,
  tetikleyici türleri (jumpscare, ses, görsel, yapay zekâ, ortam, anlatı), koşullar ve tek seferlik tetikleme.
- **Karakterler**: davranış durumları, saldırganlık seviyesi ve her karakterin sahnelerdeki durumunu gösteren sahne × karakter matrisi.
- **Analiz**: yapısal kontroller (başlangıç eksik, ulaşılamayan sahne, çıkmaz, çıkışsız döngü, kaçışsız rüya, süreyi aşan tetikleyici…) ve proje istatistikleri.
- **Geri al / yinele** (50 adım, Ctrl/Cmd+Z), sıkı içe aktarma doğrulaması, kayıt durumu göstergesi ve tek tıkla JSON yedeği (Ctrl/Cmd+S).
- **İçe / dışa aktarma**: şema doğrulamalı (zod), sürümlü JSON biçimi (`schemaVersion: 1`).
- **Türkçe / İngilizce arayüz** (aşağıya bakın).

## Dil

Arayüz tamamen **Türkçe** ve **İngilizce** olarak sunulur. İlk ziyarette tarayıcı dili kullanılır (`tr*` → Türkçe, diğerleri →
İngilizce). Üst çubuktaki **TR | EN** düğmesiyle istediğiniz zaman değiştirebilirsiniz; arayüz sayfa yenilenmeden ve
düzenlemeleriniz kaybolmadan anında güncellenir. Seçiminiz proje verisinden ayrı saklanır (`horror-director:lang`).

- Sahne adları, açıklamalar, içe aktarılan metinler ve örnek projenin anlatısı **çevrilmez**; olduğu gibi kalır.
- Dışa aktarılan JSON iki dilde de aynıdır; JSON anahtarları, enum değerleri, kimlikler ve Unreal varlık yolları değişmez.
- Yeni oluşturulan öğeler (sahne, tetikleyici, karakter…) o an seçili dilde varsayılan adlar alır.
- Doğrulama ve analiz mesajları dile göre ayrıca üretilir (yapılandırılmış tanılar), çeviri sonradan yapılmaz.

## Kurulum

Node.js 20+ gerekir.

```bash
npm install
npm run dev        # http://localhost:5173
```

Diğer komutlar:

```bash
npm test           # vitest birim testleri
npm run typecheck  # tsc
npm run build      # tip denetimi + üretim derlemesi (dist/)
npm run preview    # üretim derlemesini sunar
```

## Kullanım ipuçları

- Sahneleri grafın üstündeki araç çubuğundan ekleyin. Bağlamak için bir düğümün **sağ** tutamacından başka bir düğümün **sol**
  tutamacına sürükleyin; bir düğümü kendine bağlayarak döngü oluşturun. Seçip `Del` ile silin.
- Zaman çizelgesinde hatta çift tıklayarak tetikleyici ekleyin; işaretleri sürükleyerek zamanlarını değiştirin.
- **Yedekle** düğmesini düzenli kullanın; tarayıcı depolaması temizlenebilir.
- **Örnek**, rüya katmanları, bir döngü ve iki finali içeren "The Hollow Apartment" demo projesini yükler (İngilizce yazılmıştır).

## JSON biçimi

Biçim `README.md` içinde belgelenmiştir ve dilden bağımsızdır (`format: "horror-director"`, `schemaVersion: 1`).
Türkçe metin (ç, ğ, ı, İ, ö, ş, ü) UTF-8 olarak aynen korunur.

## Teknoloji

React 19, TypeScript, Vite, @xyflow/react, Zustand, Zod, lucide-react, Vitest. Yerelleştirme için ek bağımlılık yoktur.
