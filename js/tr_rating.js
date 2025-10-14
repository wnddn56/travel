// ───────────────────────────────────────────────
// [별점: 이벤트 위임 버전]  (복제 카드/동적 DOM에도 100% 작동)
// - HTML/CSS 변경 없음
// - rating.js가 기존 카드에 붙여둔 핸들러와 충돌하지 않도록 동작은 동일하게 유지
// - 주석: 한 줄 한 줄 자세히 설명
// ───────────────────────────────────────────────
(function(){

  // 별 아이콘의 색상: 회색(미선택), 주황(선택)
  const GRAY = '#d1d5db';
  const FILL = '#f59e0b';

  // paint 유틸 함수: 특정 "별 박스"에 대해 n점까지 별을 칠하고 상태를 반영
  // - boxEl: .tr_starBox DOM 요소
  // - n: 선택된 별점(정수 0~5)
  function paint(boxEl, n){
    // 별 버튼들(NodeList)을 모두 가져와 배열로
    const btns = boxEl.querySelectorAll('button[data-val]');

    // 버튼 각각을 순회하며 n 이하인 별은 채우고, 초과는 회색으로
    btns.forEach(btn => {
      const val = Number(btn.getAttribute('data-val')) || 0;          // 이 버튼의 값
      btn.style.color = (val <= n) ? FILL : GRAY;                     // 색상 채우기/비우기
      btn.setAttribute('aria-checked', String(val === n));            // 스크린리더 접근성 상태
    });

    // 같은 폼 안의 hidden(.tr_ratingVal)에 숫자 저장 → 제출/렌더에 사용
    const form = boxEl.closest('form.tr_starForm');
    if (form) {
      const hidden = form.querySelector('.tr_ratingVal');             // 숨김 입력
      if (hidden) hidden.value = String(n);                           // 값 갱신

      // (선택) 실시간 안내 요소가 있다면 현재 점수 안내
      const live = form.querySelector('.tr_ratingLive');              // 라이브 리전
      if (live) live.textContent = `선택: ${n}점`;
    }
  }

  // ───────────────────────────────────────────────
  // [클릭 선택] - 문서 전체에 위임
  //  - 장점: 나중에 동적으로 생성/복제된 카드에서도 자동으로 동작
  // ───────────────────────────────────────────────
  // 중복 바인딩 방지를 위해 같은 네임스페이스(click.mypage-stars)를 off 후 on
  $(document)
    .off('click.mypage-stars')
    .on('click.mypage-stars', '.tr_starBox button[data-val]', function(e){
      e.preventDefault();                                            // 버튼 기본 동작 방지(폼 submit 등)
      const btn   = this;                                            // 실제 클릭된 버튼
      const boxEl = btn.closest('.tr_starBox');                      // 별 버튼 컨테이너
      if (!boxEl) return;                                            // 방어 코드

      const val = Number(btn.getAttribute('data-val')) || 0;         // 눌린 별의 값
      paint(boxEl, val);                                             // 값에 맞춰 별 칠하기 + hidden 갱신
    });

  // ───────────────────────────────────────────────
  // [키보드 접근성] - 좌/우/상/하로 별점 변경, Enter/Space 기본동작 방지
  //   - .tr_starBox에 포커스가 있을 때만 동작
  //   - 초기 포커스 가능(tabIndex)은 HTML에서 주어도 되고, 아래에서 동적으로 부여해도 됨
  // ───────────────────────────────────────────────
  $(document)
    .off('keydown.mypage-stars')
    .on('keydown.mypage-stars', '.tr_starBox', function(e){
      const boxEl = this;                                            // 키 입력이 들어온 별 박스
      const form  = boxEl.closest('form.tr_starForm');               // 같은 폼
      if (!form) return;                                             // 방어

      const hidden = form.querySelector('.tr_ratingVal');            // 숨김 입력
      let cur = Number(hidden && hidden.value) || 0;                 // 현재 선택값(없으면 0)

      // 왼쪽/아래: 1까지 감소 (첫 선택 전이면 1로 보정)
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown'){
        e.preventDefault();                                          // 스크롤/커서 이동 등 기본 동작 방지
        cur = Math.max(1, cur ? cur - 1 : 1);                        // 최소 1점
        paint(boxEl, cur);                                           // 칠하기
        return;
      }

      // 오른쪽/위: 5까지 증가
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp'){
        e.preventDefault();
        cur = Math.min(5, cur + 1);                                  // 최대 5점
        paint(boxEl, cur);
        return;
      }

      // Enter/Space: 현재 값 확정만 (폼 제출 등 기본 동작은 막음)
      if (e.key === 'Enter' || e.key === ' '){
        e.preventDefault();                                          // 폼 submit/버튼 클릭 방지
        return;
      }

      // 그 외 키는 무시
    });

  // ───────────────────────────────────────────────
  // [초기 상태 처리] - 페이지 로드 시 모든 .tr_starBox에 포커스 가능(tabIndex) 부여 + 0점 칠하기
  //   - rating.js가 이미 초기화해도 무방 (중복 칠해도 결과는 동일)
  //   - 새로 생성된 카드에 대해선 위의 이벤트 위임이 동작하므로 추가 작업 불필요
  // ───────────────────────────────────────────────
  document.querySelectorAll('.tr_starBox').forEach(boxEl => {
    // 키보드 접근을 위해 포커스 가능하게
    if (!boxEl.hasAttribute('tabindex')) boxEl.tabIndex = 0;        // 포커스 불가였다면 0 부여
    // 초기 0점(모두 회색)로 칠하기
    paint(boxEl, Number(
      (boxEl.closest('form.tr_starForm')?.querySelector('.tr_ratingVal')?.value) || 0
    ));
  });

  // (선택) 폼의 reset 시 별점도 0으로 돌아가게 하고 싶다면 아래 위임을 추가
  $(document)
    .off('reset.mypage-stars')
    .on('reset.mypage-stars', 'form.tr_starForm', function(){
      const boxEl = this.querySelector('.tr_starBox');               // 이 폼 안의 별 박스
      if (boxEl) setTimeout(() => paint(boxEl, 0), 0);               // reset 직후 0점으로 칠하기
    });

  // (선택) 폼의 submit을 이 스크립트에서 막고 싶다면 아래 주석 해제
  // $(document)
  //   .off('submit.mypage-stars')
  //   .on('submit.mypage-stars', 'form.tr_starForm', function(e){
  //     e.preventDefault();                                         // 실제 전송 막기(데모/클라 처리)
  //     const n = Number(this.querySelector('.tr_ratingVal')?.value || 0);
  //     if (!n){ alert('별점을 선택하세요.'); return; }             // 미선택 방어
  //     alert(`별점 ${n}점을 선택했습니다.`);                         // 선택 결과 안내(예시)
  //   });

})();
