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
- **Blueprint tarzı düzenleyici:** yazılı Giriş/Çıkış pinli sahne düğümleri, yönlü teller, üzerine gelme ve seçim geri
  bildirimi, bırakmadan önce hedefin geçerli olup olmadığını gösteren bağlantı önizlemesi, mini harita, kaydırma/yakınlaştırma
  ve Geri al/Yinele. **EĞER / Dal** düğümlerinin bir girişi ile düzenlenebilir, insan tarafından okunur bir koşullu DOĞRU /
  YANLIŞ çıkışları vardır: gezinme, simülatör, analiz ve Otomatik Düzenle'ye katılırlar; serbest metin koşulu bir hazırlık
  notudur ve **asla değerlendirilmez**. **Yorumlar**, alanları düzenlemek için çalıştırılmayan çerçevelerdir. Bir çıkış pinini boş
  tuvale sürüklemek, düğümü tek bir geri alınabilir adımda oluşturup bağlayan aranabilir bir düğüm seçici açar.
- **Anlatı durumu:** proje başına Doğru/Yanlış **bayraklar** (ad, açıklama, varsayılan DOĞRU/YANLIŞ; kimlikle başvurulur,
  bu yüzden yeniden adlandırmak güvenlidir) proje denetçisinde yönetilir. **Bayrak Ata** düğümü (bir giriş, bir çıkış) bir
  bayrağa DOĞRU ya da YANLIŞ atar. Bir EĞER düğümü ayrıca **yapılandırılmış bir koşul** taşıyabilir (bir bayrağın DOĞRU/YANLIŞ
  olduğunu denetle; VE, VEYA ve DEĞİL ile birleştirilir, iç içe olabilir); koşul erişilebilir bir formla kurulur, betik yoktur.
  Simülatör bayrak durumunu rota boyunca izler, yalnızca yapılandırılmış koşulları değerlendirir ve bir Durum denetçisi
  gösterir. Bayrak Ata ve EĞER düğümleri sıfır süreli planlama mantığıdır, sahne değildir.
- **Özel sahne türleri:** proje başına, yeniden kullanılabilir sahne türleri (ad, seçilmiş renk ve simge, temel tür,
  varsayılan açıklama ve süre). Özel bir sahne, temel türü (gerçeklik, rüya, kâbus, anı, son) geçişleri, simülasyonu ve
  analizi yönlendirmeye devam eden normal bir sahnedir.
- **Bağlam menüleri:** grafik tuvalinde, sahnelerde, EĞER düğümlerinde, yorumlarda ve bağlantılarda; ayrıca Zaman
  çizelgesi/Sekans öğelerinde ve proje satırlarında erişilebilir sağ tık menüleri (Shift+F10 / menü tuşu ve dokunmatikte
  uzun basma ile de). Girdi alanlarında ve metin kutularında tarayıcının kendi sağ tık menüsü korunur.
- **Otomatik Düzenle:** sahnelerin soldan sağa, belirleyici (deterministik) yerleşimi. Yalnızca düğmeye bastığınızda
  çalışır, yalnızca sahne konumlarını değiştirir ve tek bir geri al/yinele adımıdır.
- **Döngüler:** kendine döngüler, sahne başına döngü ayarları (en çok yineleme, çıkış koşulu) ve otomatik döngü tespiti.
- **Korku zaman çizelgesi:** sahne başına tetikleyici izi; sürüklenebilir işaretçiler, yoğunluk (0–10), tetikleyici
  türleri (jumpscare, ses, görsel, YZ, çevre, anlatı), koşullar ve bir kez tetikleme seçeneği.
- **Sinematik sekans:** Zaman çizelgesi sekmesindeki salt okunur **Sekans** modu; bir sahnenin çekimlerini, ses ipuçlarını ve
  tetikleyicilerini ortak bir zaman ekseninde (Kamera, Ses ve Korku olayları izleri) sahne sonu sınırı, katmanlı ses, zaman
  imleci, ayrıntılar, zaman sıralı liste ve yakınlaştırmayla gösterir. Mevcut veriden türetilir (hiçbir şey saklanmaz),
  simülasyon değil yazılmış planlama zamanlamasını gösterir ve değişiklikler için mevcut düzenleyicileri açar.
- **Karakterler:** saldırganlık düzeyli davranış durumları ve sahne × karakter matrisi.
- **Analiz:** yapısal kontroller (başlangıç yok, ulaşılamayan sahneler, çıkmaz sokaklar, çıkışsız kapalı döngüler,
  kaçılamayan rüyalar, sahne süresini aşan tetikleyiciler, eski referanslar) ve proje istatistikleri.
