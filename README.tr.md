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
- **Akış kontrolü:** üç düğüm daha sahne değildir ve aynı bağlantı kurallarını paylaşır. **Olay** düğümü (başlık, açıklama,
  kategori: hikâye anı, ortaya çıkış, tehdit, rahatlama, karar, özel; bir giriş, bir çıkış) yazılmış bir anlatı kilometre
  taşıdır: simüle edilen rota ondan geçince rota saatine damgalanır. **Bekleme** düğümü (bir giriş, bir çıkış, 0 ile 3600
  saniye arası süre, planlama notları) sahne ziyaretleri *arasına* bekleme süresi ekler. **Rastgele Dal** düğümünün bir girişi
  ve düzenlenebilir sonuç etiketleri olan **A** ve **B** adlı iki çıkışı ile %0–%100 arası A olasılığı vardır (B, 100 − A).
  Olaylar oynanış geri çağrısı değildir: sahne tetikleyicilerinden ve ses ipuçlarından ayrıdır, tetikleyici sayılarını, ritim
  yoğunluğunu ya da sahne verisini asla değiştirmez. Olay ve Bekleme çıkışları tek bağlantı kabul eder, Rastgele Dal çıkışlarının
  her biri bir bağlantı; yalnızca mantık düğümlerinden geçen ve sahneye uğramayan döngüler reddedilir. Üçü de bağlam menüsü
  ve seçici, pinden sürükleyerek oluşturma, Denetçi, kopyala/yapıştır/çoğalt, çoklu seçim, geri al/yinele, Otomatik Düzenle,
  yönlendirme noktaları, erişilebilirlik analizi ve mini harita ile çalışır.
- **Sıralı Sıra düğümü:** **Sıra** düğümünün bir girişi ve üç çıkışı vardır: **Sonra 0**, **Sonra 1** ve **Tamamlandı**. Önce
  Sonra 0 alt akışını çalıştırır, Sıraya döner, Sonra 1 alt akışını çalıştırır, yine döner ve ancak ondan sonra Tamamlandı ile normal
  hikâyeye devam eder. Sonra çıkışları birbiri ardına çalışan iki aşamadır, asla alternatif dallar değildir (tam iki aşama; iç içe
  geçme ya da paralel yürütme yoktur). Bir aşama, kendi **Sıra Dönüşü** ile biten düz bir **Olay, Bekleme ve Bayrak Ata** hattıdır
  (Dönüşün bir girişi vardır, çıkışı yoktur; hangi Sıraya ve hangi aşamaya ait olduğunu bilir). Aşamanın içinde sahne, EĞER, Rastgele
  Dal ve iç içe Sıra düğümlerine izin verilmez; bir aşamaya yalnızca kendi Sonra çıkışından girilir ve yalnızca kendi Dönüşüyle çıkılır,
  düzenleyici diğer bağlantıları nedenini söyleyerek reddeder. Henüz bağlanmamış ya da kapatılmamış bir çıkış ya da aşamaya düzenleme
  sırasında izin verilir, düğümde ve Denetçide *Eksik* olarak işaretlenir ve simülatör onu asla bitmiş saymaz. Sıra ve Dönüş süre harcamaz;
  tam bir Sıra alt grafiğini kopyalamak aşama ve sahip bağlantılarını korur.
- **Özel sahne türleri:** proje başına, yeniden kullanılabilir sahne türleri (ad, seçilmiş renk ve simge, temel tür,
  varsayılan açıklama ve süre). Özel bir sahne, temel türü (gerçeklik, rüya, kâbus, anı, son) geçişleri, simülasyonu ve
  analizi yönlendirmeye devam eden normal bir sahnedir.
