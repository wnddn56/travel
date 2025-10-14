// ============================================================================
// tr_reviews2.js (DOM 위임 + 카드/리뷰 작성/메타 관리)
// ----------------------------------------------------------------------------
// ■ 역할 개요
//   - 지도 선택/검색 결과(trmp:place-selected 이벤트)를 받아 카드(li)를 생성/재사용
//   - 동일 장소(OsmType+OsmId 또는 URL/이름 기반 키)로 리뷰를 누적(한 제목 아래 카드 쌓기)
//   - 펼치기/접기, 점 3개 메뉴(수정/삭제), 파일 업로드 미리보기, 작성/취소 흐름 제어
//   - 상단 제목(h3) 옆에 평균 별점 + 리뷰 수 요약 배지 갱신
//   - OSM 태그 부족 시 "정보 제안하기(OSM)"와 "정보 직접 입력" 폼 제공(+localStorage 캐시)
// ----------------------------------------------------------------------------
// ■ 외부 의존
//   - jQuery(이 파일은 전부 이벤트 위임 기반이므로 동적 DOM에도 안전)
//   - tr_map.js(Leaflet 쪽): 장소가 선택되면 document에 'trmp:place-selected' 트리거
// ----------------------------------------------------------------------------
// ■ 접근성/UX
//   - role="radio" 별점 버튼, aria-checked 토글
//   - aria-label에 "별점 X점"을 유지해서 평균 계산 로직이 텍스트 파싱으로 동작
// ----------------------------------------------------------------------------
// ■ 데이터 구조
//   - window.trmpPlaceIndex : Map<placeKey, jQuery<li>>  // 장소키→해당 카드 li를 캐시
//   - window.trmpActivePlace : 마지막으로 선택된 장소 payload (작성 시 같은 카드로 라우팅)
//   - placeKey 규칙 : 기본은 OSM 타입/ID, 없을 경우 URL/이름 문자열 정규화로 키 생성
// ============================================================================

