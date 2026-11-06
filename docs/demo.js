'use strict';
const KEY='sgve-demo-v1';
const initial=()=>({classes:[],students:[],trips:[],users:[]});
let db; try{db=JSON.parse(localStorage.getItem(KEY))||initial()}catch{db=initial()}
let currentUser=null;
const save=()=>localStorage.setItem(KEY,JSON.stringify(db));
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const manager=()=>currentUser&&['admin','direction','secretariat'].includes(currentUser.role);
const roles={admin:'Administrador',direction:'Direção',secretariat:'Secretaria',teacher:'Professor',guardian:'Responsável',student:'Estudante'};
function msg(sel,text,error=false){const e=$(sel);e.textContent=text;e.classList.toggle('error-text',error)}
function formData(form){return Object.fromEntries(new FormData(form).entries())}
function showLogin(){$('#dashboard-view').classList.add('hidden');$('#login-view').classList.remove('hidden');currentUser=null}
function showDashboard(user){
 currentUser=user;$('#login-view').classList.add('hidden');$('#dashboard-view').classList.remove('hidden');
 $('#welcome-title').textContent='Olá, '+user.name+'!';$('#user-role').textContent='Perfil de acesso: '+roles[user.role];
 ['#class-form','#student-form','#trip-form','#trip-assignment','#users-tab'].forEach(s=>$(s).classList.toggle('hidden',!manager()));
 document.querySelectorAll('[data-admin-only]').forEach(o=>o.hidden=user.role!=='admin');
 document.querySelectorAll('[data-admin-only] input').forEach(o=>o.disabled=user.role!=='admin');
 render();
}
function render(){
 const can=manager();
 const classes=db.classes, students=db.students, trips=db.trips;
 $('#overview-classes').textContent=classes.length;$('#overview-students').textContent=students.length;$('#overview-trips').textContent=trips.length;
 $('#classes-count').textContent=classes.length;$('#students-count').textContent=students.length;$('#trips-count').textContent=trips.length;
 const classLabel=c=>(c.level==='fundamental'?'Fundamental':'Médio')+' · '+c.grade+' · '+(c.course==='adm'?'Técnico ADM':c.course==='ds'?'Técnico DS':'Regular')+' · Turma '+c.section+' · '+c.school_year;
 $('#classes-list').innerHTML=classes.length?classes.map(c=>'<article class="data-row"><strong>'+esc(classLabel(c))+'</strong></article>').join(''):'<p class="muted">Nenhuma turma cadastrada.</p>';
 $('#students-list').innerHTML=students.length?students.map(s=>'<article class="data-row"><strong>'+esc(s.full_name)+'</strong><span>'+esc(classLabel(classes.find(c=>c.id===s.class_id)||{}))+'</span></article>').join(''):'<p class="muted">Nenhum estudante cadastrado.</p>';
 const fill=(sel,items,label,empty)=>{const old=$(sel).value;$(sel).innerHTML='<option value="">'+empty+'</option>'+items.map(i=>'<option value="'+i.id+'">'+esc(label(i))+'</option>').join('');if(old)$(sel).value=old};
 fill('#student-class',classes,classLabel,'Selecione uma turma');fill('#trip-class-select',classes,classLabel,'Selecione uma turma');
 fill('#trip-class-trip',trips.filter(t=>t.status==='draft'),t=>t.title+' · '+t.destination,'Selecione uma viagem');
 fill('#trip-student-trip',trips.filter(t=>t.status==='draft'),t=>t.title+' · '+t.destination,'Selecione uma viagem');
 fill('#trip-student-select',students,s=>s.full_name,'Selecione um estudante');
 const visible=trips.filter(t=>can||t.created_by===currentUser.email);
 $('#trips-list').innerHTML=visible.length?visible.map(t=>{
 const label={draft:'Rascunho',pending_approval:'Aguardando aprovação',approved:'Aprovada'}[t.status]||t.status;
 const action=can&&t.status==='draft'?'<button type="button" class="small-action" data-act="submit" data-id="'+t.id+'">Enviar para aprovação</button>':(currentUser.role==='admin'||currentUser.role==='direction')&&t.status==='pending_approval'?'<button type="button" class="small-action" data-act="approve" data-id="'+t.id+'">Aprovar viagem</button>':'';
 return '<article class="trip-card"><div class="trip-card-main"><div class="trip-title-row"><strong>'+esc(t.title)+'</strong><span class="status-pill">'+label+'</span></div><p>'+esc(t.destination)+'</p><small>Saída: '+esc(new Date(t.departure_at).toLocaleString('pt-BR'))+'</small><small>Retorno: '+esc(new Date(t.return_at).toLocaleString('pt-BR'))+'</small><small>Participantes: '+t.student_ids.length+' / '+t.capacity+'</small></div>'+action+'</article>';
 }).join(''):'<p class="muted">Nenhuma viagem cadastrada.</p>';
}
function add(form,arr,payload){payload.id=Date.now()+Math.random();arr.push(payload);save();form.reset();render()}
$('#login-form').addEventListener('submit',e=>{e.preventDefault();const f=formData(e.currentTarget);if(!f.email||!f.password){msg('#login-message','Preencha e-mail e senha.',true);return}showDashboard({name:f.email.split('@')[0],email:f.email,role:'admin'})});
$('#logout-button').addEventListener('click',showLogin);
$('#class-form').addEventListener('submit',e=>{e.preventDefault();const p=formData(e.currentTarget);p.school_year=Number(p.school_year);add(e.currentTarget,db.classes,p);msg('#class-message','Turma cadastrada neste navegador.')});
$('#student-form').addEventListener('submit',e=>{e.preventDefault();const p=formData(e.currentTarget);p.class_id=Number(p.class_id);add(e.currentTarget,db.students,p);msg('#student-message','Estudante fictício cadastrado neste navegador.')});
$('#trip-form').addEventListener('submit',e=>{e.preventDefault();const p=formData(e.currentTarget);p.capacity=Number(p.capacity);p.student_ids=[];p.class_ids=[];p.created_by=currentUser.email;p.status='draft';add(e.currentTarget,db.trips,p);msg('#trip-message','Rascunho de viagem criado.')});
$('#trip-class-form').addEventListener('submit',e=>{e.preventDefault();const p=formData(e.currentTarget),t=db.trips.find(x=>x.id==p.trip_id);if(t&&!t.class_ids.includes(Number(p.class_id))){t.class_ids.push(Number(p.class_id));save();msg('#trip-message','Turma vinculada à viagem.')}});
$('#trip-student-form').addEventListener('submit',e=>{e.preventDefault();const p=formData(e.currentTarget),t=db.trips.find(x=>x.id==p.trip_id),s=db.students.find(x=>x.id==p.student_id);if(t&&s&&t.class_ids.includes(s.class_id)&&!t.student_ids.includes(s.id)&&t.student_ids.length<t.capacity){t.student_ids.push(s.id);save();render();msg('#trip-message','Estudante vinculado à viagem.')}else msg('#trip-message','Vincule primeiro a turma do estudante e confira a capacidade.',true)});
$('#trips-list').addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(!b)return;const t=db.trips.find(x=>x.id==b.dataset.id);if(!t)return;if(b.dataset.act==='submit'&&t.class_ids.length)t.status='pending_approval';else if(b.dataset.act==='approve'&&['admin','direction'].includes(currentUser.role))t.status='approved';else{msg('#trip-message','Vincule ao menos uma turma antes de enviar.',true);return}save();render();msg('#trip-message','Status da viagem atualizado.')});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t===b));document.querySelectorAll('.module-panel').forEach(p=>p.classList.toggle('hidden',p.id!==b.dataset.tab))}));
$('#user-form').addEventListener('submit',e=>{e.preventDefault();const p=formData(e.currentTarget);db.users.push({name:p.name,email:p.email,role:p.role});save();e.currentTarget.reset();msg('#user-message','Conta de demonstração registrada (sem autenticação real).')});
