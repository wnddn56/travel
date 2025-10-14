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

});