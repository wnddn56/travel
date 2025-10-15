//랜덤 배경이미지
let backgrounds = [
  "url('img/travel1.jpg')",
  "url('img/travel2.jpg')",
  "url('img/travel3.jpg')",
  "url('img/travel4.jpg')",
  "url('img/travel5.jpg')",
  "url('img/travel6.jpg')",
  "url('img/travel7.jpg')",
  "url('img/travel8.jpg')",
  "url('img/travel9.jpg')",
  "url('img/travel10.jpg')",
  "url('img/travel11.jpg')",
  "url('img/travel12.jpg')",
]
const body = document.body
window.onload = function() {
  const randomIndex = Math.floor(Math.random() * backgrounds.length);
  body.style.backgroundImage = backgrounds[randomIndex];
  body.style.backgroundSize = "cover";
  body.style.backgroundRepeat = "no-repeat";
  body.style.backgroundPosition = "center";
}


//id 유효성 검사
const tr_id = document.querySelector('#tr_id');  //아이디 입력창 지정
const resultId = document.querySelector("#resultId");  // 유효성 결과 표시부분
const idReg = /^(?=.*[a-zA-Z])(?=.*\d)[a-z|A-Z\d]{5,15}$/ //id정규식
function idCheck(){
  if(idReg.test(tr_id.value)){
    resultId.innerHTML = "";
    resultId.style.color = "";
    return true;
  } else {
    resultId.innerHTML = "아이디는 영문자와 숫자포함 5자이상 15자 이내여야 합니다.";
    resultId.style.color = "#A50000";
    return false;
  }
};
tr_id.addEventListener('input', idCheck);
tr_id.addEventListener('input', () => {
  아이디확인됨 = false;
});


//id중복확인
let isIdChecked = false; //const 사용X const 쓰면 false로 고정됨.
const dupCheck = document.querySelector('#dupCheck'); //중복확인 버튼 지정
dupCheck.addEventListener('click', () => {
  if(!tr_id.value.trim()){
    alert("아이디를 입력하세요.");
    isIdChecked = false;
    return;
  }
  alert("사용가능한 아이디입니다.");
  isIdChecked = true; //지금은 DB가 없어서 입력만하면 사용가능하다고 뜹니다
})


//pw유효성 검사
const tr_pw = document.querySelector('#tr_pw'); //비밀번호 입력 지정
const resultPw = document.querySelector("#resultPw"); //비밀번호 유효성 검사 결과 지정
const pwReg = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@!#$])[a-z|A-Z\d!@#$]{7,20}$/ //pw정규식
function pwCheck(){  
  if(pwReg.test(tr_pw.value)){
    resultPw.innerHTML = "";
    resultPw.style.color = "";
    return true;
  } else {
    resultPw.innerHTML = "비밀번호는 영문자와 숫자, 특수문자를 포함한<br> 7자이상 20자 이내여야 합니다.";
    resultPw.style.color = "#A50000";
    return false;
  }
};
tr_pw.addEventListener('input', pwCheck);



//비밀번호 확인 일치여부
const tr_pwVer = document.querySelector('#tr_pwVer');   //비밀번호 확인 입력창 지정
const resultPwVer = document.querySelector("#resultPwVer"); //비밀번호 확인 결과 표시 부분
function verifyPw(){
  if (tr_pwVer.value.trim() === "") return;
  if(tr_pwVer.value == tr_pw.value){
    resultPwVer.innerHTML = "비밀번호가 일치해요!";
    resultPwVer.style.color = "green";
    return true;
  } else {
    resultPwVer.innerHTML = "비밀번호가 일치하지 않아요!";
    resultPwVer.style.color = "#A50000";
    return false;
  };
}
tr_pwVer.addEventListener('input', verifyPw);


//email 유효성 검사
const tr_email = document.querySelector('#tr_email');  //이메일 입력창 지정
const resultEmail = document.querySelector("#resultEmail");  //이메일 유효성 결과 표시
const emailReg = /^[a-z|A-Z|\d]+@[^\s가-힣]+\.[a-z|A-Z]{2,5}$/;     //email정규식
function emailCheck(){
  if(emailReg.test(tr_email.value)){
    resultEmail.innerHTML = "";
    resultEmail.style.color = "";
    return true;
  } else {
    resultEmail.innerHTML = "이메일 주소가 올바르지 않아요!";
    resultEmail.style.color = "#A50000";
    return false;
  }
};
tr_email.addEventListener('input', emailCheck);

//약관 팝업
const modal = document.querySelector("#tr_termsModal");
const openBtn = document.querySelector(".tr_terms a");
const closeBtn = document.querySelector(".close");
//팝업 열기
openBtn.addEventListener("click", (e) => {
  e.preventDefault();
  modal.style.display = "block";
});
//팝업 닫기
closeBtn.addEventListener("click", () => {
  modal.style.display = "none";
})
// 모달 바깥 클릭 시 닫기
window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
  }
});

//회원가입버튼 이벤트
const form = document.querySelector('form');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  let terms = document.querySelector('#tr_check');
  
  if(!isIdChecked){  //중복확인 하지 않고 버튼 누를 때 이벤트
    alert("아이디 중복확인을 해주세요.");
    return;
  }
  if(!terms.checked){ //약관에 동의하지 않았을 때 이벤트
    alert("필수 이용약관에 동의해주세요.");
    return;
  }
  if(idCheck() && pwCheck() && verifyPw() && emailCheck()){
    form.submit();
  }
});