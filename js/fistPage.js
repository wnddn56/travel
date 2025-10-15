let tr_id = document.getElementById('tr_id');
let tr_psw = document.getElementById('tr_psw');
let form = document.querySelector('form');
let login_btn = document.getElementById('login_btn');

function validateId(){
    let tr_id_test = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{5,20}$/.test(tr_id.value);
    if(tr_id_test){
        document.getElementById('id_warring').innerHTML = "사용가능한 아이디 입니다."
        document.getElementById('id_warring').style.color = "#41E9C2"
        return true;    
    }else{
        document.getElementById('id_warring').innerHTML = "아이디는 5~20자 영문자 숫자 조합만 가능합니다."
        document.getElementById('id_warring').style.color = "red"
        return false;
    }
}

function validatePw(){
    let tr_psw_test = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!.@#$%^&*])[A-Za-z\d!@#$%^&*]{6,12}$/.test(tr_psw.value);
    if(tr_psw_test){
        document.getElementById('psw_warring').innerHTML = "사용가능한 비밀번호 입니다."
        document.getElementById('psw_warring').style.color = "#41E9C2"  
        return true;  
    }else{
        document.getElementById('psw_warring').innerHTML = "비밀번호는 6~12자리 영문자 숫자 적어도 하나의 <br>특수문자를 포함하는 조합만 가능합니다."
        document.getElementById('psw_warring').style.color = "red" 
        return false;
    }
}
tr_id.addEventListener("blur",validateId)
tr_psw.addEventListener("blur",validatePw)