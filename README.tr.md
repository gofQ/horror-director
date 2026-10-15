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

## Graf kullanılabilirliği (v0.4B)

- **Otomatik Düzenle** (graf araç çubuğu): sahneleri hikâye akışına göre soldan sağa katmanlar halinde yerleştirir;
  dallanma, birleşme, döngüler, kendine döngüler, bağlantısız gruplar (dikeyde alt alta) ve birden çok final (tek son
  sütun) desteklenir. Yalnızca **sahne konumlarını** değiştirir (kimlikler, geçişler, tetikleyiciler, karakterler ve
  metinler değişmez), **yalnızca düğmeye bastığınızda** çalışır (açılışta, yenilemede veya proje değiştirirken asla),
  **tek bir geri al/yinele adımıdır** ve konumları birebir geri getirir; aynı sonucu verir (tekrar basmak bir şey
  değiştirmez). Elle sürükleme çalışmaya devam eder. Ardından görünüm sonuca sığdırılır (görünüm projede saklanmaz).
- **Kenar yönlendirme:** A→B ve B→A ayrı yollar ve ayrı etiketlerle çizilir; geri yönlü kenarlar sahnelerin içinden
  geçmek yerine altından yay çizer veya S eğrisi olur; kendine döngüler sahnenin üstünden yay çizer. Kenar etiketleri
  tıklanabilir (kenarı seçer) ve tam metni ipucu olarak gösterir. Şema değişmedi; aynı sıralı çiftin tekrarı yine reddedilir.

## Testler

```bash
npm test            # birim testleri (vitest)
npm run test:e2e    # Playwright tarayıcı testleri (uygulamayı kendisi derleyip sunar)
```
E2E için Chromium gerekir: bir kez `npx playwright install chromium` çalıştırın veya `PW_CHROMIUM_PATH` ile mevcut bir
ikili dosyayı gösterin (Cloud Session: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`). Paket; açılış,
sahne ekleme ve bağlama, Otomatik Düzenle + geri al/yinele, karşılıklı kenarlar ve kendine döngüler, proje değiştirme,
yenileme sonrası kalıcılık ve TR/EN geçişini test ID'leri ve DOM geometrisiyle doğrular (ekran görüntüsü karşılaştırması yok).

## Proje kütüphanesi (v0.4A)

Üst çubuktaki **Projeler** düğmesi kütüphaneyi açar: proje oluşturma, açma, yeniden adlandırma, çoğaltma ve silme; örnek
ekleme; bir JSON dosyasını **yeni proje olarak içe aktarma**; ya da (açıkça ve onayla) etkin projeyi bir dosyayla
değiştirme. Etkin proje sayfa yenilense de hatırlanır. **Yedekle** her zaman *etkin* projeyi değişmeyen şema v1 biçiminde
indirir; kütüphane verisi (kimlikler, zaman damgaları, etkin proje) proje JSON'una asla yazılmaz.

- **Depolama:** `horror-director:library:v1` (dizin) ve proje başına `horror-director:proj:<id>` kaydı; hepsi `localStorage`
  içinde. Kimlikler dahilidir ve proje adından bağımsızdır.
- **v0.1–v0.3'ten geçiş:** ilk açılışta eski tek proje (`horror-director:project:v1`) doğrulanır, `legacy` kimliğiyle
  kütüphaneye kopyalanır, geri okunup karşılaştırılır ve ancak sonra dizine eklenir. Özgün anahtar **hiç değiştirilmez ve
  silinmez** (eski sürüme dönüş için bayat bir kopya olarak kalır); geçiş tekrar çalışmaz, yarıda kesilme veya yazma hatası
  çoğaltma olmadan güvenle yeniden denenir. Okunamayan eski veri taşınmaz; `horror-director:unreadable:<zaman>` altında
  saklanır ve indirilebilir.
- **Geçiş korumalıdır:** proje değiştirmeden önce bekleyen düzenlemeler kaydedilir; kayıt başarısız olursa mevcut projede
  kalırsınız ve yedek indirebilir ya da yeniden deneyebilirsiniz. Geri al/yinele geçmişi etkin projeye aittir ve her
  geçişte temizlenir.
- **Hasarlı veri:** okunamayan dizin saklanır ve kayıtlı proje kayıtlarından yeniden oluşturulur; okunamayan proje "hasarlı"
  olarak listelenir (ham veri korunur, indirilebilir) ve asla üzerine yazılmaz.
- **Bilinen sınır — birden çok sekme:** aynı kütüphaneyi düzenleyen iki sekme birleştirilmez (son yazan kazanır). Horror
  Director yalnızca başka sekmedeki değişikliği algılar, uyarı gösterir ve sayfayı yenileyene kadar kütüphane işlemlerini engeller.

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
