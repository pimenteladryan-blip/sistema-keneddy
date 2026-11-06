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
document.querySelector('#profile-menu').addEventListener('click',()=>alert('Perfil demonstrativo: Administrador'));
document.querySelector('#today-label').textContent='ANO LETIVO 2026';