- **Bağlam menüleri:** uygulamanın içinde sağ tık her yerde uygulamaya aittir, tarayıcının yerel menüsü hiç görünmez. Özel
  menüler grafik tuvalini, sahneleri, EĞER düğümlerini, yorumları, bağlantıları, yönlendirme noktalarını, Zaman çizelgesi/Sekans
  öğelerini ve proje satırlarını kapsar; diğer her bölge (üst çubuk, sekmeler, boş paneller, pencereler, Üretim çalışma alanı) genel
  bir uygulama menüsü alır (seçili metni kopyala, geri al/yinele, sekmeye git, yedekle, projeler, dil). Metin kutuları ve metin
  alanları, seçimi, imleci ve tarayıcının kendi geri almasını koruyan uygulama temalı **Kes / Kopyala / Yapıştır / Tümünü seç** menüsü
  alır. Pano tarayıcı iznine bağlıdır: tarayıcı engellerse ya da yoksa öğe bunu söyler (Yapıştır devre dışı kalır ve Ctrl/Cmd+V'yi
  belirtir) ve bir mesaj ne olduğunu açıklar; sessizce hiçbir şey yapmayan öğe yoktur. Shift+F10 / Menü tuşu, kapatmak için Escape,
  gezinmek için ok tuşları ve dokunmatikte uzun basma da çalışır. Yalnızca uygulamanın içindeki hedefler işlenir; tarayıcı kabuğuna dokunulmaz.
