import json
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

# Bursa ili + yakın çevre. Aramada sonuçlar yine Bursa ile sınırlandırılıyor.
BBOX = (39.18, 28.0, 40.82, 30.35)
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

# OSM'de bazı fabrikalar shop/office değil; building, landuse, man_made,
# operator veya brand olarak işaretli olabiliyor. Bu nedenle kapsamı geniş tutuyoruz.
FILTERS = [
    '["name"]["shop"]',
    '["name"]["office"]',
    '["name"]["amenity"]',
    '["name"]["craft"]',
    '["name"]["tourism"]',
    '["name"]["leisure"]',
    '["name"]["healthcare"]',
    '["name"]["industrial"]',
    '["name"]["building"]',
    '["name"]["landuse"~"industrial|commercial|retail"]',
    '["name"]["man_made"]',
    '["brand"]',
    '["operator"]',
]

# OSM'de eksik olsa bile sık kullanılan büyük tesislerin aramada görünmesi için
# resmi firma sayfalarındaki Bursa lokasyonlarından küçük bir seed listesi.
# Koordinat boş bırakılabilir; kullanıcı seçtiğinde uygulama adresi geocode eder.
SEED_ROWS = [
    {
        "n": "Beyçelik Gestamp Sıcak Şekillendirme & G1 Fabrikası",
        "a": "Demirtaş Organize Sanayi Bölgesi Kardelen Sokak No:10, Osmangazi, Bursa",
        "lat": None,
        "lng": None,
    },
    {
        "n": "Beyçelik Gestamp Sac Şekillendirme & Kaynak / Genel Merkez",
        "a": "Işıktepe Organize Sanayi Bölgesi Kahverengi Caddesi No:21, Nilüfer, Bursa",
        "lat": None,
        "lng": None,
    },
    {
        "n": "Beyçelik Gestamp Teknoloji ve Kalıp Merkezi",
        "a": "Taşpınar Mahallesi TEKNOSAB Cadde No:11, Karacabey, Bursa",
        "lat": None,
        "lng": None,
    },
]


def norm(value):
    value = str(value or "").casefold()
    return "".join(
        ch for ch in unicodedata.normalize("NFD", value)
        if unicodedata.category(ch) != "Mn"
    )


def address_from(tags):
    street = " ".join(
        filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")])
    ).strip()
    parts = [
        street,
        tags.get("addr:place"),
        tags.get("addr:neighbourhood") or tags.get("addr:suburb") or tags.get("addr:quarter"),
        tags.get("addr:district"),
        tags.get("addr:city"),
        tags.get("addr:postcode"),
        "Bursa",
    ]
    out = []
    seen = set()
    for part in parts:
        if not part:
            continue
        key = norm(part)
        if key and key not in seen:
            seen.add(key)
            out.append(str(part))
    return ", ".join(out) or "Bursa"


def make_tiles(rows=2, cols=2):
    south, west, north, east = BBOX
    lat_step = (north - south) / rows
    lon_step = (east - west) / cols
    tiles = []
    for r in range(rows):
        s = south + r * lat_step
        n = north if r == rows - 1 else south + (r + 1) * lat_step
        for c in range(cols):
            w = west + c * lon_step
            e = east if c == cols - 1 else west + (c + 1) * lon_step
            tiles.append((s, w, n, e))
    return tiles


def build_query(tile):
    bbox = ",".join(f"{v:.6f}" for v in tile)
    clauses = []
    for flt in FILTERS:
        clauses.append(f"nwr{flt}({bbox});")
    return "[out:json][timeout:35];(" + "".join(clauses) + ");out center tags;"


def fetch_query(query):
    payload = urllib.parse.urlencode({"data": query}).encode("utf-8")
    last_error = None
    for endpoint in ENDPOINTS:
        try:
            req = urllib.request.Request(
                endpoint,
                data=payload,
                headers={
                    "User-Agent": "kargo-bursa-index/2.0 (+https://ahmetozhans.github.io/kargo/)",
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=50) as response:
                return json.load(response)
        except Exception as exc:
            last_error = exc
            print(f"POI endpoint failed: {endpoint}: {exc}", file=sys.stderr)
            time.sleep(1)
    raise RuntimeError(last_error or "No Overpass endpoint responded")


def fetch_data():
    elements = []
    tiles = make_tiles()
    for index, tile in enumerate(tiles, start=1):
        print(f"Fetching Bursa POI tile {index}/{len(tiles)}...", flush=True)
        data = fetch_query(build_query(tile))
        elements.extend(data.get("elements", []))
    return {"elements": elements}


def choose_name(tags):
    return (
        tags.get("name")
        or tags.get("brand")
        or tags.get("operator")
        or ""
    ).strip()


def build_rows(data):
    rows = []
    seen = set()
    for element in data.get("elements", []):
        tags = element.get("tags") or {}
        name = choose_name(tags)
        if not name:
            continue
        center = element.get("center") or {}
        lat = element.get("lat", center.get("lat"))
        lng = element.get("lon", center.get("lon"))
        try:
            lat = round(float(lat), 6)
            lng = round(float(lng), 6)
        except (TypeError, ValueError):
            continue

        key = (norm(name), round(lat, 4), round(lng, 4))
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "n": name,
            "a": address_from(tags),
            "lat": lat,
            "lng": lng,
        })

    # Resmi seed kayıtları da aynı yerel indeksin parçası olsun.
    existing_names = {norm(row["n"]) for row in rows}
    for seed in SEED_ROWS:
        if norm(seed["n"]) not in existing_names:
            rows.append(seed)

    rows.sort(key=lambda row: norm(row["n"]))
    return rows


def main():
    data = fetch_data()
    rows = build_rows(data)

    # Sessizce boş/bozuk indeks deploy edilmesin. Önceki sürümde asıl sorun buydu.
    if len(rows) < 500:
        raise RuntimeError(f"Bursa POI index unexpectedly small: {len(rows)} entries")

    beycelik = [row for row in rows if "beycelik" in norm(row.get("n"))]
    print(f"Generated Bursa POI index: {len(rows)} entries")
    print(f"Beycelik test matches: {len(beycelik)}")
    for row in beycelik[:5]:
        print(f"  - {row['n']} | {row['a']}")

    with open("bursa-poi.json", "w", encoding="utf-8") as handle:
        json.dump(rows, handle, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
