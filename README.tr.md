# Horror Director

Tek kişilik psikolojik korku projeleri için tarayıcı tabanlı bir planlama aracı (Unreal Engine 5.x düşünülerek
geliştirildi). Sahne akışını düğüm grafiği olarak tasarlayın, korku anlarını zaman çizelgesinde planlayın, karakter
davranışlarını izleyin, hikâye rotalarını simüle edip karşılaştırın ve her şeyi daha sonra Unreal Engine'e aktarmak
üzere JSON olarak dışa aktarın. Sunucu ve ücretli API yoktur — projeler tarayıcınızın `localStorage` alanında durur.

**Kimler için:** oyunu geliştirmeden önce (ya da geliştirirken) sahne akışını, rüya/gerçeklik geçişlerini, döngüleri ve
korku ritmini planlamak isteyen bağımsız geliştiriciler ve küçük ekipler. Sürüm geçmişi: [CHANGELOG.md](CHANGELOG.md).
İngilizce dokümantasyon: [README.md](README.md).

## Özellikler

- **Sahne grafiği:** sürükle-bırak sahneler (Gerçeklik / Rüya / Kâbus / Anı / Final), koşul ve süre içeren tipli
  geçişlerle (cut, fade, glitch, blackout, morph, loop-back) bağlanır. Rüya ⇄ gerçeklik geçişleri kesikli, renk kodlu
  kenarlarla çizilir. Karşılıklı kenarlar, geri kenarlar ve kendine döngüler yollar ve etiketler okunabilir kalacak şekilde yönlendirilir.
- **Otomatik Düzenle:** sahnelerin soldan sağa, belirleyici (deterministik) yerleşimi. Yalnızca düğmeye bastığınızda
  çalışır, yalnızca sahne konumlarını değiştirir ve tek bir geri al/yinele adımıdır.
- **Döngüler:** kendine döngüler, sahne başına döngü ayarları (en çok yineleme, çıkış koşulu) ve otomatik döngü tespiti.
- **Korku zaman çizelgesi:** sahne başına tetikleyici izi; sürüklenebilir işaretçiler, yoğunluk (0–10), tetikleyici
  türleri (jumpscare, ses, görsel, YZ, çevre, anlatı), koşullar ve bir kez tetikleme seçeneği.
- **Karakterler:** saldırganlık düzeyli davranış durumları ve sahne × karakter matrisi.
- **Analiz:** yapısal kontroller (başlangıç yok, ulaşılamayan sahneler, çıkmaz sokaklar, çıkışsız kapalı döngüler,
  kaçılamayan rüyalar, sahne süresini aşan tetikleyiciler, eski referanslar) ve proje istatistikleri.
- **Hikâye rotası simülatörü:** geçişleri seçerek grafikte bir rota izleyin (Geri / Baştan başlat). Rotanın finale mi
  ulaştığını, çıkmaza mı girdiğini, tamamlanmamış mı olduğunu ya da bir sınırda mı durduğunu bildirir; planlanan
  tetikleyicileri yazılmış yoğunluklarıyla mutlak zaman grafiğinde ve rota istatistikleriyle gösterir.
- **Ritim analizi:** simüle edilen rota hakkında tarafsız, belirleyici gözlemler (aşağıya bakın).
- **Rota karşılaştırması:** bir rotayı Rota A olarak sabitleyin, Rota B'yi oluşturun ve yan yana karşılaştırın (aşağıya bakın).
- **Proje kütüphanesi:** birden çok proje; aç/oluştur/yeniden adlandır/çoğalt/sil, yeni proje olarak içe aktarma, hatırlanan etkin proje.
- **Güvenlik:** geri al/yinele (50 adım), katı içe aktarma doğrulaması, kayıt durumu göstergesi, JSON yedeği, okunamayan verinin kurtarılması.
- **İngilizce ve Türkçe** arayüz, duyarlı koyu tema (küçük ekranlarda denetçi alt panele dönüşür).

## Kurulum ve çalıştırma

