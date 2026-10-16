import type { ShowcaseText } from './showcase.text'

/**
 * Türkçe vitrin metni: "Boş Köy". `showcase.text.ts` içindeki İngilizce sözlükle aynı kimlikleri paylaşır; yalnızca okunur
 * metinler çevrilmiştir. Kimlikler, enum değerleri, portlar, ifadeler ve Unreal yolları fabrikada kalır.
 */
export const SHOWCASE_TR: ShowcaseText = {
  name: 'Boş Köy (Vitrin Örneği)',
  description: 'Bir köy, sahte bir uyanış ve gerçekliği parçalayan bir olay. Tüm yazım özelliklerini gösterir.',
  flags: {
    flag_heard_bell: { name: 'çanıDuydu', description: 'Oyuncu kilise çanını duydu.' },
    flag_found_key: { name: 'anahtarıBuldu', description: 'Oyuncu demir anahtarı sisin içinden aldı.' },
    flag_trusted_child: { name: 'çocuğaGüvendi', description: 'Oyuncu çocuğun sayma oyununu izledi.' },
    flag_reality_broken: { name: 'gerçeklikParçalandı', description: 'Sahte uyanış paramparça oldu.' },
  },
  characters: {
    chr_elena: {
      name: 'Elena',
      description: 'Köyüne dönen, ama ayrıldığını hatırlamayan bir köylü.',
      states: {
        st_calm: { name: 'Sakin', behavior: 'Normal yürür, gördüğüne güvenir.' },
        st_uneasy: { name: 'Huzursuz', behavior: 'Adımları yavaşlar, omzunun üzerinden arkaya bakar.' },
        st_panic: { name: 'Panik', behavior: 'Koşar, kamera titrer, nefesi duyulur.' },
      },
    },
    chr_watcher: {
      name: 'Gözcü',
      description: 'Yalnızca görüş alanının kıyısında görünen bir siluet.',
      states: {
        st_dormant: { name: 'Uykuda', behavior: 'Uzakta kıpırdamadan durur, asla yaklaşmaz.' },
        st_stalk: { name: 'Sinsi', behavior: 'Yalnızca oyuncu başını çevirdiğinde ilerler.' },
        st_hunt: { name: 'Avda', behavior: 'En kısa yoldan doğrudan kovalar.' },
      },
    },
    chr_mara: {
      name: 'Mara',
      description: 'Bir anıdan gelen, yol gösteren ya da yoldan çıkaran bir çocuk.',
      states: {
        st_guide: { name: 'Yol gösteren', behavior: 'Ninni mırıldanır ve çıkışa doğru yürütür.' },
        st_mislead: { name: 'Yanıltan', behavior: 'Yanlış yönü gösterir, ritimden kopuk güler.' },
      },
    },
  },
  sceneType: { name: 'Eşikte', description: 'Geometrinin sessizce kendisiyle çeliştiği, yarı gerçek mekânlar.' },
  scenes: {
    s_cottage: {
      title: 'Kulübede Sabah',
      description: 'Elena çocukluğunun kulübesinde uyanır. Her şey bıraktığı yerde, tıpatıp aynı.',
      ambience: 'Ahşap gıcırtısı, soğurken tıkırdayan bir çaydanlık',
      triggers: {
        tg_kettle: { name: 'Ateşsiz ıslık çalan çaydanlık', description: 'Ocak soğuk olduğu halde çaydanlık ötüyor.' },
        tg_window: { name: 'Penceredeki siluet', description: 'Patikanın ucunda kıpırtısız bir gölge duruyor.' },
      },
      shots: {
        sh_wake: { title: 'Gözler açılır', sound: 'Fazla düzenli tekrarlanan kuş sesi.', visual: 'Yastığın üzerine yayılan yumuşak sabah ışığı.' },
        sh_door: { title: 'Kapıdan çıkış', sound: 'Kapı mandalı, sonra sessizlik.', visual: 'Patika bomboş; bütün pencereler karanlık.' },
      },
      cues: {
        au_birds: { title: 'Döngüdeki kuş sesi', notes: 'Döngünün birleşme noktası ancak fark edilecek kadar duyulmalı.' },
        au_hum: { title: 'Döşemenin altından ninni', notes: 'Mara’nın sesi; emin olmaya yetmeyecek kadar kısık.' },
      },
    },
    s_square: {
      title: 'Köy Meydanı',
      description: 'Meydan, başını çevirmeyen köylülerle dolu. Kilise çanı çalmak üzere.',
      ambience: 'Rüzgâr, uzaktan çan şıngırtıları, tek bir ses yok',
      triggers: { tg_stare: { name: 'Köylüler aynı anda döner', description: 'Çan çalmaya başlayınca bütün başlar birden çevrilir.' } },
      shots: {
        sh_square: { title: 'Tepki vermeyen kalabalık', sound: 'Sürüklenen adımlar, tek kelime yok.', visual: 'Odağın hemen dışında kalan yüzler.' },
        sh_bell: { title: 'Çan kulesi', sound: 'Çan bir kez çalar, yarım ses pes.', visual: 'Kule olması gerekenden daha yüksek.' },
      },
      cues: { au_chime: { title: 'Uzaktan çan sesleri', notes: '' } },
    },
    s_fog: {
      title: 'Sis Yolu',
      description: 'Daha önce var olmayan bir yol. Sis kenarları gizliyor; anahtar tam ortada yatıyor.',
      ambience: 'Boğuk ayak sesleri, alçak bir uğultu',
      triggers: {
        tg_key: { name: 'Demir anahtar', description: 'Yerde bir ışıltı; onu almak oyuncunun kararı.' },
        tg_follow: { name: 'Onunkiyle aynı ayak sesleri', description: 'Elena durduktan sonra yankı bir adım daha atıyor.' },
      },
      shots: {
        sh_fog: { title: 'Sisin içine yürüyüş', sound: 'Yansıyacak yüzey olmadan yankılanan ayak sesleri.', visual: 'Yol, dönemeç olmayan yerde kıvrılıyor.' },
        sh_turn: { title: 'Geri dönüş', sound: 'Ani sessizlik, ardından bir nefes.', visual: 'Yolun olması gereken yerde kulübe duruyor.' },
      },
      cues: {
        au_echo: { title: 'Peşini bırakmayan yankı', notes: 'Arkadan sola doğru kayar.' },
        au_dead: { title: 'Ölü sessizlik', notes: 'Yankı başlamadan önce her şey kesilir.' },
      },
    },
    s_cellar: {
      title: 'Kilise Mahzeni',
      description: 'Kapılar tekrarlanıyor. Yanlış bir dönüş Elena’yı aynı mahzene geri getirir; Mara’yla saymak çıkış yoludur.',
      ambience: 'Damlayan su, taş yankısı, ağır bir kalp atışı',
      exit: 'Elena gözlerini kapatır ve Mara’yla ona kadar sayar.',
      triggers: {
        tg_door: { name: 'Geri götüren kapı', description: 'Doğru görünen kapı aynı mahzene açılıyor.' },
        tg_count: { name: 'Mara saymaya başlar', description: 'Küçük bir ses ondan geriye sayıyor.' },
      },
      shots: { sh_cellar: { title: 'Sıra sıra kapılar', sound: 'Damlayan suyun altında kalp atışı.', visual: 'Birbirinin aynı kapılardan oluşan bir koridor.' } },
      cues: {
        au_heart: { title: 'Kalp atışı', notes: 'Her döngüde hızlanır.' },
        au_count: { title: 'Sayan çocuk', notes: '' },
      },
    },
    s_child: {
      title: 'Çocuk Odası',
      description: 'Elena’nın büyüdüğü odanın bir anısı. Mara yatağın kenarında oturur ve ondan olanları hatırlamasını ister.',
      ambience: 'Müzik kutusu, sıcak ampul uğultusu',
      triggers: { tg_box: { name: 'Müzik kutusu susar', description: 'Melodi, bitmesine bir nota kala durur.' } },
      shots: { sh_room: { title: 'Yatakta Mara', sound: 'Müzik kutusu, akortsuz.', visual: 'Köyün geri kalanına hiç uymayan sıcak bir ışık.' } },
      cues: { au_box: { title: 'Müzik kutusu', notes: '' } },
    },
    s_wake: {
      title: 'Sahte Uyanış',
      description: 'Elena kulübede yeniden uyanır. Dünya doğru görünüyor. Değil.',
      ambience: 'Oda sesi, fazla sessiz',
      triggers: { tg_crack: { name: 'Sıvada çatlak', description: 'İnce bir çatlak tavanı boydan boya geçiyor ve büyümeye devam ediyor.' } },
      shots: { sh_wake2: { title: 'İkinci uyanış', sound: 'Aynı kuş sesi, bir ölçü sonra.', visual: 'Yastık, ilk sabahtan kalma sıcaklığını hâlâ koruyor.' } },
      cues: {},
    },
    s_end_escape: {
      title: 'Son: Kaçış',
      description: 'Elena gerçeği kabul eder ve yıkılan duvarın aralığından dışarı çıkar.',
      ambience: '',
      triggers: { tg_dawn: { name: 'Gerçek şafak', description: 'Gerçek gün ışığı, döngü yok.' } },
      shots: {},
      cues: {},
    },
    s_end_wake: {
      title: 'Son: Uyanış',
      description: 'Elena gerçeği reddeder ve yıllar sonra köyün çok ötesinde uyanır.',
      ambience: '',
      triggers: { tg_cut: { name: 'Karartma', description: 'Kulübe ufuk çizgisinden silinmiş.' } },
      shots: {},
      cues: {},
    },
    s_end_absorbed: {
      title: 'Son: Yutulma',
      description: 'Anahtar da Mara’nın güveni de olmadan köy Elena’nın üzerine kapanır.',
      ambience: '',
      triggers: { tg_absorb: { name: 'Köy kapanıyor', description: 'Meydandaki bütün kapılar aynı anda açılıyor.' } },
      shots: {},
      cues: {},
    },
  },
  nodes: {
    evt_bell: { title: 'Çan çalar', description: 'Planlama dönüm noktası: kilise çanı çalar ve kalabalık döner.' },
    set_heard: { title: 'Çanı hatırla', description: '' },
    dly_wait: { title: 'Kapıya yürü', description: 'Meydan ile kapı arasında zaman akar.' },
    rnd_door: { title: 'Kapı açılır mı?', description: 'Yazılmış tasarım niyeti: kapı çoğunlukla açılır.', labelA: 'Kapı açılır', labelB: 'Kapı kapalı kalır' },
    set_key: { title: 'Anahtarı al', description: '' },
    set_trust: { title: 'Mara’ya güven', description: '' },
    if_expr: { title: 'Elena çıkış yolunu hak etti mi?', description: 'Yapılandırılmış koşul: (anahtarıBuldu VE gerçeklikParçalandı DEĞİL) VEYA çocuğaGüvendi.' },
    seq_break: { title: 'Gerçeklik Kırılması', description: 'Sonra 0: duvarlar çatlar. Sonra 1: sessizlik çöker. Ardından hikâye devam eder.' },
    evt_crack: { title: 'Duvarlar nefes alır', description: '' },
    set_broken: { title: 'Gerçeklik parçalanır', description: '' },
    ret_0: { title: 'Dönüş 0', description: '' },
    dly_beat: { title: 'Tutulan nefes', description: '' },
    evt_silence: { title: 'Sessizlik çöker', description: '' },
    ret_1: { title: 'Dönüş 1', description: '' },
    if_free: { title: 'Elena gerçeği kabul eder mi?', description: '', condition: 'Serbest metin tasarım varsayımı: oyuncu Mara’nın hikâyesini kabul eder (değerlendirilmez).' },
  },
  links: {
    e1: {
      label: 'Dışarı çık',
      direction: {
        playerBelief: 'Elena evden yalnızca çıktığını sanıyor.',
        reality: 'Köyden hiç ayrılmadı; patika başa dönüyor.',
        visualContinuity: 'Kapı çerçevesi meydandaki kemerle örtüşür.',
        audioContinuity: 'Mandal sesi, çan şıngırtılarına köprü kurar.',
        reveal: 'Penceredeki siluet çoktan meydanda.',
        unrealNotes: '',
      },
    },
    e2: { label: 'Çan çalar' },
    e6: { label: 'Kapı açılır' },
    e7: { label: 'Kapı kapalı kalır' },
    e9: {
      label: 'Yankıyı izle',
      direction: {
        playerBelief: 'Elena kendi adımlarını geri izlediğini sanıyor.',
        reality: 'Yol kilise mahzeninde bitiyor.',
        visualContinuity: 'Sis, mahzenin buharına incelir.',
        audioContinuity: 'Yankı, damlayan suya dönüşür.',
        reveal: 'Mahzenin kapısı, kulübenin kapısıyla aynı.',
        unrealNotes: 'Kulübe kapısı varlığını yeniden kullan (TBD).',
      },
    },
    e10: { label: 'Yanlış kapı', condition: 'Sayma adımı başarısız olur' },
    e11: { label: 'Gözlerini kapat ve say', condition: 'Çıkış koşulu sağlandı' },
    e13: { label: 'Mara hatırlamanı ister' },
    e14: { label: 'Çıkış yolu hak edildi' },
    e15: { label: 'Anahtar yok, güven yok' },
    e16: { label: 'Çatlak büyür' },
    e24: { label: 'Gerçeği kabul et' },
    e25: { label: 'Gerçeği reddet' },
  },
  comments: {
    note_guide: { title: 'Buradan başla', text: 'Kulübe → Meydan → Olay → Bekleme → Rastgele kapı. Düğümlerin üzerine gelin ve Denetçi’yi açın.' },
    note_gate: { title: 'Bayrak kapısı', text: 'EĞER düğümü anahtarıBuldu, gerçeklikParçalandı ve çocuğaGüvendi bayraklarını okur. Geçtiğini görmek için "Kapı açılır" yolunu izleyin.' },
    note_seq: { title: 'Sıralı Sıra düğümü', text: 'Sonra 0 baştan sona çalışır ve döner; ardından Sonra 1 çalışır. Tamamlandı çıkışı hikâyeyi sürdürür.' },
  },
}