- **Hikâye rotası simülatörü:** geçişleri seçerek grafikte bir rota izleyin (Geri / Baştan başlat). Rotanın finale mi
  ulaştığını, çıkmaza mı girdiğini, tamamlanmamış mı olduğunu ya da bir sınırda mı durduğunu bildirir; planlanan
  tetikleyicileri yazılmış yoğunluklarıyla mutlak zaman grafiğinde ve rota istatistikleriyle gösterir.
- **Ritim analizi:** simüle edilen rota hakkında tarafsız, belirleyici gözlemler (aşağıya bakın).
- **Rota karşılaştırması:** bir rotayı Rota A olarak sabitleyin, Rota B'yi oluşturun ve yan yana karşılaştırın (aşağıya bakın).
- **Çekim planlayıcı:** sahne başına sıralı sinematik çekim notları (kadraj, kamera hareketi, psikolojik teknik, ses ve
  görsel notlar, sahneye göre başlangıç/süre); sahne denetçisinden açılır. Yalnızca planlama notlarıdır — tetikleyicilerden
  ve geçişlerden bağımsızdır, çakışma ve taşmaları uyarır ve zamanlamanızı asla değiştirmez.
- **Geçiş tasarımcısı:** geçiş başına isteğe bağlı yönetmen notları — psikolojik teknik (gerçeğin ortaya çıkışı dahil),
  oyuncunun inandığı ile gerçekte olanın karşılaştırması, açığa çıkış, görsel/ses sürekliliği, Unreal notları ve kaynak ile
  hedef sahnelerin planlarına bağlantılar; önce → geçiş → sonra önizlemesiyle. Yalnızca planlama verisidir: asla
  değerlendirilmez, geçişin stilinden, koşulundan ve süresinden bağımsızdır.
- **Ses planlayıcı:** sahne başına sıralı ses ipuçları (ambiyans, müzik, ses efekti, konuşma, fısıltı, stinger, sessizlik);
  sahneye göre başlangıç/süre, diegetik / non-diegetik / belirsiz kaynak, uzamsal yön (uzamsız, ön, arka, sol, sağ, üst,
  hareketli), betimleyici hedef seviye, fade'ler, döngü, varlık referansı, yönlendirme notları ve isteğe bağlı metinden sese
  brif; sahne denetçisinden katmanlı bir zaman çizelgesiyle açılır. Yalnızca planlama notlarıdır — çalma, uzamsallaştırma,
  üretim ya da motor komutu yoktur; tetikleyicilerden, sahne ambiyansından, plan ses notlarından ve ritimden bağımsızdır.
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

1. **Grafiği kurun.** Grafiğin üzerindeki araç çubuğundan sahne ekleyin ya da tuvale sağ tıklayın (**Sahne ekle**, **Özel
   sahne ekle**, **EĞER / Dal ekle**, **Yorum / Not ekle**, aranabilir liste için **Düğüm ekle…**). Bağlamak için bir düğümün
   **sağ** pininden başka bir düğümün **sol** pinine sürükleyin; bir düğümü kendine bağlayarak döngü yapın. Bir pinden boş
   tuvale sürüklerseniz seçeceğiniz yeni düğüm otomatik bağlanır. Bir bağlantıya sağ tıklayıp içine EĞER düğümü ekleyin.
   **EĞER / Dal** düğümünün bir DOĞRU ve bir YANLIŞ çıkışı vardır (her birine bir bağlantı): koşulu kendi sözlerinizle yazın,
   çıkışları sahnelere bağlayın ve Simülatörde kullanın; DOĞRU ya da YANLIŞ'ı kendiniz seçersiniz — seçim bir varsayım olarak
   gösterilir, EĞER düğümü sahne süresi harcamaz ve fazladan ziyaret ya da tetikleyici eklemez. Hikâye durumunu modellemek için proje denetçisinde (hiçbir şey seçili değilken)
   **bayrak** oluşturun, bir **Bayrak Ata** düğümü ekleyin (**Bayrak Ata ekle**, seçici ya da pinden sürükleme), bayrağını ve
   DOĞRU/YANLIŞ değerini seçin, EĞER düğümünün denetçisinde ona **yapılandırılmış koşul** verin. Yeniden kullanılabilir
   **Sahne türleri**ni proje denetçisinde (hiçbir şey seçili değilken) tanımlayın. Bir öğeyi seçip `Del` ile silin
   (bağlantıları tek bir geri alma adımında onunla gider). Başlangıç sahnesini sahne denetçisinden belirleyin. **Örnek**, rüya katmanları, bir döngü ve iki final
   içeren "The Hollow Apartment" demo projesini yükler (İngilizce yazılmıştır).
