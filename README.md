# Kargo

Türkçe, mobil öncelikli kargo dağıtım planlayıcısı. Kaynak: [Spoke Route Planner](https://apps.apple.com/us/app/spoke-route-planner/id1198232244) iş akışı referansı; özgün arayüz ve kod.

## Çalıştırma

Node.js 20+ gerekir. Bağımlılık kurulumu yoktur.

```sh
cp .env.example .env
# .env içindeki anahtarları isteğe göre doldurun
node --env-file=.env server.js
```

`http://localhost:3000` adresini açın. Google anahtarı olmadan demo çalışır. **Örnek rota yükle** ile dört Bursa durağı, şematik harita ve tüm teslimat akışı denenebilir. Demo haritası gerçek sokak/yol ve mesafe göstermediğini açıkça belirtir. Rotalar ve teslimat durumları `localStorage` ile aynı tarayıcıda saklanır; sunucuya veya başka cihaza eşitlenmez. Tarayıcı verilerinin silinmesi kayıtları siler. Ayarlardaki JSON dışa aktarımı yedek almak içindir.

Hızlı kullanım: ana sayfada **işletme veya fabrika adını** yazın, önerilerdeki doğru konumu seçin. Durak otomatik olarak bugünkü rotaya eklenir. Aramayı tekrarlayarak diğer işletmeleri ekleyin ve **Rotayı aç** düğmesine basın. Alıcı ve paket ayrıntıları sonradan düzenlenebilir. Demo modunda yalnız dört örnek Bursa işletmesi aranabilir; Google anahtarlarıyla canlı işletme araması açılır.

Vercel: GitHub deposunu Vercel'e bağlayın; framework ayarı `Other`, kök dizin `.`. `public/` statik dosyaları ve `api/index.js` sunucu işlevini yayınlayın. Environment Variables alanına `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAPS_SERVER_KEY` ve diğer ayarları ekleyip yeniden deploy edin. HTTPS gereklidir; yerel `localhost` istisnadır. Vercel'de serverless işlevler arasında günlük sayaç ortak değildir: **kesin maliyet sınırı için Google Cloud API kotalarını ayrıca ayarlayın**.

## Google Cloud kurulumu

1. Google Cloud projesine faturalandırma hesabı bağlayın. **Maps JavaScript API**, **Places API (New)**, **Geocoding API**, **Routes API** etkinleştirin. Route Optimization API ve Compute Route Matrix kullanılmaz.
2. İki ayrı anahtar açın. Tarayıcı anahtarı: `GOOGLE_MAPS_BROWSER_KEY`; uygulama kısıtı **HTTP referrers** (`https://alanadiniz/*`, geliştirme için `http://localhost:3000/*`), API kısıtı yalnızca **Maps JavaScript API**. Tarayıcı anahtarının görünür olması normaldir; referrer ve API kısıtları önemlidir.
3. Sunucu anahtarı: `GOOGLE_MAPS_SERVER_KEY`; yalnızca sunucu ortam değişkenine koyun. API kısıtı **Places API (New), Geocoding API, Routes API**. Sabit çıkış IP'niz varsa IP kısıtı da uygulayın. Vercel'in değişken çıkış IP'lerinde yalnız API kısıtı tek başına tam koruma sağlamaz: sunucu endpointlerine ek oturum ve oran sınırlaması koymadan genel kullanıma açmayın. Anahtarı GitHub'a veya istemci dosyasına koymayın.
4. Cloud Console → **APIs & Services → Enabled APIs & services → ilgili API → Quotas & System Limits**: Maps JavaScript, Places, Geocoding, Routes API için günlük sınırları trafik hedefinize göre düşürün. Özellikle Routes Pro optimizasyonunun sınırını çok düşük tutun; `ENABLE_GOOGLE_OPTIMIZATION=0` varsayılandır. Cloud Console → **Billing → Budgets & alerts** altında düşük bir bütçe ve örneğin %50, %90, %100 e-posta uyarıları ekleyin. **Bütçe uyarısı harcamayı otomatik durdurmaz.** API kotası ve düzenli kullanım izlemesi gerekir.
5. `DAILY_*_LIMIT` uygulama başına ek korumadır, dağıtık sunucularda ortak sayaç değildir. Tek kullanıcıya yönelik ilk sürümdür; kullanıcı hesabı, senkronizasyon veya çok kullanıcı erişimi için kalıcı sunucu veri tabanı ve merkezi oran sınırlaması gerekir.

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

`optimizeWaypointOrder` Pro ücretlendirmesine geçirebilir; [Google belgesi](https://developers.google.com/maps/documentation/routes/opt-way). Uygulama optimizasyonu varsayılan olarak kapalı tutar ve etkinleştirildiğinde her istek öncesinde onay ister. Kota dolarsa ücretli isteği tekrar denemez; elle sıralama devam eder. Uygulama Routes Matrix çağırmaz. Fiyat ve SKU'lar değişebilir; canlıya çıkarken fiyat sayfasını yeniden kontrol edin. Google'ın [coğrafi kodlama veri saklama politikası](https://developers.google.com/maps/documentation/geocoding/policies) ve Maps/Routes hizmet şartlarına uyun; kalıcı adres ve koordinat saklama iş modeliniz için hukuki/politika incelemesi gerektirir. Bu ilk sürümün `localStorage` kayıtları da kullanım öncesi bu şartlar açısından değerlendirilmeli; gerekirse yalnız kullanıcı adresini ve izin verilen place ID'lerini saklayacak şekilde değiştirin.

## Kullanım notları

- Adres önerileri 420 ms bekleme ve en az üç karakterle başlar. Firma eşleşmeleri Bursa demo kayıtlarında yerel aranır. Google API açıkken Bursa çevresine öncelikli arama yapılır; bir öneriyi seçmek, yer ayrıntılarını sunucudan getirir.
- Çok satırlı ekleme en fazla 10 adresi tek tek doğrular. Bulunamayanları kullanıcıya bildirir, başarılı olanları kaydeder. Gerçek rota yalnız **Rotayı hesapla** düğmesinde hesaplanır. Liste değişince önceki mesafe/varış tahminleri temizlenir.
- Saat aralığı ve öncelik kayıt edilir ve ekranda görünür; bu ilk sürüm Google'ın saat aralığına bağlı optimizasyonunu yapmaz. Navigasyon Google Maps'i seçili durağın koordinatlarıyla açar.
- Durumlar: bekliyor, teslim edildi, teslim edilemedi (neden zorunlu), atlandı. Rota bitince geçmişe taşınır. Bitmiş rota yeniden açılırsa içerik görüntülenebilir.

## Cihazlar arası kayıt

Vercel projesinde Storage → Neon Postgres veritabanı oluşturup Production ortamına `DATABASE_URL` değişkenini bağlayın, ardından yeniden deploy edin. Proje bu değişkenle açılınca rotalar ve adres deposu veritabanında saklanır. Ayarlar → **Eşitleme kodunu göster** ile uzun kodu güvenli şekilde alın; diğer cihazda Ayarlar → **Bu kodla bağlan** alanına yapıştırın. Kod hesaba erişim anahtarıdır; başkalarıyla paylaşmayın. Aynı rota iki cihazda aynı anda değiştirilirse sunucu çakışan yazımı reddeder; Ayarlar → **Şimdi eşitle** ile son sunucu sürümünü yükleyin. Veritabanı bağlantısı kesilirse cihazdaki kayıtlar kalır; bağlantı dönünce eşitleyin. Sunucuda yalnızca kodun SHA-256 özeti saklanır. İlk eşitleme mevcut cihaz kayıtlarını da yükler. Veritabanı bağlı değilken uygulama durumunu açıkça bildirir ve cihazlar arası eşitleme yapmaz.

Google Places ve Geocoding verilerinden yalnızca yer kimliği uzun süre saklanabilir. Depoda Google koordinatları 29 gün sonra yeniden doğrulanır; kullanıcı girip onayladığı firma, telefon, teslimat notları kendi kayıtlarıdır. Kayıtlı işletmeler hızlı arama sonucunda önce gösterilir, eşleşme varsa kullanıcı Google aramasını ayrıca seçmedikçe Autocomplete isteği gönderilmez.
