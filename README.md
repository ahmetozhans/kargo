# Kargo

Türkçe, mobil öncelikli kargo dağıtım planlayıcısı. Kaynak: [Spoke Route Planner](https://apps.apple.com/us/app/spoke-route-planner/id1198232244) iş akışı referansı; özgün arayüz ve kod.

## Çalıştırma

Node.js 20+ gerekir.

```sh
cp .env.example .env
# .env içindeki anahtarları isteğe göre doldurun
npm install
node --env-file=.env server.js
```

`http://localhost:3000` adresini açın. Google anahtarı olmadan demo çalışır. **Örnek rota yükle** ile dört Bursa durağı, şematik harita ve tüm teslimat akışı denenebilir. Demo haritası gerçek sokak/yol ve mesafe göstermez. Neon veritabanı bağlıysa mevcut e-posta ve şifrenizle her cihazda aynı hesaba giriş yapın. Yeni hesap açma kapalıdır. Rotalar ve adres deposu hesaptan otomatik yüklenir. İlk girişte bu tarayıcıdaki eski kayıtlar hesaba aktarılır. Veritabanı olmadan oturum açılamaz. Ayarlardaki JSON dışa aktarımı yedek almak içindir.

Hızlı kullanım: ana sayfada **işletme veya fabrika adını** yazın, önerilerdeki doğru konumu seçin. Durak otomatik olarak bugünkü rotaya eklenir. Aramayı tekrarlayarak diğer işletmeleri ekleyin ve **Rotayı aç** düğmesine basın. Alıcı ve paket ayrıntıları sonradan düzenlenebilir. Demo modunda yalnız dört örnek Bursa işletmesi aranabilir; Google anahtarlarıyla canlı işletme araması açılır.

Vercel: GitHub deposunu Vercel'e bağlayın; framework ayarı `Other`, kök dizin `.`. `public/` statik dosyaları ve `api/index.js` sunucu işlevini yayınlayın. Environment Variables alanına `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY` ve diğer ayarları ekleyip yeniden deploy edin. HTTPS gereklidir; yerel `localhost` istisnadır. Sunucu isteklerinin günlük sayaçları bağlı PostgreSQL veritabanında ortak tutulur. **Kesin maliyet sınırı için Google Cloud API kotalarını ayrıca ayarlayın**; tarayıcıdaki Maps JavaScript yüklemeleri bu sunucu sayaçlarına dahil değildir.

## Google Cloud kurulumu

1. Google Cloud projesine faturalandırma hesabı bağlayın. **Maps JavaScript API**, **Places API (New)**, **Geocoding API**, **Routes API** etkinleştirin. Route Optimization API ve Compute Route Matrix kullanılmaz.
2. İki ayrı anahtar açın. Tarayıcı anahtarı: `GOOGLE_MAPS_BROWSER_KEY`; uygulama kısıtı **HTTP referrers** (`https://alanadiniz/*`, geliştirme için `http://localhost:3000/*`), API kısıtı yalnızca **Maps JavaScript API**. Tarayıcı anahtarının görünür olması normaldir; referrer ve API kısıtları önemlidir.
3. Sunucu anahtarı: `GOOGLE_MAPS_SERVER_KEY`; yalnızca sunucu ortam değişkenine koyun. API kısıtı **Places API (New), Geocoding API, Routes API**. Sabit çıkış IP'niz varsa IP kısıtı da uygulayın. Vercel'in değişken çıkış IP'lerinde yalnız API kısıtı tek başına tam koruma sağlamaz: sunucu endpointlerine ek oturum ve oran sınırlaması koymadan genel kullanıma açmayın. Anahtarı GitHub'a veya istemci dosyasına koymayın.
4. Cloud Console → **APIs & Services → Enabled APIs & services → ilgili API → Quotas & System Limits**: Maps JavaScript, Places, Geocoding, Routes API için günlük sınırları trafik hedefinize göre düşürün. Özellikle Routes Pro optimizasyonunun sınırını çok düşük tutun; `ENABLE_GOOGLE_OPTIMIZATION=0` varsayılandır. Cloud Console → **Billing → Budgets & alerts** altında düşük bir bütçe ve örneğin %50, %90, %100 e-posta uyarıları ekleyin. **Bütçe uyarısı harcamayı otomatik durdurmaz.** API kotası ve düzenli kullanım izlemesi gerekir.
5. `DAILY_*_LIMIT` sunucudan yapılan Places, Geocoding ve Routes isteklerini veritabanındaki gün ve servis bazlı atomik sayaçla sınırlar. Başarısız istekler de sınırdan düşülür. Bu uygulama sayacı, Google'ın kendi ürün kotalarının yerini almaz; Maps JavaScript yüklemeleri doğrudan tarayıcıdan gerçekleşir.

## Kullanılan servisler ve 27 Eylül 2026 itibarıyla fiyatlar

Google'ın [küresel fiyat sayfası](https://developers.google.com/maps/billing-and-pricing/pricing) ücretsiz aylık kullanım miktarını SKU bazında listeler; miktarlar proje bazında garanti edilmiş bir bütçe değildir. Aşağıdakiler ücretsiz eşik sonrası ilk ücretli kademe, **1.000 etkinlik başına USD**:

| İşlem | SKU | Aylık ücretsiz kullanım | Sonraki 1.000 işlem |
| --- | --- | ---: | ---: |
| Web haritası yükleme | Dynamic Maps | 10.000 | $7 |
| Yazarken öneri | Autocomplete Requests | 10.000 | $2,83 |
| Yer seçimi (`id`, adres, konum alanları) | Place Details Essentials | 10.000 | $5 |
| Adres doğrulama | Geocoding | 10.000 | $5 |
| Rota/mesafe | Routes: Compute Routes Essentials | 10.000 | $5 |
| İsteğe bağlı Google sıralaması | Routes: Compute Routes Pro | 5.000 | $10 |

**Rotayı optimize et** cihazda konumlar arasındaki yaklaşık kuş uçuşu mesafeyi azaltır. İki aşamalı yakın komşu ve 2-opt hesabı yapar, Google isteği göndermez ve yol ağı, trafik veya saat aralığını hesaba katmaz. Tamamlanan durakların durumu korunur. Durak eklenince veya sıra değişince yol verisine dayanmayan bir **yaklaşık sürüş süresi** hemen görünür (kuş uçuşu mesafenin 1,35 katı, 30 km/sa varsayımı). Gerçek yol mesafesi ve ETA ayrıca **Rotayı hesapla** ile bir Routes Essentials isteği üzerinden alınır. Google isteği başarısız olursa yaklaşık süre korunur. `ENABLE_GOOGLE_OPTIMIZATION=1` ayarlanırsa ayrı **Google ile optimize et** düğmesi görünür ve kullanıcı her Pro isteğini onaylar. `optimizeWaypointOrder` [Google belgesine](https://developers.google.com/maps/documentation/routes/opt-way) göre Pro sınıfında ücretlendirilebilir. Kota dolunca ücretli istek otomatik tekrarlanmaz, yerel sıralamaya geçilir. Uygulama Routes Matrix çağırmaz. Fiyat ve SKU'lar değişebilir; canlıya çıkarken fiyat sayfasını yeniden kontrol edin. Google'ın [coğrafi kodlama veri saklama politikası](https://developers.google.com/maps/documentation/geocoding/policies) ve Maps/Routes hizmet şartlarına uyun; kalıcı adres ve koordinat saklama iş modeliniz için hukuki/politika incelemesi gerektirir.

## Kullanım notları

- Adres önerileri 420 ms bekleme ve en az üç karakterle başlar. Firma eşleşmeleri Bursa demo kayıtlarında yerel aranır. Google API açıkken Bursa çevresine öncelikli arama yapılır; bir öneriyi seçmek, yer ayrıntılarını sunucudan getirir.
- Çok satırlı ekleme en fazla 10 adresi tek tek doğrular. Bulunamayanları kullanıcıya bildirir, başarılı olanları kaydeder. Gerçek rota yalnız **Rotayı hesapla** düğmesinde hesaplanır. Liste değişince önceki mesafe/varış tahminleri temizlenir.
- **Ayarlar → Ortak dönüş adresi** bölümünde adres deposundan seçilen güncel konum yeniden aranmadan kullanılır (eski Google konumu gerekirse yenilenir); yeni bir adres bir kez doğrulanır. Hesabın bulut kaydına eklenir, yeni rotaların bitişi otomatik ayarlanır ve açık rotaların dönüşü güncellenir. Eski tamamlanmış rotalar tarihsel haliyle kalır. Dönüş değişince açık rotaların süre tahmini yerel olarak yenilenir; Google yol süresi için kullanıcı **Rotayı hesapla** düğmesine basar.
- Saat aralığı ve öncelik kayıt edilir ve ekranda görünür; bu ilk sürüm Google'ın saat aralığına bağlı optimizasyonunu yapmaz. **Navigasyonu aç** doğrudan Google Maps yönlendirme bağlantısını açar; iPhone'da uygulama yüklüyse uygulamaya geçer, yüklü değilse tarayıcıdaki Google Maps'e gider. Site içi GPS takibi ve bu amaçla yapılan ilave Routes isteği kaldırılmıştır.
- Durumlar: bekliyor, teslim edildi, teslim edilemedi (neden zorunlu), atlandı. Rota bitince geçmişe taşınır. Bitmiş rota yeniden açılırsa içerik görüntülenebilir.

## Cihazlar arası kayıt

Vercel projesinde Storage → Neon Postgres veritabanı oluşturup Production ortamına `DATABASE_URL` değişkenini bağlayın, ardından yeniden deploy edin. Herkese açık yeni hesap açma hem giriş ekranından hem `/api/register` uç noktasından kapatılmıştır. Mevcut hesabın e-posta ve şifresiyle başka cihazlarda **Giriş yap**; rotalar ve adres deposu veritabanından yüklenir. Eski kayıtlara sahip tarayıcıda ilk kez giriş yapınca eski rotalar ve adresler bu hesaba aktarılır; Safari'ye geçmeden önce eski kayıtların bulunduğu tarayıcıda oturum açın. Başka hesabın kayıtları aynı cihazda görünmez. Ayarlarda **Verileri yenile** son bulut kaydını açar. Aynı veriyi iki cihazda eşzamanlı düzenlerseniz sunucu eski sürüme yazmayı reddeder; önce bulut verisini yenileyin. Şifre sıfırlama/e-posta doğrulama henüz bulunmuyor: şifrenizi güvenle saklayın ve JSON yedeği alın. Oturum HTTP-only, Secure ve SameSite=Lax çerezle tutulur; şifreler salt ve scrypt ile saklanır. Oturum 30 gün geçerlidir. Veritabanı bağlı değilse giriş yapılamaz.

### İlk hesabı özel olarak kurma

Veritabanında henüz hiç kullanıcı yoksa Vercel → kargo → Settings → Environment Variables → Production bölümüne `KARGO_SETUP_SECRET` adıyla **en az 40 karakterlik rastgele bir değer** ekle ve yeniden deploy et. Bu değer normal giriş şifren değildir; yalnızca ilk kurulumda kullanılır. Sitede **İlk hesabımı kur** bağlantısı belirir. E-posta adresini, yeni şifreni (en az 12 karakter) ve Vercel'e eklediğin kurulum anahtarını gir. İlk hesap açılınca kurulum sunucuda kendiliğinden kapanır: başka hesap oluşturulamaz ve `/api/register` kapalı kalır. İşlem bitince `KARGO_SETUP_SECRET` ortam değişkenini Vercel'den kaldırıp yeniden deploy et. Hiçbir zaman şifreni veya kurulum anahtarını GitHub'a ekleme.

Google Places ve Geocoding verilerinden yalnızca yer kimliği uzun süre saklanabilir. Depoda Google koordinatları 29 gün sonra yeniden doğrulanır; kullanıcı girip onayladığı firma, telefon, teslimat notları kendi kayıtlarıdır. Kayıtlı işletmeler hızlı arama sonucunda önce gösterilir, eşleşme varsa kullanıcı Google aramasını ayrıca seçmedikçe Autocomplete isteği gönderilmez.