2. **Korku anlarını planlayın.** **Zaman çizelgesi**nde, belirli bir zaman ve yoğunlukta tetikleyici eklemek için izi
   çift tıklayın; zamanını değiştirmek için işaretçileri sürükleyin.
   Sahnenin çekimlerini, ses ipuçlarını ve tetikleyicilerini birlikte görmek için Zaman çizelgesini **Sekans**a geçirin:
   bir sahne seçin, bir öğeyi seçin (tıklayın ya da Tab ve Enter) ve ayrıntılarını görün, zaman imleci o ana gelir; uzun
   sahneler için Sığdır / yakınlaştırmayı kullanın; ayrıntılardaki düğmeyle öğeyi Çekim planlayıcıda, Ses planlayıcıda ya da
   tetikleyici düzenleyicide açın. Sahne sonunu aşan öğeler yazdığınız yerde kalır (eksen uzar ve not gösterilir); koşullu
   tetikleyiciler oyunda hiç çalışmayabileceği için koşullu olarak işaretlenir. Katmanlı ses ve sessizlik normaldir, hata değildir.
3. **Karakterleri izleyin** (**Karakterler**) ve yapıyı **Analiz**de kontrol edin.
4. **Rota simüle edin** (**Simülatör**): bulunduğunuz sahneden geçişleri seçin. Serbest metin koşulları (geçişlerde,
   tetikleyicilerde ve EĞER düğümlerinde) *asla değerlendirilmez*; o geçişi seçerek yaptığınız varsayımlar olarak gösterilir.
   - Bayraklar varsayılanlarıyla başlar ve rota bir Bayrak Ata düğümünden geçince, rota sırasıyla değişir; Durum denetçisi
     güncel değerleri listeler. Yapılandırılmış koşullu EĞER, değerlendirilen sonucu gösterir: eşleşen çıkış *koşulla uyumlu*
     işaretlenir, diğeri açık bir *geçersiz kılma (ya şöyle olsaydı)* olarak seçilebilir kalır; sayılır ve işaretlenir
     (rota karşılaştırmasında da). Rotanız asla sessizce değiştirilmez. Bayrak durumu her yeniden oynatmada, Geri'de,
     Yeniden başlat'ta ve grafik düzenlemesinde baştan hesaplanır ve asla kaydedilmez.
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
7. **Çekimleri planlayın:** bir sahneyi seçin ve denetçide **Çekim planlayıcı**yı açın. Plan ekleyin; başlangıç/süreyi
   (sahne başından saniye), kadrajı, kamera hareketini, psikolojik/gerçeklik tekniğini ve ses/görsel notları belirleyin;
   çoğaltın, yukarı/aşağı taşıyın ya da silin. Uyarılar üst üste binen planları, sahne bittikten sonra biten planları ve
   başlangıcı önceki plandan önce olan planları işaretler; hiçbir şey otomatik değiştirilmez. **Zamana göre sırala** listeyi
   yeniden sıralar (zamanlama değişmez). Liste yazılış sırasını gösterir; dışa aktarma sırası da budur. Geri al/yinele her
   değişikliği kapsar.
8. **Geçişleri tasarlayın:** bir geçişi seçin (etiketine tıklayın) ve denetçide **Geçişi tasarla**yı açın. Tasarıma başlayın,
   bir teknik seçin, oyuncunun neye inandığını, gerçekte neyin olduğunu ve açığa çıkışı yazın, süreklilik ve Unreal notları
   ekleyin; isteğe bağlı olarak kaynak sahneden bir planı ve hedef sahneden bir planı bağlayın (kendine döngülerde ikisi de
   aynı sahneden seçilir). Önizleme önce → geçiş → sonra akışını gösterir. Bir geçişin bağladığı planı silmek onay ister ve
   bağlantıyı aynı geri alma adımında temizler; **Tasarımı temizle** tasarımı kaldırır.
