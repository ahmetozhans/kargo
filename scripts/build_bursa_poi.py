import json
import sys
import unicodedata
import urllib.parse
import urllib.request

BBOX = "39.18,28.0,40.82,30.35"
ENDPOINTS = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

QUERY = f'''[out:json][timeout:45];(
  nwr["name"]["shop"]({BBOX});
  nwr["name"]["office"]({BBOX});
  nwr["name"]["amenity"]({BBOX});
  nwr["name"]["craft"]({BBOX});
  nwr["name"]["tourism"]({BBOX});
  nwr["name"]["leisure"]({BBOX});
  nwr["name"]["healthcare"]({BBOX});
  nwr["name"]["industrial"]({BBOX});
);out center tags;'''


def norm(value):
    value = str(value or "").casefold()
    return "".join(ch for ch in unicodedata.normalize("NFD", value) if unicodedata.category(ch) != "Mn")


def address_from(tags):
    street = " ".join(filter(None, [tags.get("addr:street"), tags.get("addr:housenumber")])).strip()
    parts = [
        street,
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


def fetch_data():
    payload = urllib.parse.urlencode({"data": QUERY}).encode("utf-8")
    last_error = None
    for endpoint in ENDPOINTS:
        try:
            req = urllib.request.Request(
                endpoint,
                data=payload,
                headers={
                    "User-Agent": "kargo-bursa-index/1.0 (+https://ahmetozhans.github.io/kargo/)",
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except Exception as exc:
            last_error = exc
            print(f"POI endpoint failed: {endpoint}: {exc}", file=sys.stderr)
    raise RuntimeError(last_error or "No Overpass endpoint responded")


def build_rows(data):
    rows = []
    seen = set()
    for element in data.get("elements", []):
        tags = element.get("tags") or {}
        name = (tags.get("name") or "").strip()
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
    rows.sort(key=lambda row: norm(row["n"]))
    return rows


def main():
    try:
        data = fetch_data()
        rows = build_rows(data)
        print(f"Generated Bursa POI index: {len(rows)} entries")
    except Exception as exc:
        print(f"Could not generate Bursa POI index: {exc}", file=sys.stderr)
        rows = []

    with open("bursa-poi.json", "w", encoding="utf-8") as handle:
        json.dump(rows, handle, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