$(document).ready(function () {  // 문서 전체 DOM 준비 후 이벤트 위임 바인딩 시작


// 전역(세션 단위) 장소 인덱스/활성 장소 상태 초기화(이미 있으면 재사용)
window.trmpPlaceIndex  = window.trmpPlaceIndex || new Map(); 
window.trmpActivePlace = window.trmpActivePlace || null;

// -------------------------------------------------------------
// [헬퍼] 선택한 장소 payload → 고유 키(placeKey) 생성
// 1) OSM 타입/ID가 있으면 'type:id' (가장 신뢰도 높음)
// 2) 없을 경우 url 또는 name을 소문자/공백 제거/문자숫자만 남기기
//    └ 동일 주소/동일 상호를 같은 카드로 누적시키기 위함
// -------------------------------------------------------------
function makePlaceKey(payload){
  if (payload && payload.osm && payload.osm.type && payload.osm.id) {
    return `${payload.osm.type}:${payload.osm.id}`; 
  }
  const raw = (payload && (payload.url || payload.name) || '').toString().toLowerCase();

  return raw.replace(/\s+/g,'').replace(/[^\p{L}\p{N}]/gu,'');
}

// -------------------------------------------------------------
// [헬퍼] 평균값으로 5개 미니 별(★) HTML 생성
// - 평균은 반올림하여 정수 별 채움
// - 색상 토큰: 채움 #f59e0b, 빈칸 #d1d5db (별점 UI와 통일)
// -------------------------------------------------------------
function trmpMiniStars(avg){
  const n = Math.round(Number(avg) || 0);
  let html = '';
  for (let i=1;i<=5;i++){
    const color = (i<=n) ? '#f59e0b' : '#d1d5db';
    html += `<span class="trmp_star_mini" style="font-size:14px; line-height:1; vertical-align:middle; color:${color};">★</span>`;
  }
  return html;
}

// 항상 1개의 "빈 템플릿 li"가 존재하도록 보장
function trmpEnsureBlankTemplate(){
  const $list = $('.trmp_review_list');
  if (!$list.length) return;

  // data-place-key가 없는 카드가 이미 있으면(=빈 템플릿) 종료
  const $blank = $list.children('li').filter(function(){
    return !$(this).find('.trmp_card').attr('data-place-key');
  }).first();
  if ($blank.length) return;

  // 없으면 첫 li를 복제해 '빈 템플릿'으로 초기화하여 맨 위에 추가
  const $tpl = $list.children('li').first().clone(true, true);

  // id/for 충돌 제거
  $tpl.find('#trmp_file_upload').attr('id','');
  $tpl.find('label[for="trmp_file_upload"]').attr('for','');

  // 장소 키 제거 + 제목/링크 초기화
  $tpl.find('.trmp_card').removeAttr('data-place-key');
  $tpl.find('.trmp_card_head .trmp_place_link').text('제목').attr('href','#');

  // 메타/뷰/입력 초기화
  $tpl.find('.trmp_place_meta').remove();
  $tpl.find('.trmp_content_view_area').empty();
  $tpl.find('.trmp_text_area').val('');
  $tpl.find('.trmp_file_upload').val('');
  $tpl.find('.tr_ratingVal').val('0');
  $tpl.find('.trmp_file_preview').empty();
  $tpl.find('.tr_starBox [role="radio"]').attr('aria-checked','false').each(function(){ this.style.color=''; });

  // 접어두기(사용자가 입력 시작할 때만 제목이 생기도록)
  $tpl.find('.trmp_card_body').removeClass('on').addClass('off');
  $tpl.find('.trmp_content_area').css('display','none');
  $tpl.find('.trmp_content_write_area').hide();

  $list.prepend($tpl);
}

// -------------------------------------------------------------
// [UI] 카드 본문 펼치기/접기 토글 (화살표 아이콘 up/down 전환)
// - .trmp_expend_btn_area 클릭 시 해당 카드의 본문 on/off
// - 이미지 아이콘 src로 상태 전환(업무 요구사항 유지)
// -------------------------------------------------------------
  $(document).on('click.mypage-toggle', '.trmp_expend_btn_area', function () {
    const $card = $(this).closest('.trmp_card');  
    const $body = $card.find('.trmp_card_body');  
    const $img  = $(this).find('img');        

    if ($body.hasClass('off')) {
      $body.removeClass('off').addClass('on');              
      if ($img.attr('src') === 'img/down.png') $img.attr('src', 'img/up.png'); 
    } else {
      $body.removeClass('on').addClass('off');                 
      if ($img.attr('src') === 'img/up.png') $img.attr('src', 'img/down.png'); 
    }
  });

// -------------------------------------------------------------
// [UI] 카드 우상단 점3개(설정) 메뉴 열기/닫기
// - 버튼 옆의 .trmp_btn_ul을 토글, 다른 메뉴는 닫음
// - 문서 클릭으로 바깥 클릭시 닫기
// -------------------------------------------------------------
  $(document).on('click.mypage-menu', '.trmp_btn_area .trmp_set_btn', function (e) {
    e.preventDefault();                           // a/button 기본동작 차단
    e.stopPropagation();                          // 상위로 클릭 전파 차단
    const $menu = $(this).siblings('.trmp_btn_ul');  
    $('.trmp_btn_ul').not($menu).hide();               // 다른 카드의 메뉴는 닫기
    $menu.toggle();                               // 대상 메뉴만 토글
  });
  $(document).on('click.mypage-menu-close', function () {
    $('.trmp_btn_ul').hide();                     // 문서 아무 곳 클릭 시 모두 닫기
  });

// -------------------------------------------------------------
// [UI] 메뉴 항목 실행: '수정' / '삭제'
// - 수정: 보기 → 쓰기 폼으로 전환 + 기존 내용/별점 복원
// - 삭제: 카드 li 제거(확인창)
// -------------------------------------------------------------
$(document).on('click.mypage-menu-action', '.trmp_btn_ul li', function (e) {
  e.preventDefault();
  e.stopPropagation();

  const action = ($(this).text() || '').trim();              // 메뉴 텍스트로 분기
  const $menu  = $(this).closest('.trmp_btn_ul');            // 해당 메뉴 DOM
  const $card  = $(this).closest('.trmp_card');              // 대상 카드
  const $li    = $card.closest('li');
  const $view  = $card.find('.trmp_content_view_area')       // 게시글(보기) 영역
  const $write = $card.find('.trmp_content_write_area');     // 작성(쓰기) 영역

  // 공통: 메뉴 닫기
  $menu.hide();

  if (action === '수정') {
    $card.addClass('is-editing');  // 수정모드 플래그(작성 핸들러에서 분기)
  
    const oldText = ($view.find('.text').text() || '').trim(); // 기존 본문 텍스트 복원
  
    const aria = $view.find('.review_headline').attr('aria-label') || '';
    const m = aria.match(/별점\s*(\d)\s*점/);
    const oldRating = m ? parseInt(m[1], 10) : 0;            // aria-label에서 별점 파싱(0~5)

    // 폼에 기존 값 삽입
    $card.find('.trmp_text_area').val(oldText);              
    $card.find('.tr_ratingVal').val(String(oldRating));      

    // 별점 UI 복원(버튼 클릭 트리거해 paint 로직 재사용)
    if (oldRating > 0) {
      const $btn = $card.find(`.tr_starBox button[data-val="${oldRating}"]`);
      if ($btn.length) $btn.trigger('click');
    } else {
      // 별점 없던 경우: 기본 포커스/스타일 초기상태 유지
      const box = $card.find('.tr_starBox')[0];
      if (box) {
        // 필요 시 기본 안내/placeholder에 의존(의도적으로 로직 없음)
        const $btn0 = $card.find(`.tr_starBox button[data-val="1"]`);
        
      }
    }

    // 보기 숨김 → 쓰기 폼 표시 + 포커스
    $card.find('.trmp_content_area').hide();               
    $write.show().get(0)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $card.find('.trmp_text_area').focus();

  } else if (action === '삭제') {
    if (!confirm('이 게시글을 삭제할까요?')) return;

    $li.remove();  // 해당 카드 자체 삭제(리뷰/메타 포함)
  }
});

// -------------------------------------------------------------
// [파일] '파일 선택' 라벨 클릭 → 실제 input[type=file] 클릭 위임
// - 레이블 클릭으로 업로드 창 열리게 함
// -------------------------------------------------------------
  $(document).on('click.mypage-file', '.trmp_file_label', function (e) {
    e.preventDefault(); 
    const $card  = $(this).closest('.trmp_card');      
    const $input = $card.find('.trmp_file_upload').first(); 
    if ($input.length && $input[0].click) $input[0].click(); 
  });

// -------------------------------------------------------------
// [파일] 업로드 변경 시 미리보기 렌더링
// - 이미지면 썸네일 + 파일명, 이미지가 아니면 파일명만
// - ObjectURL 생성/로드 후 해제해서 메모리 누수 방지
// -------------------------------------------------------------
  $(document).on('change', '.trmp_file_upload', function () {
    const input  = this;                          // DOM input 엘리먼트
    const $card  = $(input).closest('.trmp_card');    
  
    let $preview = $card.find('.trmp_file_preview');
    if ($preview.length === 0) {
      $preview = $('<div class="trmp_file_preview" style="margin-top:6px;"></div>');
      $(input).closest('.trmp_file_area').after($preview);
    }
    $preview.empty();                              // 기존 미리보기 초기화

    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);        
    files.forEach(file => {
      if (file.type && file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);    // 임시 URL
        const $item = $(`
          <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
            <img src="${url}" alt="미리보기"
                 style="width:56px; height:56px; object-fit:cover; border-radius:6px; display:block;">
            <span style="font-size:0.9rem;">${file.name}</span>
          </div>
        `);
        // 이미지 로딩 후 URL 해제 (메모리 관리)
        $item.find('img').on('load', () => URL.revokeObjectURL(url));
        $preview.append($item);                   
      } else {
        // 이미지가 아닌 파일(예: pdf)일 경우 파일명만 표시
        $preview.append(`<div style="margin-top:4px; font-size:0.9rem;">${file.name}</div>`);
      }
    });
  });