Node.js 20+ gerekir.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tür denetimi + dist/ içine üretim derlemesi
npm run preview    # üretim derlemesini sun
```

## Nasıl kullanılır

1. **Grafiği kurun.** Grafiğin üzerindeki araç çubuğundan sahne ekleyin. Bağlamak için bir düğümün **sağ** tutamacından
   başka bir düğümün **sol** tutamacına sürükleyin; bir düğümü kendine bağlayarak döngü yapın. Bir öğeyi seçip `Del`
   ile silin. Başlangıç sahnesini sahne denetçisinden belirleyin. **Örnek**, rüya katmanları, bir döngü ve iki final
   içeren "The Hollow Apartment" demo projesini yükler (İngilizce yazılmıştır).
2. **Korku anlarını planlayın.** **Zaman çizelgesi**nde, belirli bir zaman ve yoğunlukta tetikleyici eklemek için izi
   çift tıklayın; zamanını değiştirmek için işaretçileri sürükleyin.
3. **Karakterleri izleyin** (**Karakterler**) ve yapıyı **Analiz**de kontrol edin.
4. **Rota simüle edin** (**Simülatör**): bulunduğunuz sahneden geçişleri seçin. Geçiş koşulları *asla
   değerlendirilmez*; o geçişi seçerek yaptığınız varsayımlar olarak gösterilir.
   - Döngüdeki `En çok yineleme`, ilk ziyaretten *sonraki ek tekrar ziyaretleri* sayar (4 ⇒ en fazla 5 ziyaret). `0`
     (sınırsız) ayarlanabilir bir güvenlik sınırıyla (varsayılan 5); diğer döngüler ise sabit bir adım sınırıyla
     (varsayılan 40, 1–200) kısıtlanır.
   - Bir sahne ziyareti sahnenin `süre`si kadar sürer, ardından geçişin `süre`si gelir; tetikleyici zamanı *sahne
     başlangıcı + yerel zamanı*dır. `Yalnızca bir kez` tetikleyiciler yalnızca ilk ziyarette görünür; koşullu
     tetikleyiciler *varsayımsal* olarak içi boş çizilir; sahne süresinden sonraki tetikleyiciler işaretlenir, gerçek
     zamanında gösterilir ve istatistiklere katılmaz.
   - Grafik yalnızca işaretçi gösterir, eğri çizmez: yoğunluk sizin girdiğiniz bir tasarım sayısıdır, ölçülmüş bir
     korku ya da gerilim puanı **değildir**.
5. **Ritim analizini okuyun** (grafiğin altında). Yalnızca mevcut rotanın geçerli planlanan olaylarını inceler
   (varsayımsal olaylar dahil edilir ve işaretlenir). Tüm eşikler dahildir:

   | Örüntü | Kural | Önem |
   |---|---|---|
   | Tetikleyici kümesi | 20 sn içinde ≥ 4 olay | 6 olaydan itibaren dikkat |
   | Tekrarlanan yüksek yoğunluk | 45 sn içinde yoğunluğu ≥ 8 olan ≥ 2 olay | 3'ten itibaren dikkat |
   | Tekrarlanan tetikleyici türü | 120 sn içinde aynı türden ≥ 4 olay *(ayarlanabilir)* | 6'dan itibaren dikkat |
   | Tetikleyicisiz aralık | rota başından, olaylar arasında ve **bitmiş** rotanın son olayından sonra ≥ 90 sn boşluk *(ayarlanabilir)* | bilgi |
   | Tırmanma | yoğunluğu kesin artan ≥ 3 ardışık olay, aralarında en fazla 60 sn | bilgi |

   Bulgular hüküm değil gözlemdir: kümelenme, tekrar ve sessizlik bilinçli olabilir. Kalite puanı ve gerilim eğrisi
   yoktur. Bir bulguyu seçmek olaylarını ve zaman aralığını grafikte vurgular.
6. **Rotaları karşılaştırın:** **Rota A olarak sabitle**'ye tıklayın, **Geri/Baştan başlat** ile **Rota B**'yi
   oluşturun; karşılaştırma paneli ikisini yan yana gösterir: süre ve durum, sahne ziyaretleri, benzersiz sahneler,
   döngü tekrarları, planlanan olaylar, dakikadaki olay, ortalama/en yüksek yazılmış yoğunluk, tetikleyici türü dağılımı,
   kategori ve önem derecesine göre ritim bulguları (açık `B − A` farklarıyla), ilk ayrışma noktası, ortak ve rotaya
   özgü sahneler, geçişler ve olaylar, ayrıca hizalanmış olay zaman çizgileri. Olaylar sahne, tetikleyici ve ziyaret
   sırasıyla tanımlanır; böylece tekrarlı ziyaretler doğru karşılaştırılır. İki rota da aynı sınırları ve eşikleri
   kullanır ve mevcut projeye göre yeniden simüle edilir; graf değişiklikleri Rota A'yı geçersiz kılarsa açık bir uyarı
   görürsünüz ve karşılaştırma eksik olarak işaretlenir. **Rota A'yı değiştir** veya **Karşılaştırmayı temizle**
   istediğiniz an kullanılabilir. Bilerek bir "en iyi rota" sıralaması yoktur.
7. **Yedekle** düğmesini düzenli kullanın — tarayıcı depolaması temizlenebilir.

Simülasyon, ritim ve karşılaştırma durumu projeden ayrıdır: proje verisini, otomatik kaydı, kütüphaneyi ya da geri al
geçmişini değiştirmez, dışa aktarılmaz ve proje değiştirdiğinizde sıfırlanır.

## Veri depolama, yedekler ve JSON uyumluluğu

- **Depolama** (tarayıcı `localStorage`): `horror-director:library:v1` (dizin), `horror-director:proj:<id>` (proje başına
  bir kayıt), `horror-director:lang` (dil). Kimlikler dahilidir ve adlardan bağımsızdır. Kütüphane verisi (kimlikler,
  zaman damgaları, etkin proje) proje JSON'una asla yazılmaz.
- **Yedek**, *etkin* projeyi şema v1 dışa aktarma biçiminde indirir. İçe aktarma katı doğrulama yapar (yinelenen
  kimlikler, boşta kalan referanslar, tanınmayan alanlar, daha yeni şema sürümleri hatadır ve hiçbir şey
  değiştirilmeden önce gösterilir). Bir dosya yeni proje olarak ya da onayla etkin projenin yerine aktarılabilir.
- **Taşıma:** erken sürümlerin tek projelik depolaması doğrulanır, `legacy` kimliğiyle kütüphaneye kopyalanır, kontrol
  edilir ve ancak ondan sonra dizine eklenir. Özgün anahtar (`horror-director:project:v1`) asla değiştirilmez ya da silinmez.
- **Güvenli geçiş ve kurtarma:** proje değiştirmeden önce bekleyen düzenlemeler kaydedilir; okunamayan depolama verisi
  ezilmek yerine korunur (`horror-director:unreadable:<zaman>`) ve indirilmek üzere sunulur.
- **Birden çok sekme birleştirilmez** (son yazan kazanır); başka bir sekmeden gelen değişiklik algılanır, bir başlık
  gösterilir ve yeniden yükleyene kadar kütüphane işlemleri engellenir.

JSON şeması `README.md` içinde belgelenmiştir ve dilden bağımsızdır (`format: "horror-director"`, `schemaVersion: 1`;
`derived` bloğu içe aktarmada yok sayılır). Türkçe metin (ç, ğ, ı, İ, ö, ş, ü) UTF-8 olarak aynen korunur.

## Dil

Arayüz **İngilizce** ve **Türkçe** olarak sunulur. İlk ziyarette tarayıcı dili kullanılır (`tr*` → Türkçe, diğerleri →
İngilizce); üst çubuktaki **TR | EN** anahtarı sayfayı yenilemeden ve düzenlemeleri kaybetmeden dili hemen değiştirir ve
seçim proje verisinden ayrı hatırlanır. Kendi içeriğiniz (sahne adları, açıklamalar, içe aktarılan metin, örneğin
anlatısı) asla çevrilmez ve dışa aktarılan JSON iki dilde aynıdır.

Çeviri rehberi: kaynak `src/i18n/en.ts` dosyasıdır; `src/i18n/tr.ts`, `Record<MessageKey, string>` olarak tiplendiği
için eksik bir anahtar `npm run typecheck` komutunu başarısız kılar. Mesajlar derleme zamanında denetlenen `{yer
tutucu}` yerleştirmesi kullanır; analiz, doğrulama ve içe aktarma sorunları sözlük üzerinden gösterilen yapılandırılmış
tanılardır (`code` + `params`).

## Test

```bash
npm run typecheck   # tsc (uygulama ve e2e)
npm test            # birim testleri (vitest)
npm run test:e2e    # Playwright tarayıcı testleri (uygulamayı kendisi derler ve sunar)
```

E2E için bir Chromium gerekir: bir kez `npx playwright install chromium` çalıştırın ya da `PW_CHROMIUM_PATH` ile var
olan bir ikili dosyayı gösterin (ör. `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`). Takım üretim
derlemesine karşı Chromium'da çalışır; ekran görüntüsü karşılaştırması yerine test kimliklerini ve DOM geometrisini kullanır.

## Bilinen sınırlamalar

- Simülasyon elle yapılır: otomatik rota sıralaması, olasılık ya da "en iyi yol" yoktur; koşullar yalnızca görüntülenen metindir.
- Zamanlama, her sahnede sahne süresinin tamamının geçirildiğini varsayar; gerçek oynanış zamanlaması farklı olur.
- Ritim eşikleri sabit sezgisel değerlerdir (yalnızca tekrarlanan tür penceresi ve tetikleyicisiz asgari süre ayarlanabilir);
  belirli bir kitleye göre ayarlanmamış ya da oyuncu davranışıyla doğrulanmamıştır. Yoğunluk, ölçülmüş korku değil, yazılmış tasarım niyetidir.
- Yalnızca mevcut rota (ve sabitlenmiş bir rota) analiz edilir ya da karşılaştırılır; rotalar oturumluktur, kaydedilmez ve dışa aktarılmaz.
- Birden çok tarayıcı sekmesi birleştirilmez; bulut eşitlemesi yoktur. Tarayıcı depolaması temizlenebilir, bu yüzden yedek alın.
- Otomatik Düzenle en az kesişimi değil okunabilirliği hedefleyen bir sezgisel yöntemdir; çok yoğun graflarda etiketler yine üst üste binebilir.
- Geri al/yinele geçmişi oturumluktur ve proje değiştirilince temizlenir.
- Unreal tarafında henüz içe aktarıcı yoktur; JSON biçimi yukarıda belgelenmiştir. Üretim paketi kod bölmeli değildir.
- Türkçe metinler oyun sektöründen anadili Türkçe bir editör tarafından gözden geçirilmemiştir; E2E yalnızca Chromium'u kapsar.

## Teknoloji

React 19, TypeScript, Vite, @xyflow/react, Zustand, Zod, lucide-react, Vitest, Playwright. Yerelleştirme için ek bağımlılık yoktur.
