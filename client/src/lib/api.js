export async function searchFacilities(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });

  const response = await fetch(`/api/search?${query.toString()}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "検索に失敗しました。");
  }
  const data = await response.json();
  return data.facilities || [];
}

export async function fetchRoute({ fromLat, fromLng, toLat, toLng }) {
  const query = new URLSearchParams({
    fromLat: String(fromLat),
    fromLng: String(fromLng),
    toLat: String(toLat),
    toLng: String(toLng),
    profile: "walking",
  });

  const response = await fetch(`/api/route?${query.toString()}`);
  if (!response.ok) {
    throw new Error("ルート取得に失敗しました。");
  }
  return response.json();
}

export async function geocodeAddress(query) {
  const params = new URLSearchParams({ query });
  const response = await fetch(`/api/geocode?${params.toString()}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "住所の変換に失敗しました。");
  }
  return response.json();
}

export async function reverseGeocode(lat, lng) {
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const response = await fetch(`/api/reverse-geocode?${params.toString()}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "現在位置の住所化に失敗しました。");
  }
  return response.json();
}