// -------------------------------------------------------------
// [안전] 중복 바인딩 방지: 작성 트리거 이벤트 네임스페이스 해제
// -------------------------------------------------------------
  $(document).off('click.mypage-write');


// -------------------------------------------------------------
// [작성] '작성' 버튼 처리
// - 현재 카드가 템플릿인지/기존 장소 카드가 있는지 확인하여 대상 카드 결정
// - 리뷰 DOM(별/날짜/본문/사진) 추가
// - 제목 옆 요약(평균 별점 + (리뷰 수)) 갱신
// - 같은 장소 카드는 리스트 상단으로 이동
// - 수정모드/일반모드에 따라 입력폼 리셋 방식 분기
// -------------------------------------------------------------
$(document).on('click.mypage-write', '.trmp_write_btn_area button', function (e) {
  const $btn  = $(this);
  const label = ($btn.text() || '').trim();
  if (label !== '작성') return;                   // '작성' 버튼이 아닌 경우 무시
  e.preventDefault();

  const $card = $btn.closest('.trmp_card');
  const $li   = $card.closest('li');
  const $list = $('.trmp_review_list');

  // 입력값 취합
  const text    = $card.find('.trmp_text_area').val().trim();
  const rating  = parseInt($card.find('.tr_ratingVal').val(), 10) || 0;
  const $fileEl = $card.find('.trmp_file_upload');
  const hasFiles = !!($fileEl[0] && $fileEl[0].files && $fileEl[0].files.length > 0);

  // 최소 입력 검증: 별/내용/사진 중 1개 이상
  if (!text && rating === 0 && !hasFiles) {
    alert('별점/내용/사진 중 하나 이상을 입력해 주세요.');
    return;
  }

  // 활성 장소 키로 동일 장소 카드 찾기(있으면 그 카드로 누적, 없으면 현재 li를 승격)
  const key = $card.attr('data-place-key') || makePlaceKey(window.trmpActivePlace);


  let $targetLi, $targetCard;
  if (key && window.trmpPlaceIndex.has(key)) {
    // 기존 카드가 인덱스에 있음 → 그 카드에 누적
    $targetLi   = window.trmpPlaceIndex.get(key);
    $targetCard = $targetLi.find('.trmp_card').first();
  } else {
    // 인덱스에 없음 → 현재 템플릿 li를 그 장소의 첫 카드로 사용
    $targetLi   = $li;
    $targetCard = $card;
    if (key) {
      $targetCard.attr('data-place-key', key);
      window.trmpPlaceIndex.set(key, $targetLi);
    }
    const active = window.trmpActivePlace;

    // 제목 링크(장소명/URL) 세팅
    if (active && active.name && active.url) {
      const $titleLink = $targetCard.find('.trmp_card_head .trmp_place_link');
      if ($titleLink.length) $titleLink.text(active.name).attr('href', active.url);
    }
  }

  // 게시(보기) 영역 핸들
  const $view = $targetCard.find('.trmp_content_view_area');

  // 별점 미니 렌더링을 위한 색 정의(작성 아이템 헤더에 사용)
  const STAR_FILL  = '#f59e0b';
  const STAR_EMPTY = '#d1d5db';
  const starsHtml = (rating > 0)
    ? `<span class="stars">
         <span style="color:${STAR_FILL}">${'★'.repeat(rating)}</span>
         <span style="color:${STAR_EMPTY}">${'☆'.repeat(5 - rating)}</span>
       </span>`
    : '';
  const ariaLabel = (rating > 0) ? `별점 ${rating}점` : `별점 없음`;

  // 지역화된 날짜(오늘 날짜)
  const ts = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  // 리뷰 아이템 DOM 추가(별/날짜 + 본문)
  $view.append(`
    <article class="trmp_review_item">
      <div class="review_headline" aria-label="${ariaLabel}">
        ${starsHtml}
        <span class="date" style="margin-left:${rating>0 ? '8px' : '0'};">${ts}</span>
      </div>
      <p class="text"></p>
    </article>
  `);
  $view.find('.trmp_review_item:last .text').text(text);

  // 즉시 이미지 렌더링(IIFE): 파일 첨부가 있으면 figure/img 추가
  (function renderImages(){
    if (!hasFiles) return;
    const files = Array.from($fileEl[0].files);
    const $imgWrap = $('<div class="review_photos"></div>');
    files.forEach(file => {
      if (!file.type || !file.type.startsWith('image/')) return;
      const url = URL.createObjectURL(file);
      const $fig = $(`
        <figure style="margin:8px 0 0;">
          <img alt="첨부 이미지" src=""
               style="max-width:100%; height:auto; display:block; border-radius:8px;"/>
        </figure>
      `);
      $fig.find('img').attr('src', url).on('load', () => URL.revokeObjectURL(url));
      $imgWrap.append($fig);
    });
    if ($imgWrap.children().length > 0) {
      $view.find('.trmp_review_item:last').append($imgWrap);
    }
  })();

  // -----------------------------------------------------------
  // 카드 헤더 요약(평균 별점 + 리뷰 수) 갱신
  // - 모든 .trmp_review_item의 aria-label에서 별점 숫자 파싱 후 평균 계산
  // - trmpMiniStars(avg) + (count) 형식으로 렌더
  // -----------------------------------------------------------
(function updateHeadSummary(){
  const $h3 = $targetCard.find('.trmp_card_head h3');
  if (!$h3.length) return;

  const $items = $view.find('.trmp_review_item'); 
  const count = $items.length;
  let sum = 0;
  $items.each(function(){
    const aria = $(this).find('.review_headline').attr('aria-label') || '';
    const m = aria.match(/별점\s*(\d)\s*점/);
    sum += m ? parseInt(m[1],10) : 0;
  });
  const avg = count ? (sum / count) : 0;

  let $sum = $h3.find('.trmp_head_summary');
  if (!$sum.length){
    $sum = $('<span class="trmp_head_summary" aria-label="평균 별점/리뷰 수" style="margin-left:8px; font-size:0.9rem; vertical-align:middle;"></span>');
    $h3.append($sum);
  }
  // 미니 별 + 리뷰 수 표시
  $sum.html(trmpMiniStars(avg) + ` <span class="trmp_count">(${count})</span>`);
})();

  // 보기/펼침(타겟 카드): 본문 on + 보기 박스 보이기
  $targetCard.find('.trmp_content_area').css('display','block');
  $targetCard.find('.trmp_card_body').removeClass('off').addClass('on');

  // 같은 장소 카드(li)를 맨 위로(최근 활동 카드가 상단에 오도록 UX)
  const $targetLiTop = $targetCard.closest('li');
  if ($targetLiTop.index() > 0) $targetLiTop.prependTo($list);

  // 수정모드면: 새 카드 복제 없이 현재 카드만 갱신, 폼 초기화 후 종료
  if ($card.hasClass('is-editing')) {
    $card.removeClass('is-editing');
    $card.find('.trmp_content_write_area').hide();
    $card.find('.trmp_text_area').val('');
    $card.find('.trmp_file_upload').val('');
    $card.find('.tr_ratingVal').val('0');
    const $preview = $card.find('.trmp_file_preview');
    if ($preview.length) $preview.empty();
    $card.find('.tr_starBox [role="radio"]')
         .attr('aria-checked','false')
         .each(function(){ this.style.color=''; });

     trmpEnsureBlankTemplate();   // ← 다음 장소 선택용 '빈 템플릿' 확보
    return;
  }

  // 일반 작성 후: 현재 카드 입력폼 리셋
  $card.find('.trmp_content_write_area').hide();
  $card.find('.trmp_text_area').val('');
  $card.find('.trmp_file_upload').val('');
  $card.find('.tr_ratingVal').val('0');
  const $preview = $card.find('.trmp_file_preview');
  if ($preview.length) $preview.empty();
  $card.find('.tr_starBox [role="radio"]')
       .attr('aria-checked','false')
       .each(function(){ this.style.color=''; });
       
  trmpEnsureBlankTemplate();   // ← 다음 장소 선택용 '빈 템플릿' 확보
});

