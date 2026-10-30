# KVKK ve Gizlilik Bilgilendirmesi

**QR Yoklama** uygulaması, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında kullanıcılarını bilgilendirmek amacıyla bu metni yayımlar.

> **Özet:** Uygulama hiçbir kişisel veriyi geliştiriciye ya da üçüncü bir tarafa göndermez. Tüm bilgiler yalnızca uygulamanın kurulu olduğu bilgisayarda kalır. Uygulama internette yalnızca ayarlarda girdiğiniz yoklama sitesine bağlanır.

## 1. Uygulama ne yapar?

QR Yoklama, öğretim elemanının yoklama sitesini (varsayılan: `https://yoklama.uludag.edu.tr`) kendi bilgisayarında bir pencerede açık tutar. Sayfadaki QR kodu ekran görüntüsünden okur ve slaytın üstündeki küçük bir pencerede gösterir. Uygulama bir hizmet sağlayıcı değildir. Sunucusu yoktur; bilgisayarınızda çalışan bir araçtır.

## 2. Veri sorumlusu

- **Uygulama geliştiricisi** (Hilmi Tunçay) uygulama aracılığıyla hiçbir kişisel veri **almaz, görmez, saklamaz**. Bu nedenle uygulama üzerinden geliştiriciye aktarılan bir kişisel veri yoktur.
- **Yoklama sistemindeki veriler** (öğrenci ad-soyad, numara, katılım kayıtları, öğretim elemanı hesabı) yoklama sistemini işleten kurumun, yani **Bursa Uludağ Üniversitesi**nin sorumluluğundadır. Bu verilere ilişkin haklarınız için üniversitenin KVKK aydınlatma metnine ve başvuru kanallarına bakınız.
- Uygulamayı kullanan öğretim elemanı, sınıfta ekrana yansıttığı içerikten kurumunun kurallarına uygun olarak sorumludur.

## 3. Bilgisayarınızda işlenen veriler

| Veri | Nerede, nasıl | Ne kadar süre | Amaç |
|---|---|---|---|
| Yoklama sitesi adresi, pencere konumu ve boyutu, görünüm ayarları | `%APPDATA%\QR Yoklama\ayarlar.json` | Siz silene kadar | Uygulamanın ayarlarını hatırlamak |
| **Kullanıcı adı** (isteğe bağlı) | Aynı dosyada | Siz silene kadar | Giriş sayfasındaki kutuyu doldurmak |
| **Şifre** (isteğe bağlı) | Aynı dosyada, Windows'un veri koruma özelliğiyle (DPAPI) **şifrelenmiş** olarak. Yalnızca aynı bilgisayardaki aynı Windows kullanıcısı çözebilir. Hiçbir pencereye ya da dosyaya düz metin olarak yazılmaz. | "Kayıtlı şifreyi sil" ile silinene kadar | Giriş sayfasındaki şifre kutusunu doldurmak. Uygulama kendiliğinden giriş yapmaz; "Giriş"e kullanıcı basar. |
| Yoklama sitesinin oturum çerezleri ve önbelleği | `%APPDATA%\QR Yoklama\Partitions\` | Site oturumu bitene ya da siz silene kadar | Her derste yeniden giriş yapmamak (tarayıcıdaki "beni hatırla" gibi) |
| Yoklama sayfasının ekran görüntüsü (öğrenci listesi gibi sayfada görünen bilgiler dahil) | **Yalnızca bellekte**, saniyede bir alınır ve QR okunduktan hemen sonra atılır | Birkaç saniyeden kısa | QR kodu bulup okumak |
| QR kodun içeriği (yoklama bağlantısı) | Yalnızca bellekte | Uygulama açık kaldığı sürece, son QR | QR'ı net olarak yeniden çizmek |
| Uygulama sürümü ve işlem numarası | `%APPDATA%\QR Yoklama\calisan.json` | Sonraki açılışa kadar | Aynı anda iki kopya açılmasını önlemek |

- Kayıtlı şifre, yalnızca ayarlarda girilen yoklama sitesinin giriş sayfasına doldurulur; başka bir siteye doldurulmaz.
- Ekran görüntüleri diske kaydedilmez, hiçbir yere gönderilmez.

## 4. Aktarım

- Uygulama verileri **hiçbir üçüncü kişiye ya da yurt dışına aktarmaz**.
- Uygulamada reklam, kullanım istatistiği (analitik), hata raporu gönderimi ya da otomatik güncelleme kontrolü **yoktur**.
- Uygulamanın kurduğu tek internet bağlantısı, ayarlarda girilen yoklama sitesi ve o sitenin kendi açtığı sayfalardır. Bu bağlantıda giden bilgiler (giriş bilgileri, çerezler), tarayıcıdan aynı siteye girdiğinizde gidenlerle aynıdır.
- QR penceresi sınıftaki ekranda/projektörde gösterilir. QR kodu fotoğraflayan herkes yoklama bağlantısına ulaşabilir; bu, yoklama sisteminin kendi çalışma şeklidir.

## 5. Verilerinizi silme

- **Yalnızca şifreyi silmek:** Ayarlar → **Kayıtlı şifreyi sil**.
- **Tüm verileri silmek:** Uygulamayı kapatın (tepsi simgesi → Çıkış), sonra `Win + R` → `%APPDATA%` yazıp açılan klasördeki **QR Yoklama** klasörünü silin. Ayarlar, kullanıcı adı, şifre, çerezler ve önbellek tamamen kaldırılır.
- Uygulamanın kendisi tek bir dosyadır (`QR-Yoklama.exe`); silmek için dosyayı silmeniz yeterlidir.

## 6. KVKK madde 11 kapsamındaki haklarınız

KVKK'nın 11. maddesi uyarınca kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltilmesini ya da silinmesini isteme gibi haklarınız vardır.

- **Uygulama verileri:** Uygulamanın işlediği veriler yalnızca sizin bilgisayarınızda ve sizin denetiminizdedir; 5. bölümdeki adımlarla dilediğiniz zaman görüntüleyebilir ve silebilirsiniz. Geliştiricide sizinle ilgili bir kayıt bulunmamaktadır.
- **Yoklama sistemindeki veriler:** Bu veriler için başvurunuzu veri sorumlusu olan Bursa Uludağ Üniversitesi'ne yapmanız gerekir.

## 7. İletişim

Uygulamayla ilgili sorular ve öneriler için GitHub'da **[Issues](https://github.com/HilmiTuncay/qr-popup/issues)** sayfasından kayıt açabilirsiniz. Lütfen bu sayfaya şifre, öğrenci bilgisi ya da başka bir kişisel veri yazmayın.

## 8. Değişiklikler

Uygulamanın veri işleme şekli değişirse bu metin güncellenir. Güncel sürüm her zaman bu depodaki `KVKK.md` dosyasıdır.

_Son güncelleme: 30 Ekim 2026 · Uygulama sürümü 1.2.1_