9. **Sesi planlayın:** bir sahneyi seçin ve denetçide **Ses planlayıcı**yı açın. İpucu ekleyin; tür, kaynak, uzamsal yön,
   başlangıç/süre (sahne başından saniye), hedef seviye (0–10; ölçülmüş şiddet değil, planlama değeri), fade'ler, döngü,
   varlık referansı, yönlendirme notları ve isteğe bağlı metinden sese brif girin; çoğaltın, yukarı/aşağı taşıyın ya da
   silin. Zaman çizelgesi her ipucunu katmanlı bir çubuk olarak gösterir: üst üste binen ipuçları normaldir ve yalnızca
   daha fazla katman kullanır; sessizlik ipuçları taramalı çizilir ve yazarın niyetini temsil eder (diğer ipuçlarını
   susturmaz). Uyarılar sahne bittikten sonra biten ipuçlarını ve ipucundan uzun fade'leri işaretler; hiçbir şey otomatik
   değiştirilmez. Uzamsal fikirler (oyuncunun arkasında fısıltı, soldan sağa giden ses, aniden kaybolan ambiyans, kaynağı
   belirsiz uzak ses, sessizliğin ardından stinger) yapılandırılmış alanlar ve notlarla anlatılır. Geri al/yinele her değişikliği kapsar.
10. **Yedekle** düğmesini düzenli kullanın — tarayıcı depolaması temizlenebilir.

Simülasyon, ritim ve karşılaştırma durumu projeden ayrıdır: proje verisini, otomatik kaydı, kütüphaneyi ya da geri al
geçmişini değiştirmez, dışa aktarılmaz ve proje değiştirdiğinizde sıfırlanır.

## Veri depolama, yedekler ve JSON uyumluluğu

- **Depolama** (tarayıcı `localStorage`): `horror-director:library:v1` (dizin), `horror-director:proj:<id>` (proje başına
  bir kayıt), `horror-director:lang` (dil). Kimlikler dahilidir ve adlardan bağımsızdır. Kütüphane verisi (kimlikler,
  zaman damgaları, etkin proje) proje JSON'una asla yazılmaz.
- **Yedek**, *etkin* projeyi şema 6 dışa aktarma biçiminde indirir. İçe aktarma katı doğrulama yapar (yinelenen
  kimlikler, boşta kalan referanslar, geçersiz değerler, tanınmayan alanlar, daha yeni şema sürümleri hatadır ve hiçbir şey
  değiştirilmeden önce gösterilir). Bir dosya yeni proje olarak ya da onayla etkin projenin yerine aktarılabilir.
- **Eski dosyalar ve veriler:** şema 1'den şema 5'e kadar dışa aktarmalar ile yalın proje dosyaları hâlâ içe aktarılır; eksik
  çekim planları, ses ipuçları, EĞER düğümleri, yorumlar, sahne türleri ve bayraklar boş liste olarak başlar, eksik geçiş yönlendirmeleri yok olarak kalır (şema 1/yalın dosyalar
  için bilgilendirici bir not çıkar) ve sonraki yedek, diğer tüm alanlar değişmeden şema 6 olur. Önceki sürümlerden kalan kayıtlı projeler aynı
  şekilde okunur ve yalnızca siz düzenleyince yeniden yazılır. Proje kayıtları `{ v: 6, project }` olarak saklanır (eski
  `v: 1`–`v: 5` kayıtlar hâlâ okunur); yeni alanları okuyamayan eski bir sürüm böyle bir kaydı hasarlı gösterir ve veriyi
  atmak yerine korur. Sürüm düşürme desteklenmez.
- **Taşıma:** erken sürümlerin tek projelik depolaması doğrulanır, `legacy` kimliğiyle kütüphaneye kopyalanır, kontrol
  edilir ve ancak ondan sonra dizine eklenir. Özgün anahtar (`horror-director:project:v1`) asla değiştirilmez ya da silinmez.
- **Güvenli geçiş ve kurtarma:** proje değiştirmeden önce bekleyen düzenlemeler kaydedilir; okunamayan depolama verisi
  ezilmek yerine korunur (`horror-director:unreadable:<zaman>`) ve indirilmek üzere sunulur.
- **Birden çok sekme birleştirilmez** (son yazan kazanır); başka bir sekmeden gelen değişiklik algılanır, bir başlık
  gösterilir ve yeniden yükleyene kadar kütüphane işlemleri engellenir.