// -------------------------------------------------------------
// [취소] '취소' 버튼 처리: 폼 값/미리보기/별점 상태 초기화
// -------------------------------------------------------------
$(document).on('click.mypage-write', '.trmp_write_btn_area button', function (e) {
  const label = ($(this).text() || '').trim();
  if (label !== '취소') return;
  e.preventDefault();
  const $card = $(this).closest('.trmp_card');
  $card.find('.trmp_text_area').val('');
  $card.find('.trmp_file_upload').val('');
  $card.find('.tr_ratingVal').val('0');
  const $preview = $card.find('.trmp_file_preview');
  if ($preview.length) $preview.empty();
  $card.find('.tr_starBox [role="radio"]')
       .attr('aria-checked', 'false')
       .each(function(){ this.style.color = ''; });
});

// -------------------------------------------------------------
// [핵심 이벤트] trmp:place-selected (지도 모듈이 발생시킴)
// - 동일 장소가 이미 있으면 그 카드 재사용
// - 없으면 템플릿(첫 li)을 deep clone해서 새 카드로 초기화
// - OSM 태그 기반 메타 정보 카드(주소/영업시간/전화/웹사이트) 표시
// - 부족 정보가 있으면 '정보 직접 입력' 버튼 노출 → 인라인 폼으로 보완
// - 마지막에 작성 폼을 열고 포커스 이동
// -------------------------------------------------------------
    $(document).on('trmp:place-selected', function(_e, payload){
    const { name, url, osm, tags } = payload || {};
    if (!name || !url) return;
    
    const placeKey = makePlaceKey(payload);
    const $list    = $('.trmp_review_list');

    let $li, $card;

  if (placeKey && window.trmpPlaceIndex.has(placeKey)) {
    // 같은 장소 카드가 이미 있음 → 그 카드 사용
    $li   = window.trmpPlaceIndex.get(placeKey);
    $card = $li.find('.trmp_card').first();
} else {
  // [변경] 제목/카드는 아직 만들지 않는다. (입력 시작 시 생성)
  // 1) 활성 장소만 기록
  window.trmpActivePlace = payload;

  // 2) 빈 템플릿 li 찾기(= data-place-key가 없는 카드). 없으면 첫 li를 복제해 템플릿으로 만듦
  let $blank = $list.children('li').filter(function(){
    return !$(this).find('.trmp_card').attr('data-place-key');
  }).first();

  if (!$blank.length) {
    const $tpl = $list.children('li').first().clone(true, true);
    $tpl.find('#trmp_file_upload').attr('id','');
    $tpl.find('label[for="trmp_file_upload"]').attr('for','');
    $tpl.find('.trmp_card').removeAttr('data-place-key');
    $tpl.find('.trmp_card_head .trmp_place_link').text('제목').attr('href','#');
    $tpl.find('.trmp_place_meta').remove();
    $tpl.find('.trmp_content_view_area').empty();
    $tpl.find('.trmp_text_area').val('');
    $tpl.find('.trmp_file_upload').val('');
    $tpl.find('.tr_ratingVal').val('0');
    $tpl.find('.trmp_file_preview').empty();
    $tpl.find('.tr_starBox [role="radio"]').attr('aria-checked','false').each(function(){ this.style.color=''; });
    $tpl.find('.trmp_card_body').removeClass('on').addClass('off');
    $tpl.find('.trmp_content_area').css('display','none');
    $tpl.find('.trmp_content_write_area').hide();
    $list.prepend($tpl);
    $blank = $tpl;
  }

  // 3) 다른 카드들은 닫고, 빈 템플릿만 펼쳐서 "작성칸"을 보여줌 (제목은 아직 X)
  const $blankCard = $blank.find('.trmp_card');
  $('.trmp_card').not($blankCard).each(function(){
    $(this).find('.trmp_content_write_area').hide();
    $(this).find('.trmp_card_body').removeClass('on').addClass('off');
  });
  $blankCard.find('.trmp_card_body').removeClass('off').addClass('on');
  $blankCard.find('.trmp_content_area').css('display','block');
  $blankCard.find('.trmp_content_write_area').show()
  .get(0)?.scrollIntoView({behavior:'smooth', block:'center'});
// 포커스는 사용자 클릭 때만 열리도록 유지 (자동 포커스 제거)

  // 4) 여기서는 제목/키를 세팅하지 않고 종료 (입력 시작 시 trmpRevealWriteArea가 세팅)
  return;
}

  window.trmpActivePlace = payload;


  // 2) 제목/링크
    const $titleLink = $card.find('.trmp_card_head .trmp_place_link');
    if ($titleLink.length) {
      $titleLink.text(name).attr('href', url);
    } else {
      const $h3 = $card.find('.trmp_card_head h3').first();
      $h3.empty().append(
        $('<a/>', { 'class':'trmp_place_link', href:url, target:'_blank', rel:'noopener', text:name })
      );
    }

  // 3) OSM 태그 → 메타 정보
    const t = tags || {};
    let hours = t.opening_hours || null;
    let phone = t['contact:phone'] || t.phone || null;
    let site  = t.website || null;
    let addr = [
      t['addr:postcode'],
      t['addr:state'],
      t['addr:city'] || t['addr:county'],
      t['addr:district'],
      t['addr:suburb'],
      t['addr:neighbourhood'],
      [t['addr:road'], t['addr:housenumber']].filter(Boolean).join(' ')
    ].filter(Boolean).join(' ');

  // 3-1) (선택) 같은 장소 재방문 시, 사용자 보완값(localStorage) 병합
    if (osm && osm.type && osm.id) {
      const key = `trmp:userfill:${osm.type}:${osm.id}`;
      try {
        const userfill = JSON.parse(localStorage.getItem(key) || 'null');
        if (userfill) {
          addr  = userfill.addr  || addr;
          hours = userfill.hours || hours;
          phone = userfill.phone || phone;
          site  = userfill.site  || site;
        }
      } catch {}
    }

  // 4) 정보 부족 여부(핵심 3요소 중 하나라도 없으면 true)
    const isMissing = !(hours && phone && site);

  // 5) 본문(보기) 영역 상단에 메타 카드 삽입/업데이트
    const $body = $card.find('.trmp_card_body');
    let $meta = $body.find('.trmp_place_meta');
    if (!$meta.length) $meta = $('<div class="trmp_place_meta" />').prependTo($body);

  // 6) “정보 제안하기”(OSM) + “정보 직접 입력” 버튼
    let editBtnHtml = '';
    if (osm && osm.editUrl) {
      editBtnHtml = `
        <a href="${osm.editUrl}" target="_blank" rel="noopener"
          style="display:inline-block; padding:6px 10px; border-radius:8px;
                  background:#f2f2f2; color:#111; text-decoration:none;
                  border:1px solid #e5e7eb; font-size:13px;">
          정보 제안하기(OSM)
        </a>`;
    }
    let manualBtnHtml = '';
    if (isMissing) {
      manualBtnHtml = `
        <button type="button" class="trmp_manual_btn"
                data-osmtype="${(osm && osm.type) || ''}"
                data-osmid="${(osm && osm.id) || ''}"
                style="margin-left:6px; padding:6px 10px; border-radius:8px;
                      background:#fff; color:#111; border:1px solid #e5e7eb;
                      font-size:13px;">
          정보 직접 입력
        </button>`;
    }
  // 추가

  // 7) 메타 카드 내용(구글맵 느낌)
    const rows = [];
    if (addr)  rows.push(`<div><strong>주소</strong><span>${addr}</span></div>`);
    if (hours) rows.push(`<div><strong>영업시간</strong><span>${hours}</span></div>`);
    if (phone) rows.push(`<div><strong>전화</strong><span><a href="tel:${phone}" style="text-decoration:none; color:inherit">${phone}</a></span></div>`);
    //if (site)  rows.push(`<div><strong>웹사이트</strong><span><a href="${site}" target="_blank" rel="noopener" style="text-decoration:none;">${site}</a></span></div>`);
    if (!rows.length) rows.push('<div>등록된 상세 정보가 없습니다.</div>');

    $meta.html(`
      <div class="trmp_place_meta_card"
          style="padding:12px; border:1px solid #e5e7eb; border-radius:12px;
                  background:#fff; font-size:14px; line-height:1.5;">
        ${rows.join('')}
        <div style="margin-top:8px;">
          ${editBtnHtml}
          ${manualBtnHtml}
          ${isMissing ? '<span style="font-size:12px; color:#d00; margin-left:8px;">()</span>' : ''}
        </div>
      </div>
    `);

  // 내부 라벨 얇은 회색 스타일
    $meta.find('strong').css({
      display: 'inline-block',
      minWidth: '88px',
      color: '#666',
      fontWeight: 500
    });
    
        // ① 카드 본문 펼치기
        $card.find('.trmp_card_body').removeClass('off').addClass('on');
    
        // ② 게시 컨텐츠 래퍼 보이기
        $card.find('.trmp_content_area').css('display','none');    // 보기 영역은 숨김
        $card.find('.trmp_content_write_area').show()              // 폼만 보이게
        .get(0)?.scrollIntoView({behavior:'smooth', block:'center'});
        $card.find('.trmp_text_area').focus();

  });

