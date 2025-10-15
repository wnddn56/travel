$(document).ready(function(){
    // expend_btn_area 버튼 클릭 시 적용
    $(document).on('click', '.card_head', function(){
        const $body = $(this).siblings('.card_body'); // 현재 카드의 내용 영역
        toggleOnOff($body);

        // 버튼 화살표 이미지 교체 (down ↔ up)
        const $img = $(this).find('.expend_btn_area img');
        $img.attr('src', $body.hasClass('on') ? 'img/up.png' : 'img/down.png');
    });

    // btn_area 버튼 클릭 시 적용
    $(document).on('click', '.btn_area', function(){
        const $ul = $(this).find('.btn_ul'); // 수정/삭제 메뉴
        toggleOnOff($ul);
    });

    // on/off 토글 함수
    function toggleOnOff(element) {
        const $el = $(element);
        $el.toggleClass('on off');
    }

        /* ===================== 별점 기능 ===================== */
    const gray = '#d1d5db'; // 선택 안 된 별 색
    const fill = '#f59e0b'; // 선택된 별 색

    // 별 색 칠하는 함수
    function paintStars($stars, $hidden, score) {
        $stars.each(function() {
            const val = Number($(this).data('val')); 
            $(this).css('color', val <= score ? fill : gray); 
        });
        $hidden.val(score); // 선택한 점수를 hidden input에 저장
    }

    // 별 클릭 시
    $(document).on('click', '.tr_starBox button[data-val]', function() {
        const $btn = $(this);
        const score = Number($btn.data('val')); // 클릭한 별 점수
        const $form = $btn.closest('.tr_starForm'); // 현재 별점 폼
        const $stars = $form.find('.tr_starBox button[data-val]');
        const $hidden = $form.find('.tr_ratingVal');

        paintStars($stars, $hidden, score); // 별 색칠
        $form.find('textarea').removeAttr('disabled'); // 텍스트 작성 가능하게
    });

    // 폼 리셋 시 (취소 버튼 눌렀을 때 별 다시 회색으로)
    $(document).on('reset', '.tr_starForm', function() {
        const $form = $(this);
        const $stars = $form.find('.tr_starBox button[data-val]');
        const $hidden = $form.find('.tr_ratingVal');
        setTimeout(() => paintStars($stars, $hidden, 0), 0); // 0점으로 초기화
    });

    // 페이지 로드 시 초기 별점 0으로 세팅
    $('.tr_starForm').each(function() {
        const $form = $(this);
        const $stars = $form.find('.tr_starBox button[data-val]');
        const $hidden = $form.find('.tr_ratingVal');
        paintStars($stars, $hidden, 0);
    });

    // 1015_추가 
     //이미지 미리보기
    $(document)
    .off('change.preview') 
    .on('change.preview', '.file_upload', function () {
    const input = this;
    const $writeArea = $(input).closest('.content_write_area');

    // 별점 폼라인에 같이 위에 미리보기
    const $starForm = $writeArea.find('.tr_starForm').first();

    //별점 폼 라인
    let $row = $writeArea.find('.tr_starRow');
    if(!$row.length) {
        $row = $('<div class="tr_starRow"></div>')
        $row.insertBefore($starForm);
        $row.append($starForm);
    }

    //별점 폼 라인에 같이 보이게 
    let $preview = $row.find('.file_preview');
    if(!$preview.length) {
        $preview = $('<div class="file_preview"></div>');
        $row.prepend($preview); // 왼쪽엔 사진 미리보기, 오른쪽엔 별점.
    }

    // 첨부파일 최대 8개
    const current = $preview.children().length;
    const MAX = 8;
    const remain = MAX - current;
    if (remain <=0) {
        alert('최대 8개까지 첨부 가능합니다.')
        return;
    }
    // 이미지만 미리보기 (파일명 X)
    Array.from(input.files).forEach((file) => {
      if (!file.type || !file.type.startsWith('image/') || file.type.startsWith('video/')) return; //사진 또는 이미지
      const url = URL.createObjectURL(file); // 브라우저 내부에서 보이는 임시url로 바꿔야 보임.
      const $img = $(
        `<img alt="첨부 이미지 미리보기"
              src="${url}"
              style="max-width:100%; height:auto; display:block; border-radius:8px; margin-top:6px;">`
      );
      $img.on('load', () => URL.revokeObjectURL(url));
      $preview.append($img);
    });
  });
});