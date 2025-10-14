/**
 * tr_map (Leaflet + OSM/Nominatim + Overpass)
 * -----------------------------------------------------------------------------
 * ■ 목적
 *   - 전 세계 장소 검색(자동완성 유사 리스트업) + 지도 클릭 역지오코딩
 *   - 지도에는 항상 "메인 마커 1개"만 유지
 *   - 선택된 장소 정보를 jQuery 커스텀 이벤트('trmp:place-selected')로 외부에 통지
 *
 * ■ 주요 외부 의존성
 *   - Leaflet (L.map, L.marker, L.tileLayer 등)
 *   - Nominatim (검색/역지오코딩), Overpass API (세부 태그 조회)
 *   - window.jQuery 존재 시 이벤트 디스패치(없어도 동작)
 *
 * ■ 접근성/UX
 *   - 검색 입력: <input type="search">, 결과 목록: <ul role="listbox">, <li role="option">
 *   - 디바운스(350ms)로 API 남발 방지
 *
 * ■ 팀 작업시 주의
 *   - 코드 수정 없이 주석만 추가함(원문 보전)
 *   - Nominatim/Overpass는 무료 공공 서비스 → 과도 호출 금지(디바운스/limit 준수)
 *   - 결과 클릭/지도 클릭 시 모두 동일 이벤트('trmp:place-selected')를 발생시켜
 *     외부 모듈(tr_reviews, tr_rating 등)이 한 흐름으로 연동 가능
 */