// -------------------------------------------------------------
// [정보 직접 입력] 버튼 → 인라인 폼 토글/생성
// - 처음 클릭하면 메타 카드 아래에 폼 생성
// - 이후에는 show/hide 토글
// -------------------------------------------------------------
  // “정보 직접 입력” 클릭 → 인라인 폼 토글
  $(document).on('click', '.trmp_manual_btn', function(){
    const $card = $(this).closest('.trmp_card');
    let $form = $card.find('.trmp_manual_form');
    if (!$form.length) {
    // 첫 생성: 메타 카드 아래에 폼 삽입
    const tpl = `
      <form class="trmp_manual_form" style="margin-top:8px; padding:10px; border:1px dashed #e5e7eb; border-radius:10px; background:#fafafa;">
        <div style="display:grid; grid-template-columns:100px 1fr; gap:6px 10px; align-items:center;">
          <label>주소</label> <input name="addr"  type="text" placeholder="예: 울산광역시 ..." />
          <label>영업시간</label> <input name="hours" type="text" placeholder="예: Mo-Fr 08:00-22:00" />
          <label>전화</label> <input name="phone" type="tel"  placeholder="예: 052-123-4567" />
          <label>웹사이트</label> <input name="site"  type="url"  placeholder="https://..." />
        </div>
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button type="submit" class="trmp_manual_save"
                  style="padding:6px 10px; border-radius:8px; background:#111; color:#fff; border:1px solid #111;">저장</button>
          <button type="button" class="trmp_manual_cancel"
                  style="padding:6px 10px; border-radius:8px; background:#fff; color:#111; border:1px solid #e5e7eb;">닫기</button>
        </div>
      </form>`;
      $form = $(tpl).insertAfter($card.find('.trmp_place_meta_card'));
    } else {
      $form.toggle();
    }
  });

  // 폼 닫기
  $(document).on('click', '.trmp_manual_cancel', function(){
    $(this).closest('.trmp_manual_form').hide();
  });

