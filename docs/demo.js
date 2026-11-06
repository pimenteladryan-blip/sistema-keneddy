'use strict';
const pageNames={inicio:'Início',viagens:'Viagens',alunos:'Alunos',autorizacoes:'Autorizações',transportes:'Transportes',professores:'Professores',relatorios:'Relatórios',usuarios:'Usuários'};
function openPage(name){
 if(!pageNames[name])return;
 document.querySelectorAll('.page-view').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
 document.querySelector('#breadcrumb-page').textContent=pageNames[name];
 document.title='SGVE | '+pageNames[name]+' · Kennedy';
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>openPage(b.dataset.page)));
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>openPage(b.dataset.go)));
const DEMO_ACCOUNT={email:'admin@sgve.demo',password:'Kennedy2026',role:'Administrador'};
function showLogin(){
 document.querySelector('#app-shell').classList.remove('logged-in');
 document.querySelector('#login-screen').style.display='grid';
 sessionStorage.removeItem('sgve-demo-session');
}
function enterApp(){
 document.querySelector('.profile strong').textContent=DEMO_ACCOUNT.role;
 document.querySelector('.profile small').textContent='Acesso demonstrativo';
 document.querySelector('#login-screen').style.display='none';
 document.querySelector('#app-shell').classList.add('logged-in');
}
document.querySelector('#demo-login-form').addEventListener('submit',event=>{
 event.preventDefault();
 const email=document.querySelector('#login-email').value.trim().toLowerCase();
 const password=document.querySelector('#login-password').value;
 const error=document.querySelector('#login-error');
 if(email!==DEMO_ACCOUNT.email||password!==DEMO_ACCOUNT.password){
  error.textContent='E-mail ou senha incorretos. Confira os dados da conta de teste.';
  return;
 }
 error.textContent='';
 sessionStorage.setItem('sgve-demo-session','authenticated');
 enterApp();
});
document.querySelector('#profile-menu').addEventListener('click',showLogin);
if(sessionStorage.getItem('sgve-demo-session')==='authenticated')enterApp();
document.querySelector('#today-label').textContent='ANO LETIVO 2026';
