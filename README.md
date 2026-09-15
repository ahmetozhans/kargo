# Kargo

Mobil dağıtım rotası ve teslimat takip uygulaması.

## İlk sürüm

- Adres ekleme ve OpenStreetMap üzerinde gösterme
- Cihaz konumunu başlangıç noktası olarak kullanma
- Durakları yakınlığa göre sıralama
- Yol rotasını çizme, toplam mesafe ve tahmini süreyi gösterme
- Apple Maps / Google Maps ile navigasyona geçiş
- Teslim edildi / teslim edilemedi durumları
- Alıcı, telefon ve teslimat notu
- Verileri cihazda saklama
- PWA olarak ana ekrana eklenebilme

## Canlı yayın

`main` dalına yapılan her push `.github/workflows/pages.yml` üzerinden GitHub Pages'e otomatik deploy edilir.

GitHub'da bir kez **Settings → Pages → Build and deployment → Source → GitHub Actions** seçilmelidir.

## Harita servisleri

İlk MVP, harita için OpenStreetMap/Leaflet; adres arama için Nominatim; yol geometrisi için OSRM demo servisini kullanır. Yoğun/üretim kullanımı öncesinde bu servisler kendi altyapımız veya üretime uygun bir sağlayıcı ile değiştirilmelidir.