// -------------------------------------------------------------
// [정보 직접 입력] 폼 저장
// - 화면의 메타 카드 값을 즉시 갱신
// - OSM 개체키가 있으면 localStorage에 사용자 보완값 캐시
// -------------------------------------------------------------
  // 폼 저장 → 메타 카드 즉시 갱신 + localStorage 캐시
  $(document).on('submit', '.trmp_manual_form', function(e){
    e.preventDefault();

    const $form = $(this);
    const $card = $form.closest('.trmp_card');
    const $meta = $card.find('.trmp_place_meta');
    const $btn  = $card.find('.trmp_manual_btn');
    const osmType = $btn.data('osmtype') || '';
    const osmId   = $btn.data('osmid')   || '';
    const key     = (osmType && osmId) ? `trmp:userfill:${osmType}:${osmId}` : null;

    // 입력값
    const v = {
      addr:  ($form.find('[name="addr"]').val()  || '').trim(),
      hours: ($form.find('[name="hours"]').val() || '').trim(),
      phone: ($form.find('[name="phone"]').val() || '').trim(),
      site:  ($form.find('[name="site"]').val()  || '').trim()
    };

    // 현재 표시값(라벨 strong으로 찾고 다음 형제 span 텍스트)
    const readCell = (label) =>
      ($meta.find(`.trmp_place_meta_card strong:contains("${label}")`).next().text() || '').trim();

    const current = {
      addr:  readCell('주소'),
      hours: readCell('영업시간'),
      phone: readCell('전화'),
      site:  readCell('웹사이트')
    };

    // 병합(입력값 우선)
    const merged = {
      addr:  v.addr  || current.addr  || '',
      hours: v.hours || current.hours || '',
      phone: v.phone || current.phone || '',
      site:  v.site  || current.site  || ''
    };

    // 화면 갱신(버튼 줄은 유지)
    const rows = [];
    if (merged.addr)  rows.push(`<div><strong>주소</strong><span>${merged.addr}</span></div>`);
    if (merged.hours) rows.push(`<div><strong>영업시간</strong><span>${merged.hours}</span></div>`);
    if (merged.phone) rows.push(`<div><strong>전화</strong><span><a href="tel:${merged.phone}" style="text-decoration:none; color:inherit">${merged.phone}</a></span></div>`);
    if (merged.site)  rows.push(`<div><strong>웹사이트</strong><span><a href="${merged.site}" target="_blank" rel="noopener" style="text-decoration:none;">${merged.site}</a></span></div>`);
    if (!rows.length) rows.push('<div>등록된 상세 정보가 없습니다.</div>');

    const $cardBox = $meta.find('.trmp_place_meta_card');
    const $actions = $cardBox.children('div:last-child'); // 버튼 줄
    $cardBox.html(rows.join('')).append($actions);

    // 폼 닫기
    $form.hide();

    // 캐시 저장(같은 장소 다음 방문 시 병합)
    if (key) {
      try { localStorage.setItem(key, JSON.stringify(merged)); } catch {}
    }
  });