JSON şeması `README.md` içinde belgelenmiştir ve dilden bağımsızdır (`format: "horror-director"`, `schemaVersion: 6`, sahnelerde `shots` ve `audioCues` dizileri, projede `logicNodes` (`branch` ve `setFlag`; EĞER'de isteğe bağlı `expression`), `flags`, `comments` ve `sceneTypes`, bağlantılarda isteğe bağlı `sourcePort`, geçişlerde isteğe bağlı `direction` nesnesi;
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

- Simülasyon elle yapılır: otomatik rota sıralaması, olasılık ya da "en iyi yol" yoktur; serbest metin koşulları yalnızca görüntülenir; yalnızca yapılandırılmış bayrak koşulları ve yalnızca simülatörde değerlendirilir.
- Zamanlama, her sahnede sahne süresinin tamamının geçirildiğini varsayar; gerçek oynanış zamanlaması farklı olur.
- Ritim eşikleri sabit sezgisel değerlerdir (yalnızca tekrarlanan tür penceresi ve tetikleyicisiz asgari süre ayarlanabilir);
  belirli bir kitleye göre ayarlanmamış ya da oyuncu davranışıyla doğrulanmamıştır. Yoğunluk, ölçülmüş korku değil, yazılmış tasarım niyetidir.
- Yalnızca mevcut rota (ve sabitlenmiş bir rota) analiz edilir ya da karşılaştırılır; rotalar oturumluktur, kaydedilmez ve dışa aktarılmaz.
- Birden çok tarayıcı sekmesi birleştirilmez; bulut eşitlemesi yoktur. Tarayıcı depolaması temizlenebilir, bu yüzden yedek alın.
- Otomatik Düzenle en az kesişimi değil okunabilirliği hedefleyen bir sezgisel yöntemdir; çok yoğun graflarda etiketler yine üst üste binebilir.
- Çekim planları basit bir liste halinde planlama notlarıdır: storyboard görseli, kamera zaman çizelgesi düzenleyicisi ya da
  motor/Unreal içe aktarımı henüz yoktur. Liste yazılış sırasını korur; zamana göre sıralama açık bir eylemdir.
- Serbest metin koşulları planlama notlarıdır ve asla ayrıştırılmaz ya da değerlendirilmez. Yalnızca Doğru/Yanlış bayraklar
  üzerindeki yapılandırılmış EĞER koşulları ve yalnızca simülatörde değerlendirilir (bir oyunda hiçbir şey çalıştırılmaz);
  sayısal değişken, betik, ayrı VE/VEYA/DEĞİL düğümleri, olay, gecikme, rastgele dal, yönlendirme (reroute) düğümü ya da
  panodan yapıştırma yoktur. Bayrak Ata düğümünün bir girişi ve bir çıkışı vardır; EĞER ya da Bayrak Ata düğümüne dokunan
  bağlantılar geçiş tasarımı taşıyamaz.
- Sekans görünümü türetilmiş bir özettir: çalma, dalga biçimi ya da simülasyon yoktur, öğeleri kendisi düzenleyemez, seçim, yakınlık
  ve imleci yalnızca oturum boyunca tutar ve koşullu tetikleyicileri değerlendirmek yerine koşullu olarak işaretler.
- Ses ipuçları planlama notlarıdır: çalma, dalga biçimi, 3B uzamsallaştırma, yapay zekâ üretimi ya da motor/Unreal çalışma
  zamanı komutu ve varlık kütüphanesi yoktur. İpuçları tetikleyicilerden bağımsızdır ve ritim istatistiklerini etkilemez.
- Geçiş yönlendirmeleri planlama notlarıdır: üretilmiş görsel, animasyon ya da 3D önizleme yoktur ve Unreal'de çalıştırılmaz.
  Kayıtlı projeler yüklenirken şema denetimine girer ama bütünlük denetimine girmez (eksik bir plana bağlantı tasarımcıda
  işaretlenir ve temizlenebilir; içe aktarma bunu reddeder).
- Geri al/yinele geçmişi oturumluktur ve proje değiştirilince temizlenir.
- Unreal tarafında henüz içe aktarıcı yoktur; JSON biçimi yukarıda belgelenmiştir. Üretim paketi kod bölmeli değildir.
- Türkçe metinler oyun sektöründen anadili Türkçe bir editör tarafından gözden geçirilmemiştir; E2E yalnızca Chromium'u kapsar.

## Teknoloji

React 19, TypeScript, Vite, @xyflow/react, Zustand, Zod, lucide-react, Vitest, Playwright. Yerelleştirme için ek bağımlılık yoktur.