(function(){
  let map;
  let mainMarker = null; // 지도에 유지할 메인 마커 1개(이전 마커는 제거하고 항상 1개만 표시)

  /**
   * [헬퍼] 메인 마커를 (lat,lng)로 갱신하고, 필요하면 팝업을 바인딩/오픈
   * - 기존 mainMarker가 있으면 지우고 새로 추가
   * - 팝업 HTML은 간단한 정보/링크를 보여주는 용도로 사용
   */
  function setMainMarker(lat, lng, popupHtml){
    if (mainMarker) map.removeLayer(mainMarker);
    mainMarker = L.marker([lat, lng]).addTo(map);
    if (popupHtml) mainMarker.bindPopup(popupHtml).openPopup();
  }

  /**
   * [헬퍼] OSM 타입 문자열 정규화
   * - Nominatim/Overpass는 node/way/relation 3가지 타입 사용
   * - 일부 응답이 'n','w','r' 또는 대소문자 섞여 들어올 수 있어 안전하게 정규화
   */
  function normalizeOsmType(t){
    const s = String(t||'').toLowerCase();
    if (s.startsWith('n')) return 'node';
    if (s.startsWith('w')) return 'way';
    if (s.startsWith('r')) return 'relation';
    return null;
  }

  /**
   * [비동기] Overpass API로 특정 OSM 개체의 tags만 조회
   * - 입력: osm_type(node/way/relation or n/w/r), osm_id(정수)
   * - 출력: 태그 객체(예: { amenity: 'cafe', name: '...' }) 또는 null
   * - 네트워크 실패/타임아웃 시 null 반환
   *
   * Overpass 쿼리:
   *   [out:json][timeout:10];
   *   node(123456);    // or way(...)/relation(...)
   *   out tags;        // geometry(x), body(x), tags만
   */
  async function fetchOsmTags(osm_type, osm_id){
    const t = normalizeOsmType(osm_type);
    if (!t || !osm_id) return null;
    const q = `[out:json][timeout:10]; ${t}(${osm_id}); out tags;`;
    try{
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body: new URLSearchParams({ data: q })
      });
      if(!res.ok) return null;
      const json = await res.json();
      if (json && Array.isArray(json.elements) && json.elements[0] && json.elements[0].tags){
        return json.elements[0].tags;
      }
    }catch(_e){}
    return null;
  }

  /**
   * 초기화 진입점
   * 1) Leaflet 지도 생성(서울 시청 근처 좌표, 줌 13)
   * 2) 타일 레이어(Carto light_all) 추가
   * 3) 좌상단에 "검색 컨트롤" 1회 생성(검색 입력창 + 결과 리스트)
   * 4) 입력 디바운스 후 Nominatim 검색 → 클릭 시 pickResult()
   * 5) 지도 클릭 시 역지오코딩(reverse) → 마커 갱신 + 이벤트 통지
   */
  function init(){
    // 1) 지도: 기본 중심(서울) / 줌 레벨
    map = L.map('trmp_map', { center:[37.5665,126.9780], zoom:13 }); 

    // 2) 타일: Carto의 light_all 스타일(회색톤 베이스맵)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM</a> ' +
        '&copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>'
    }).addTo(map);

    // 3) (한 번만) 검색 컨트롤 UI를 Leaflet Control로 추가
    //    - 내부에 input(#trmp_search_input) + ul(#trmp_search_results) 구성
    const searchCtrl = L.control({ position:'topleft' });
    searchCtrl.onAdd = function(){
      const div = L.DomUtil.create('div', 'trmp_search_control');
      div.innerHTML = [
        '<input id="trmp_search_input" type="search" placeholder="장소 검색(전세계)" aria-label="장소 검색">',
        '<ul id="trmp_search_results" role="listbox" aria-label="검색 결과"></ul>'
      ].join('');
      // 컨트롤에서 마우스/스크롤 이벤트가 지도 드래그/줌으로 전파되지 않도록 차단
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    searchCtrl.addTo(map);

    // 검색 입력/결과 DOM
    const $input = document.getElementById('trmp_search_input');
    const $list  = document.getElementById('trmp_search_results');
    let searchTimer = null; // 디바운서 타이머 핸들

    // 결과 목록 비우기
    function clearResults(){ if($list) $list.innerHTML=''; }

    /**
     * 사용자가 결과 리스트의 항목을 클릭했을 때 실행
     * - 지도 이동/줌(17레벨) + OSM 보기 링크 구성
     * - Overpass로 세부 태그 조회(가능한 경우)
     * - 메인 마커 갱신 + 커스텀 이벤트('trmp:place-selected') 발사
     */
    function pickResult(r){
      clearResults();
      const lat = parseFloat(r.lat);
      const lng = parseFloat(r.lon);
      map.setView([lat,lng],17);

      // OSM URL/편집 URL 구성(가능할 때만)
      const osmType = normalizeOsmType(r.osm_type);
      const osmId   = r.osm_id;
      const osmUrl  = (osmType && osmId)
        ? `https://www.openstreetmap.org/${osmType}/${osmId}`
        : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${map.getZoom()}/${lat}/${lng}`;
      const osmEdit = (osmType && osmId) ? `https://www.openstreetmap.org/edit?${osmType}=${osmId}` : null;

      (async () => {
        // 세부 태그(amenity, opening_hours 등) 조회 시도(실패해도 앱 흐름엔 영향 없음)
        let tags = {};
        try { if (osmType && osmId) tags = (await fetchOsmTags(osmType, osmId)) || {}; } catch{}

        // 팝업(장소 전체 이름 + OSM 링크)
        const popupHtml = `<div style="max-width:260px">
          <strong>${r.display_name}</strong><br/>
          <a href="${osmUrl}" target="_blank" rel="noopener">OpenStreetMap에서 보기</a>
        </div>`;
        setMainMarker(lat, lng, popupHtml);

        // jQuery가 있으면 외부 모듈에게 "장소가 선택되었음"을 통지
        // - 외부에서 이 이벤트를 받아 카드 생성/수정/요약 갱신 등을 처리
        if (window.jQuery) {
          jQuery(document).trigger('trmp:place-selected', {
            lat, lng,
            name: r.display_name,
            url:  osmUrl,
            osm:  { type: osmType, id: osmId, editUrl: osmEdit },
            tags
          });
        }
      })();
    }

    // 입력창 이벤트: 디바운스 후 Nominatim 검색 호출
    if ($input){
      $input.addEventListener('input', () => {
        const q = $input.value.trim();
        clearResults();
        if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
        if (!q) return;

        // 350ms 디바운스: 타이핑이 멈춘 후 요청
        searchTimer = setTimeout(async () => {
          const url = new URL('https://nominatim.openstreetmap.org/search');
          url.searchParams.set('q', q);
          url.searchParams.set('format', 'json');
          url.searchParams.set('addressdetails', '1');
          url.searchParams.set('limit', '7');               // 결과 개수 제한 (API 매너)
          url.searchParams.set('accept-language', 'ko,en'); // 한/영 우선

          try{
            const res = await fetch(url.toString(), { headers:{'Accept':'application/json'} });
            if(!res.ok) return;
            const items = await res.json();
            if(!Array.isArray(items) || !items.length) return;

            // 결과 리스트 렌더링: <li role="option">로 클릭 가능하게
            items.forEach((r,i) => {
              const li = document.createElement('li');
              li.setAttribute('role','option');
              li.id = `trmp_rs_${i}`;
              li.textContent = r.display_name || `${r.lat}, ${r.lon}`;
              li.style.cursor = 'pointer';
              li.addEventListener('click', () => pickResult(r));
              $list.appendChild(li);
            });
          }catch(_e){}
        }, 350);
      });
    }

    // 4) 지도 빈 곳 클릭 → 역지오코딩(해당 좌표의 주소/장소명 유추)
    //    - 마커는 동일하게 "1개만 유지"
    //    - 결과를 팝업으로 보여주고, 동일한 커스텀 이벤트로 외부에 통지
    map.on('click', async (e) => {
      const { lat, lng } = e.latlng;
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ko,en`;

      // 기본값(네트워크 실패 대비)
      let placeName = '선택한 위치';
      let osmUrl    = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${map.getZoom()}/${lat}/${lng}`;
      let data;

      // 역지오코딩 요청
      try{
        const res = await fetch(url, { headers:{'Accept':'application/json'} });
        if (res.ok){
          data = await res.json();
          if (data.display_name) placeName = data.display_name;

          // 응답에 OSM 개체 정보가 있으면 해당 개체 페이지 URL로 고도화
          if (data.osm_type && data.osm_id){
            const typ = String(data.osm_type).toLowerCase();
            if (['node','way','relation'].includes(typ)){
              osmUrl = `https://www.openstreetmap.org/${typ}/${data.osm_id}`;
            }
          }
        }
      }catch(_e){}

      // 편집 URL/태그 조회 준비
      let osmType=null, osmId=null, osmEditUrl=null, placeTags=null;
      if (data && data.osm_type && data.osm_id){
        // n/w/r 또는 대소문 섞인 경우를 대비하여 안전 변환
        osmType = (String(data.osm_type).toLowerCase().startsWith('n') ? 'node'
                : String(data.osm_type).toLowerCase().startsWith('w') ? 'way'
                : 'relation');
        osmId   = data.osm_id;
        osmEditUrl = `https://www.openstreetmap.org/edit?${osmType}=${osmId}`;

        // Overpass로 태그 조회(실패해도 무시)
        try { placeTags = await fetchOsmTags(osmType, osmId); } catch{}
      }

      // 팝업(역지오코딩된 장소 전체 이름 + OSM 링크)
      const popupHtml = `<div style="max-width:260px">
        <strong>${placeName}</strong><br/>
        <a href="${osmUrl}" target="_blank" rel="noopener">OpenStreetMap에서 자세히 보기</a>
      </div>`;
      setMainMarker(lat, lng, popupHtml);

      // 동일 커스텀 이벤트로 외부에 통지 → 외부 모듈 흐름 재사용 가능
      if (window.jQuery){
        jQuery(document).trigger('trmp:place-selected', {
          lat, lng,
          name: placeName,
          url:  osmUrl,
          osm:  { type: osmType, id: osmId, editUrl: osmEditUrl },
          tags: placeTags || {}
        });
      }
    });
  }

  // 문서 준비 상태에 따라 init 실행
  // - DOMContentLoaded 이전이면 이벤트로 지연
  // - 이미 로드된 상태면 즉시 실행
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