// -------------------------------------------------------------
// [UX 헬퍼] 쓰기 영역 열기
// - 별 클릭/텍스트 입력/파일 선택 3가지 진입에서 공통 호출
// -------------------------------------------------------------
function trmpRevealWriteArea(el){
  const $card = $(el).closest('.trmp_card');
  if (!$card.length) return;
  // [GUARD] 핀/검색으로 활성 장소가 설정된 경우 + 현재 카드가 그 장소일 때만 열기
  const active = window.trmpActivePlace;
  if (!active) return;
  const activeKey = makePlaceKey(active);
  const cardKey   = $card.attr('data-place-key') || '';
  if (cardKey && activeKey && cardKey !== activeKey) return;

  // [FIRST INPUT] 이 카드가 아직 장소에 묶여있지 않다면, 지금(입력 시작 시) 제목/키를 부여
if (!$card.attr('data-place-key')) {
  const placeKey = makePlaceKey(active);
  if (placeKey) {
    $card.attr('data-place-key', placeKey);
    window.trmpPlaceIndex.set(placeKey, $card.closest('li'));
  }
  // 제목/링크 세팅
  const $titleLink = $card.find('.trmp_card_head .trmp_place_link');
  if ($titleLink.length) {
    $titleLink.text(active.name || '제목').attr('href', active.url || '#');
  } else {
    const $h3 = $card.find('.trmp_card_head h3').first();
    if ($h3.length) {
      $h3.empty().append(
        $('<a/>', { 'class':'trmp_place_link', href:(active.url||'#'), target:'_blank', rel:'noopener', text:(active.name||'제목') })
      );
    }
  }
}


  $card.find('.trmp_content_area').css('display','block');      // 보기 래퍼 노출
  
  // [CLOSE OTHERS] 방금 선택한 카드 외에는 작성란/본문 접기
  $('.trmp_card').not($card).each(function(){
    $(this).find('.trmp_content_write_area').hide();
    $(this).find('.trmp_card_body').removeClass('on').addClass('off');
  });

  // ① 카드 본문 펼치기
  $card.find('.trmp_card_body').removeClass('off').addClass('on');

  // ② 게시 컨텐츠 래퍼 보이기
  $card.find('.trmp_content_area').css('display','none');
  $card.find('.trmp_content_write_area').show()
    .get(0)?.scrollIntoView({behavior:'smooth', block:'center'});
  $card.find('.trmp_text_area').focus();
}

