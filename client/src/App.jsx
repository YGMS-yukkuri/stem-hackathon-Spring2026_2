import { useEffect, useMemo, useState } from "react";
import { fetchRoute, searchFacilities } from "./lib/api";
import { formatDistance, formatDuration } from "./lib/format";
import { getOrCreateUserId, loadSavedItems, saveSavedItems } from "./lib/storage";

const CATEGORY_OPTIONS = [
  { label: "すべて", value: "all" },
  { label: "カフェ", value: "cafe" },
  { label: "レストラン", value: "restaurant" },
  { label: "コンビニ", value: "convenience" },
  { label: "公園", value: "park" },
  { label: "観光", value: "attraction" },
];

function createSavedItem(userId, facility) {
  return {
    id: crypto.randomUUID(),
    userId,
    facilityId: facility.id,
    alias: facility.name,
    note: "",
    createdAt: new Date().toISOString(),
    facility,
  };
}

export default function App() {
  const [userId, setUserId] = useState("");
  const [coords, setCoords] = useState({ lat: "", lng: "" });
  const [radius, setRadius] = useState(1000);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");

  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingRouteId, setLoadingRouteId] = useState("");

  const [error, setError] = useState("");
  const [results, setResults] = useState([]);
  const [selectedResultIds, setSelectedResultIds] = useState([]);
  const [savedItems, setSavedItems] = useState([]);
  const [selectedSavedIds, setSelectedSavedIds] = useState([]);

  const [routeInfoByFacilityId, setRouteInfoByFacilityId] = useState({});
  const [savedKeyword, setSavedKeyword] = useState("");
  const [savedSort, setSavedSort] = useState("newest");

  useEffect(() => {
    const id = getOrCreateUserId();
    setUserId(id);
    setSavedItems(loadSavedItems());
  }, []);

  useEffect(() => {
    saveSavedItems(savedItems);
  }, [savedItems]);

  const filteredSavedItems = useMemo(() => {
    const q = savedKeyword.trim().toLowerCase();
    const base = savedItems.filter((item) => {
      if (!q) {
        return true;
      }
      const target = `${item.alias} ${item.note} ${item.facility?.category || ""}`.toLowerCase();
      return target.includes(q);
    });

    if (savedSort === "name") {
      return [...base].sort((a, b) => a.alias.localeCompare(b.alias, "ja"));
    }
    if (savedSort === "oldest") {
      return [...base].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return [...base].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [savedItems, savedKeyword, savedSort]);

  const selectCurrentLocation = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("このブラウザでは位置情報を利用できません。手動入力を利用してください。");
      return;
    }

    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude.toFixed(6),
          lng: position.coords.longitude.toFixed(6),
        });
        setLoadingLocation(false);
      },
      () => {
        setLoadingLocation(false);
        setError("位置情報を取得できませんでした。手動で緯度・経度を入力してください。");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    setError("");
    setLoadingSearch(true);
    setSelectedResultIds([]);

    try {
      const facilities = await searchFacilities({
        lat: coords.lat,
        lng: coords.lng,
        radius,
        keyword,
        category,
      });
      setResults(facilities);
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : "検索に失敗しました。");
    } finally {
      setLoadingSearch(false);
    }
  };

  const toggleResultSelection = (facilityId) => {
    setSelectedResultIds((prev) =>
      prev.includes(facilityId) ? prev.filter((id) => id !== facilityId) : [...prev, facilityId]
    );
  };

  const toggleSavedSelection = (savedId) => {
    setSelectedSavedIds((prev) =>
      prev.includes(savedId) ? prev.filter((id) => id !== savedId) : [...prev, savedId]
    );
  };

  const addToSaved = (facility) => {
    setSavedItems((prev) => {
      const duplicated = prev.some((item) => item.facilityId === facility.id);
      if (duplicated) {
        return prev;
      }
      return [createSavedItem(userId, facility), ...prev];
    });
  };

  const updateSavedItem = (savedId, patch) => {
    setSavedItems((prev) => prev.map((item) => (item.id === savedId ? { ...item, ...patch } : item)));
  };

  const deleteSavedItem = (savedId) => {
    setSavedItems((prev) => prev.filter((item) => item.id !== savedId));
    setSelectedSavedIds((prev) => prev.filter((id) => id !== savedId));
  };

  const pickRandomResult = () => {
    if (selectedResultIds.length === 0) {
      setError("検索結果から1件以上チェックしてください。");
      return;
    }
    const randomId = selectedResultIds[Math.floor(Math.random() * selectedResultIds.length)];
    const selected = results.find((r) => r.id === randomId);
    if (selected) {
      alert(`ランダム選択: ${selected.name}`);
    }
  };

  const pickRandomSaved = () => {
    if (selectedSavedIds.length === 0) {
      setError("保存一覧から1件以上チェックしてください。");
      return;
    }
    const randomId = selectedSavedIds[Math.floor(Math.random() * selectedSavedIds.length)];
    const selected = savedItems.find((r) => r.id === randomId);
    if (selected) {
      alert(`保存済みランダム選択: ${selected.alias}`);
    }
  };

  const loadRoute = async (facility) => {
    if (!coords.lat || !coords.lng) {
      setError("先に現在位置を入力してください。");
      return;
    }

    setLoadingRouteId(facility.id);
    setError("");
    try {
      const route = await fetchRoute({
        fromLat: coords.lat,
        fromLng: coords.lng,
        toLat: facility.lat,
        toLng: facility.lng,
      });
      setRouteInfoByFacilityId((prev) => ({ ...prev, [facility.id]: route }));
    } catch (_routeError) {
      setError("ルート情報の取得に失敗しました。");
    } finally {
      setLoadingRouteId("");
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">STEM HACKATHON 2026</p>
        <h1>寄り道ナビ・プロトタイプ</h1>
        <p>現在地から近場の施設を探し、保存・整理・ランダム選択まで一気に操作できます。</p>
        <div className="user-chip">userId: {userId || "作成中..."}</div>
      </header>

      <main className="layout">
        <section className="panel">
          <h2>1. 現在位置と検索条件</h2>
          <form onSubmit={handleSearch} className="grid-form">
            <button type="button" onClick={selectCurrentLocation} disabled={loadingLocation}>
              {loadingLocation ? "位置取得中..." : "現在位置を取得"}
            </button>

            <label>
              緯度
              <input
                value={coords.lat}
                onChange={(e) => setCoords((prev) => ({ ...prev, lat: e.target.value }))}
                placeholder="35.681236"
              />
            </label>
            <label>
              経度
              <input
                value={coords.lng}
                onChange={(e) => setCoords((prev) => ({ ...prev, lng: e.target.value }))}
                placeholder="139.767125"
              />
            </label>

            <label>
              キーワード
              <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="例: coffee" />
            </label>

            <label>
              カテゴリ
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              半径: {radius}m
              <input
                type="range"
                min="100"
                max="3000"
                step="100"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>

            <button type="submit" disabled={loadingSearch}>
              {loadingSearch ? "検索中..." : "近隣施設を検索"}
            </button>
          </form>
          {error ? <p className="error-text">{error}</p> : null}
        </section>

        <section className="panel">
          <div className="section-row">
            <h2>2. 検索結果</h2>
            <button type="button" onClick={pickRandomResult}>
              選択候補からランダム
            </button>
          </div>

          {results.length === 0 ? <p className="muted">検索結果はまだありません。</p> : null}

          <div className="cards">
            {results.map((facility) => {
              const route = routeInfoByFacilityId[facility.id];
              return (
                <article className="card" key={facility.id}>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedResultIds.includes(facility.id)}
                      onChange={() => toggleResultSelection(facility.id)}
                    />
                    ランダム対象に含める
                  </label>

                  <h3>{facility.name}</h3>
                  <p>{facility.address}</p>
                  <p>
                    距離: {formatDistance(facility.distanceMeters)} / 徒歩目安: {formatDuration(facility.etaMinutes)}
                  </p>
                  <p>カテゴリ: {facility.category}</p>
                  {facility.phone ? <p>TEL: {facility.phone}</p> : null}
                  {facility.url ? (
                    <p>
                      URL:
                      <a href={facility.url} target="_blank" rel="noreferrer">
                        {facility.url}
                      </a>
                    </p>
                  ) : null}
                  {facility.opening_hours ? <p>営業時間: {facility.opening_hours}</p> : null}

                  <div className="actions">
                    <button type="button" onClick={() => addToSaved(facility)}>
                      保存
                    </button>
                    <button type="button" onClick={() => loadRoute(facility)} disabled={loadingRouteId === facility.id}>
                      {loadingRouteId === facility.id ? "計算中..." : "ルート時間/距離"}
                    </button>
                  </div>

                  {route ? (
                    <p className="route-box">
                      ルート: {formatDistance(route.distanceMeters)} / {formatDuration(route.durationMinutes)} ({route.source})
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="section-row">
            <h2>3. 保存済み一覧</h2>
            <button type="button" onClick={pickRandomSaved}>
              保存済みからランダム
            </button>
          </div>

          <div className="saved-filter">
            <input
              placeholder="保存済みを検索"
              value={savedKeyword}
              onChange={(e) => setSavedKeyword(e.target.value)}
            />
            <select value={savedSort} onChange={(e) => setSavedSort(e.target.value)}>
              <option value="newest">新しい順</option>
              <option value="oldest">古い順</option>
              <option value="name">名前順</option>
            </select>
          </div>

          {filteredSavedItems.length === 0 ? <p className="muted">保存済みデータはありません。</p> : null}

          <div className="cards">
            {filteredSavedItems.map((item) => (
              <article className="card" key={item.id}>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={selectedSavedIds.includes(item.id)}
                    onChange={() => toggleSavedSelection(item.id)}
                  />
                  ランダム対象に含める
                </label>

                <label>
                  表示名
                  <input
                    value={item.alias}
                    onChange={(e) => updateSavedItem(item.id, { alias: e.target.value })}
                  />
                </label>
                <label>
                  メモ
                  <textarea value={item.note} onChange={(e) => updateSavedItem(item.id, { note: e.target.value })} />
                </label>

                <p>{item.facility?.address || "住所情報なし"}</p>
                <p>
                  座標: {item.facility?.lat}, {item.facility?.lng}
                </p>
                <button type="button" onClick={() => deleteSavedItem(item.id)}>
                  削除
                </button>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