- **Üretim planlayıcı:** **Üretim** sekmesi etkin projeyi **Unreal Engine 5.x** (Blueprint öncelikli) ya da **Unity 6** (C# ve
  bileşenler) için bir uygulama planına dönüştürür. Saf, deterministik bir planlama çekirdeği yazılmış grafın tamamını okur (tek bir
  simüle rota değil, her dal ve her son) ve motor adaptörü motor eşlemesini ekler. Önizleme ve indirmeler
  (`production-plan-unreal.md` / `production-plan-unity.md` ve motora özel görev CSV'si `production-tasks-<motor>.csv`) 14 bölümden
  oluşur: özet ve varsayımlar, sahne/seviye envanteri, graf ve geçişler, bayraklar, EĞER ve Rastgele Dal, Olay/Bekleme/Sıra, çekimler,
  ses, karakterler, korku tetikleyicileri, varlıklar ve eksik bağımlılıklar, kilometre taşları, görevler ve doğrulama listesi. Her görevin
  kaynak kimliklerinden türeyen kararlı bir kimliği, aşaması, kaynak sahne/düğüm/geçiş/tetikleyici kimlikleri, motor kavramı, uygulama
  yönergesi, bağımlılıkları, Bitti Tanımı ve eksik bilgileri vardır. Anlamlar korunur: Sahne → mantık → Sahne sıçramaları, Sıra düzeni
  Sonra 0 → Dönüş 0 → Sonra 1 → Dönüş 1 → Tamamlandı, Bekleme sahneler *arası* ek süre olarak, Olay planlama kilometre taşı olarak
  (mevcut bir geri çağrı değil), Rastgele olasılıklar tasarım niyeti olarak, yapılandırılmış koşullar serbest metin varsayımlardan ayrı
  ve geçiş yönü notlarından oyuncunun inancı ile gerçeklik farkı. Ulaşılamayan sahneler ve eksik yazım listelenir, eksik ayrıntılar
  **TBD** olarak işaretlenir. Sınıf, varlık ve dosya adları *önerilerdir*; kod üretilmez ve **hiçbir Unreal ya da Unity çalışma zamanı
  entegrasyonu yapılmaz**. Planlayıcı salt okunurdur: projeyi, kütüphaneyi, otomatik kaydı ya da geri alma geçmişini asla değiştirmez.
- **Görev devri:** Üretim sekmesi tüm görevleri bağımlılık sırasıyla (ihtiyaç duyan ses ve karakter görevlerinden önce varlıklar, tüketicilerden önce ortak sistemler, en sonda doğrulama) aşama, kaynak türü ve hazırlık filtreli aranabilir bir görev gezgininde de listeler. Hazırlık **Hazır**, **Bilgi gerekli** (temel bir yazılmış girdi eksik; örneğin koşulsuz EĞER, eksik Sıra aşaması, bağlanmamış çıkış, varlık referansı olmayan ipucu ya da ulaşılamayan sahne) veya **Bağımlılıklar engelliyor** olur; yalnızca yazılmış veriden türetilir ve hiçbir şeyin uygulandığı anlamına gelmez: uygulama bir oyun motoruna bağlı olmadığı için uygulama durumu her zaman bilinmiyordur. Görevin ayrıntıları eksik gereksinimlerini ve onaylanacak öğeleri, kaynak kimliklerini (sahneyi, düğümü ya da geçişi grafikte açmak için tıklayın) ve bağımlılıklarını ile ona bağlı görevleri gösterir. Seçili görev için tam yazılmış veriyi — çekimler ve yön notları, ipucu zamanlaması, uzamsal yön, geçişler, sessizlik ve varlık referansları, graf pinleri, bayraklar, yapılandırılmış EĞER metni, Rastgele olasılıkları, Olay ve Bekleme verisi, Sıra aşama düzeni, karakter durumları, tetikleyici zamanı ve şiddeti — ayrıca önerilen sınıf ve varlıkları, sıralı adımları, uç durumları, kabul testlerini, eksik bilgileri ve dışlamaları içeren bir **uygulama özeti indirebilir** (Markdown) ve Unreal ya da Unity projenizde çalışan Claude Code veya Codex için bir **kodlama ajanı istemi kopyalayabilirsiniz** (önce incele, var olanı doğrula, yalnızca bu görevi uygula, yazılmış davranışı koru, motor kontrollerini çalıştır, raporla). Görev kimlikleri yalnızca görevin sorumluluğuna ve kaynağına bağlıdır, zamanlamaya değil. Sahne başına yazdığınız Unreal `/Game/...` metni yalnızca Unreal planlarında, doğrulanmamış bir referans olarak gösterilir; Unity planları önerilen bir sahne yolu gösterir. Gezgin seçimi ve filtreler yalnızca oturumludur ve projeyi asla değiştirmez.
- **Üretim takibi:** her görevin ayrıca sizin kaydettiğiniz bir **uygulama ilerlemesi** vardır (Başlanmadı, Sürüyor, İncelemeye gönderildi, Doğrulandı / onaylandı, Engelli); notlar ve kısa bir geçmişle birlikte, yazım hazırlığının yanında — ondan asla türetilmeden — gösterilir. İlerleme panosu durum başına görev sayar, eski ya da başlamaya hazır (yazılan bilgi hazır ve tüm bağımlılıklar doğrulanmış) görevleri listeler ve gezgini filtreler. İlerleme bu tarayıcıda **projeden ve tüm proje dışa aktarımlarından ayrı**, kütüphane projesi ve motor başına saklanır; böylece Unreal ve Unity ilerlemesi ile farklı projeler asla karışmaz. Projeyi çoğaltmak ilerlemesini kopyalar, projeyi silmek ilerlemesini dışa aktarabileceğiniz ya da kaldırabileceğiniz sahipsiz bir kayıt olarak saklar. **Kaynak tazeliği:** bir görevi göndermek ya da onaylamak, dayandığı yazılmış verinin parmak izini yakalar; kullandığı sahneler, geçişler, EĞER metni, Rastgele olasılıkları, Olay/Bekleme değerleri, Sıra aşamaları, çekimler, ses ipuçları, karakter durumları ya da tetikleyiciler sonradan değişirse görev neyin değiştiğini listeleyen bir **ESKİ** rozeti gösterir (düğüm taşımak, tel noktaları, dil ya da ilgisiz sahneler sayılmaz), kayıtlı durumunu ve kanıtlarını korur, yeniden onaylanmadan önce açık bir onay ister ve yeniden kontrol gerekebilecek sonraki görevleri işaretler. **Ajan raporları:** kodlama ajanı istemi ajandan küçük bir JSON tamamlama raporu ister; görev, motor ve projeye karşı sıkı doğrulanan raporu önizlemek için yapıştırın ya da yükleyin (veya elle girin) ve göreve kaydedin. Rapordaki her şey ajanın iddiasıdır — dosya yolları denetlenmez, bildirilen test sonuçları kanıt değildir — ve rapor görevi asla onaylamaz: yalnızca sizin açık ve onaylı incelemeniz Doğrulandı yapar. İlerleme raporunu (Markdown) ve geri yüklenebilir JSON ilerleme yedeğini indirebilir; yedeği önizleme, kayıt başına çakışma seçimi ve onayla geri yükleyebilirsiniz. Bozuk ilerleme verisi olduğu gibi saklanır, depolama hataları çalışmanızı bellekte tutar ve yeniden deneme ile yedek sunar, aynı ilerlemeyi değiştiren ikinci bir sekme ezilmek yerine algılanır.
- **Kapsamlı örnekler:** **Projeler → Örnek ekle**, arayüz dili ne olursa olsun seçebileceğiniz, yapısı birebir aynı iki eksiksiz örnek sunar:
  **Türkçe Örnek Proje — Boş Köy** (tamamen Türkçe yazılmış) ve **English Sample Project — The Hollow Village**. Her biri yeni bir proje
  oluşturur (mevcut çalışmanın üzerine asla yazmaz): beş sahne türünün hepsi, özel bir sahne türü, birkaç durumlu üç karakter, tetikleyiciler, çekimler, uzamsal ses, geçiş
  yönü notları, sınırlı bir döngü, yapılandırılmış AND/OR/NOT koşullu bir EĞER, Bayrak Ata düğümleri, Olay, Bekleme, Rastgele Dal,
  iki Dönüşlü eksiksiz bir sıralı Sıra, yönlendirme noktaları ve grafik yorumları içeren bir yanlış uyanma hikâyesi. İki varyant
  aynı grafı, kimlikleri, süreleri ve bayrak mantığını paylaşır; bu yüzden Unreal ve Unity planları ikisi için de aynı derecede geçerlidir.
  Grafikteki kapatılabilir **Örneği keşfet** rehberi (örneğin kendi dilinde) her özelliğin nerede olduğunu gösterir ve proje verisi olmayan editör etkileşimlerini
  (geri al/yinele, kopyala/yapıştır, çoklu seçim, bağlam menüleri) anlatır.
- **Yönlendirme noktaları:** bir bağlantıya sağ tıklayın → **Yönlendirme Noktası Ekle** (ya da bağlantı denetçisindeki
  düğmeleri kullanın), teli şekillendirmek için noktaları sürükleyin, bir noktaya sağ tıklayın → **Noktayı Kaldır**. Bir
  bağlantıda birden çok nokta (en çok 16) olabilir; sahne, EĞER ve Bayrak Ata bağlantılarının hepsinde çalışır. Noktalar yalnızca
  telin nasıl çizildiğini değiştirir: uçlar, pinler, kimlikler, koşullar ve tasarım notları aynı kalır; simülasyon, analiz,
  ritim ve karşılaştırma onları yok sayar.
- **Seçim ve verimlilik:** Ctrl/Cmd-tık ya da Shift+sürükleme (veya Seç/Kaydır düğmesi) birden çok sahneyi, EĞER/Bayrak Ata
  düğümünü ve yorumu seçer; birlikte taşınır, kopyalanır, çoğaltılır ve silinir, her toplu işlem tek geri alma adımıdır.
  **Kopyala / Yapıştır / Çoğalt** (Ctrl/Cmd+C, V, D; bağlam menülerinde de) grafiğe ve projeye özeldir: bağlantılar yalnızca iki
  ucu da kopyalandıysa kopyalanır, tüm kimlikler yeniden üretilir (çekimler, ses ipuçları, tetikleyiciler ve çekime bağlı
  yönlendirme notları dâhil), pinler ve bayrak başvuruları geçerli kalır, yapıştırma imlecin olduğu yere yapılır. **Seçime Sığdır**,
  **Seçime Ortala**, Tümünü Seç ve `F`, büyük grafiklerde yardımcı olur. Kısayollar bir alana yazarken asla çalışmaz.
- **Otomatik Düzenle:** sahnelerin ve mantık düğümlerinin soldan sağa, belirleyici (deterministik) yerleşimi. Yalnızca düğmeye
  bastığınızda çalışır, yalnızca konumları değiştirir (bağlantılardaki yönlendirme noktaları temizlenir, geri alma onları geri
  getirir) ve tek bir geri al/yinele adımıdır.
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
   DOĞRU/YANLIŞ değerini seçin, EĞER düğümünün denetçisinde ona **yapılandırılmış koşul** verin. **Olay ekle**, **Bekleme ekle** ve **Rastgele Dal ekle** (menü, seçici, palet ya da pinden sürükleme) akış kontrolü düğümlerini oluşturur; kategori, süre, etiket ve olasılığı denetçide düzenleyin. Yeniden kullanılabilir
   **Sahne türleri**ni proje denetçisinde (hiçbir şey seçili değilken) tanımlayın. Bir öğeyi seçip `Del` ile silin
   (bağlantıları tek bir geri alma adımında onunla gider). Başlangıç sahnesini sahne denetçisinden belirleyin. **Projeler → Örnek ekle**, her özelliği gösteren eksiksiz bir demo olan
   "The Hollow Village (Showcase)" ya da Türkçe ikizi "Boş Köy (Vitrin Örneği)" projesini yeni bir proje olarak oluşturur (kendi çalışmanıza dokunulmaz).
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
   - Bir **Bekleme** saniyelerini rota saatine tam olarak bir kez, geçiş sırasıyla ekler: sonraki sahne yalnızca daha geç
     başlar (sahne ve bağlantı süreleri değişmez) ve sahne-yerel tetikleyicileri onunla kayar. Bir **Olay**, mutlak rota
     zamanıyla damgalanır. İkisi de sahne ziyareti ya da tetikleyici oluşumu değildir. **Akış izi** olayları, bekleme
     başlangıç/bitişini, EĞER seçimlerini, Bayrak Ata atamalarını ve Rastgele kararları kronolojik listeler.
   - Bir **Sıra**, beklediği aşamayı gösterir: rota yalnızca Sonra 0'ı, ardından (Dönüşünden sonra) Sonra 1'i, en sonunda
     Tamamlandı'yı izleyebilir. Her bağlantı yine sizin açık seçiminizdir ve Dönüş kendi başına bir seçim istemeden denetimi geri verir;
     aşamadaki Bekleme saniyeleri bir kez sayılır, Olay ve Bayrak Ata etkileri sırasını korur ve Akış izi *Sıra başladı*, *aşama girildi*,
     *aşama döndü* ve *Sıra tamamlandı* girdilerini ekler. Geri, Yeniden başlat ve grafik düzenlemeleri konumu seçilen bağlantılardan yeniden
     kurar; Sırayı yeniden ziyaret etmek onu baştan başlatır. Devam edemeyen bir aşama atlanmaz, bildirilir.
   - **Rastgele Dal**'da A ya da B'yi kendiniz seçersiniz (*ya olursa* olarak işaretlenir) ya da **Sonuç çek**'e basarsınız:
     tohumlu bir çekiliş (tohum yalnızca oturumluk bir alandır) sonucu siz onaylayana kadar yalnızca önizler. Aynı tohum ve karar her
     zaman aynı çekilişi verir; Geri, yeniden oynatma, proje düzenlemesi ya da yeniden yükleme hiçbir şeyi yeniden çekmez.
     Seçilen bağlantı rotada diğer seçimler gibi saklanır; çekilişin tohumu oturumluk kaynak bilgisidir (kaydedilmez, dışa
     aktarılmaz) ve rota karşılaştırması çekilen ile elle seçilen sonuçları ayrı sayar. Tek bir simüle rota yazılmış olasılığı doğrulamaz.
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
10. **Motor işini planlayın** (**Üretim**): Unreal Engine 5.x ya da Unity 6'yı seçin, önizlemeyi okuyun, listelenen boşlukları
    ve TBD işaretlerini kontrol edin, Markdown planını ve görev CSV'sini indirin. Görev gezgininde görevleri arayıp filtreleyin,
    kaynaklarını grafikte açın, uygulama özetini indirin ya da kodlama ajanı istemini kopyalayın. Projenizde hiçbir şey değişmez.
    Her görevin ilerlemesini kaydedin, ajanın tamamlama raporunu yapıştırın, kendiniz inceleyip onaylayın ve tasarım sonradan
    değişirse ESKİ rozetine dikkat edin.
11. **Yedekle** düğmesini düzenli kullanın — tarayıcı depolaması temizlenebilir.

Simülasyon, ritim ve karşılaştırma durumu projeden ayrıdır: proje verisini, otomatik kaydı, kütüphaneyi ya da geri al
geçmişini değiştirmez, dışa aktarılmaz ve proje değiştirdiğinizde sıfırlanır.

## Veri depolama, yedekler ve JSON uyumluluğu

- **Depolama** (tarayıcı `localStorage`): `horror-director:library:v1` (dizin), `horror-director:proj:<id>` (proje başına
  bir kayıt), `horror-director:lang` (dil). Kimlikler dahilidir ve adlardan bağımsızdır. Kütüphane verisi (kimlikler,
  zaman damgaları, etkin proje) proje JSON'una asla yazılmaz.
- **Yedek**, *etkin* projeyi şema 9 dışa aktarma biçiminde indirir. İçe aktarma katı doğrulama yapar (yinelenen
  kimlikler, boşta kalan referanslar, geçersiz değerler, tanınmayan alanlar, daha yeni şema sürümleri hatadır ve hiçbir şey
  değiştirilmeden önce gösterilir). Bir dosya yeni proje olarak ya da onayla etkin projenin yerine aktarılabilir.
- **Eski dosyalar ve veriler:** şema 1'den şema 8'e kadar dışa aktarmalar ile yalın proje dosyaları hâlâ içe aktarılır; eksik
  çekim planları, ses ipuçları, EĞER düğümleri, yorumlar, sahne türleri ve bayraklar boş liste olarak başlar, eksik geçiş yönlendirmeleri yok olarak kalır (şema 1/yalın dosyalar
  için bilgilendirici bir not çıkar) ve sonraki yedek, diğer tüm alanlar değişmeden şema 9 olur. Önceki sürümlerden kalan kayıtlı projeler aynı
  şekilde okunur ve yalnızca siz düzenleyince yeniden yazılır. Proje kayıtları `{ v: 9, project }` olarak saklanır (eski
  `v: 1`–`v: 8` kayıtlar hâlâ okunur); yeni alanları okuyamayan eski bir sürüm böyle bir kaydı hasarlı gösterir ve veriyi
  atmak yerine korur. Sürüm düşürme desteklenmez.
- **Taşıma:** erken sürümlerin tek projelik depolaması doğrulanır, `legacy` kimliğiyle kütüphaneye kopyalanır, kontrol
  edilir ve ancak ondan sonra dizine eklenir. Özgün anahtar (`horror-director:project:v1`) asla değiştirilmez ya da silinmez.
- **Güvenli geçiş ve kurtarma:** proje değiştirmeden önce bekleyen düzenlemeler kaydedilir; okunamayan depolama verisi
  ezilmek yerine korunur (`horror-director:unreadable:<zaman>`) ve indirilmek üzere sunulur.
- **Birden çok sekme birleştirilmez** (son yazan kazanır); başka bir sekmeden gelen değişiklik algılanır, bir başlık
  gösterilir ve yeniden yükleyene kadar kütüphane işlemleri engellenir.

JSON şeması `README.md` içinde belgelenmiştir ve dilden bağımsızdır (`format: "horror-director"`, `schemaVersion: 9`, geçişlerde isteğe bağlı `waypoints` (yönlendirme noktaları), sahnelerde `shots` ve `audioCues` dizileri, projede `logicNodes` (`branch`, `setFlag`, `event`, `delay`, `random`, `sequence` ve `seqReturn`; Sıra Dönüşünde `sequenceId` (sahip Sıra ya da `null`) ve `stage` (0/1); EĞER'de isteğe bağlı `expression`, Olay'da `eventCategory`, Bekleme'de `seconds`, Rastgele Dal'da `probabilityA`/`labelA`/`labelB`), `flags`, `comments` ve `sceneTypes`, bağlantılarda isteğe bağlı `sourcePort` (`true`/`false`, Rastgele Dal için `a`/`b`, Sıra için `then0`/`then1`/`completed`), geçişlerde isteğe bağlı `direction` nesnesi;
`derived` bloğu içe aktarmada yok sayılır). Türkçe metin (ç, ğ, ı, İ, ö, ş, ü) UTF-8 olarak aynen korunur.

## Dil

Arayüz **İngilizce** ve **Türkçe** olarak sunulur. İlk ziyarette tarayıcı dili kullanılır (`tr*` → Türkçe, diğerleri →
İngilizce); üst çubuktaki **TR | EN** anahtarı sayfayı yenilemeden ve düzenlemeleri kaybetmeden dili hemen değiştirir ve
seçim proje verisinden ayrı hatırlanır. Kendi içeriğiniz (sahne adları, açıklamalar, içe aktarılan metin, örneklerin
anlatısı: arayüz dilini değiştirmek bir örneği asla değiştirmez) asla çevrilmez ve dışa aktarılan JSON iki dilde aynıdır.

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

- Simülasyon elle yapılır: otomatik rota sıralaması ya da "en iyi yol" yoktur; Rastgele Dal olasılıkları yazılmış niyettir ve tek bir rota bunları doğrulayamaz; serbest metin koşulları yalnızca görüntülenir; yalnızca yapılandırılmış bayrak koşulları ve yalnızca simülatörde değerlendirilir.
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
  sayısal değişken, betik, ayrı VE/VEYA/DEĞİL düğümleri, paralel yürütme, iç içe Sıralar, ikiden fazla aşamalı Sıralar veya çalışma anı yürütmesi yoktur.
  Bayrak Ata, Olay ve Bekleme düğümlerinin bir girişi ve bir çıkışı vardır, Sıra Dönüşünün çıkışı yoktur; herhangi bir mantık düğümüne dokunan bağlantılar
  geçiş tasarımı taşıyamaz. Bekleme, sahne ziyaretleri arasındaki ek süredir, sahne içi zaman çizelgesi düzenleyicisi değildir;
  sahneler yine yazılmış sürelerinin tamamını harcar.
- Sekans görünümü türetilmiş bir özettir: çalma, dalga biçimi ya da simülasyon yoktur, öğeleri kendisi düzenleyemez, seçim, yakınlık
  ve imleci yalnızca oturum boyunca tutar ve koşullu tetikleyicileri değerlendirmek yerine koşullu olarak işaretler.
- Görev hazırlığı yalnızca yazılmış bilgiyi yansıtır (Hazır, Uygulanmış demek değildir); özetler ve istemler rehberdir, üretilmiş motor kodu değildir ve içlerindeki her yol, sınıf ve varlık adı bir öneridir. Görev kimlikleri ilk üretim planlayıcıdan bu sürüme geçerken bir kez değişti; gezgin durumu yalnızca oturumludur.
- Üretim ilerlemesi yalnızca bu tarayıcıda durur (cihazlar arası eşitleme yok; JSON yedeğini kullanın). Tazelik, yazılmış verinin görev başına kaba bir karşılaştırmasıdır: ilgili her değişiklik görevi eskitir, anlamsal fark çıkarılmaz. Ajan tamamlama raporları doğrulanmamış iddialardır; Horror Director motor projesini çalıştıramaz ya da inceleyemez. Aynı projenin sekmeleri arasında ilerleme asla birleştirilmez: çakışan yazma engellenir ve yeniden yükleme önerilir.
- Üretim planları projeden türetilmiş planlama rehberidir: çalıştırılabilir motor kodu içermez, hiçbir motor varlığının ya da sisteminin
  var olduğunu iddia etmez; Unreal ya da Unity çalışma zamanı entegrasyonu veya içe aktarıcı yoktur. Sınıf/varlık adları önerilerdir;
  plan metni yerelleştirilir ama içindeki proje içeriği çevrilmez. Eski "The Hollow Apartment" örneği hâlâ boş kütüphaneyi besler;
  kapsamlı örnek Projeler'den eklenir.
- Uygulamaya ait bağlam menüsü tarayıcı kabuğuna ulaşamaz ve pano tarayıcı iznine bağlıdır (tarayıcı okuma erişimi vermiyorsa Yapıştır
  kullanılamaz; Ctrl/Cmd+V kullanın). Dokunmatikte uzun basma gerçek bir cihazda denenmedi.
- Ses ipuçları planlama notlarıdır: çalma, dalga biçimi, 3B uzamsallaştırma, yapay zekâ üretimi ya da motor/Unreal çalışma
  zamanı komutu ve varlık kütüphanesi yoktur. İpuçları tetikleyicilerden bağımsızdır ve ritim istatistiklerini etkilemez.
- Geçiş yönlendirmeleri planlama notlarıdır: üretilmiş görsel, animasyon ya da 3D önizleme yoktur ve Unreal'de çalıştırılmaz.
  Kayıtlı projeler yüklenirken şema **ve bütünlük** denetimine girer (boşta kalan sahne, mantık düğümü, bayrak, çekim, karakter
  ya da sahne türü başvuruları, geçersiz pinler vb.): tutarsız bir kayıt Projeler'de ilk sorunlarıyla birlikte öyle listelenir;
  kendiliğinden açılmaz, onarılmaz, üzerine yazılmaz ya da silinmez, birebir indirilebilir ve **Yine de aç** ile açıkça açılabilir
  (önce ham kopya kaydedilir; siz düzenleyene kadar hiçbir şey onarılmaz).
- Geri al/yinele geçmişi oturumluktur ve proje değiştirilince temizlenir.
- Unreal tarafında henüz içe aktarıcı yoktur; JSON biçimi yukarıda belgelenmiştir. Üretim paketi kod bölmeli değildir.
- Türkçe metinler oyun sektöründen anadili Türkçe bir editör tarafından gözden geçirilmemiştir; E2E yalnızca Chromium'u kapsar.

## Teknoloji

React 19, TypeScript, Vite, @xyflow/react, Zustand, Zod, lucide-react, Vitest, Playwright. Yerelleştirme için ek bağımlılık yoktur.