// 0783 -------------------------------------------------------------
// [쓰기 진입 트리거] 
// 1) 별점 버튼 클릭
// 2) 텍스트 입력(포커스/입력)
// 3) 파일 선택
// -------------------------------------------------------------
 $(document)
   .off('click.mypage-write-reveal', '.tr_starBox button[data-val]')
   .on('click.mypage-write-reveal', '.tr_starBox button[data-val]', function(){
     trmpRevealWriteArea(this);
   });

 $(document)
   .off('focus.mypage-write-reveal input.mypage-write-reveal')
   .on('focus.mypage-write-reveal input.mypage-write-reveal', '.trmp_text_area', function(){
     trmpRevealWriteArea(this);
   });

 $(document)
   .off('change.mypage-write-reveal')
   .on('change.mypage-write-reveal', '.trmp_file_upload', function(){
     trmpRevealWriteArea(this);
   });

// -------------------------------------------------------------
// [쓰기 진입 트리거] 
// 1) 별점 버튼 클릭 시(사용자가 별을 선택하면 바로 작성 박스 열기)
// 2) 리뷰 텍스트 입력 시작(포커스/입력 시)
// 3) 파일 선택 시
// -------------------------------------------------------------
$(document)
  .off('click.mypage-write-reveal')
  .on('click.mypage-write-reveal', '.tr_starBox button[data-val]', function(){
    trmpRevealWriteArea(this);
  });

$(document)
  .off('focus.mypage-write-reveal input.mypage-write-reveal')
  .on('focus.mypage-write-reveal input.mypage-write-reveal', '.trmp_text_area', function(){
    trmpRevealWriteArea(this);
  });

$(document)
  .off('change.mypage-write-reveal')
  .on('change.mypage-write-reveal', '.trmp_file_upload', function(){
    trmpRevealWriteArea(this);
  });
});
