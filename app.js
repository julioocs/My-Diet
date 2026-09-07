import {
  auth, db, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut as firebaseSignOut,
  doc, setDoc, collection, addDoc, onSnapshot, serverTimestamp, query, orderBy
} from "./firebase-init.js";

const DEFAULT = {
  profile:{name:"Julio",sex:"male",birthDate:"",heightCm:"",activityFactor:"1.55"},
  settings:{
    longDay:"sun",longTime:"06:30",longDistanceKm:"16",longDurationMin:"100",longIntensity:"easy",hardTime:"16:00",
    dietPrefs:{
      mon:{fasting:false,eveningRun:false},tue:{fasting:false,eveningRun:false},
      wed:{fasting:false,eveningRun:false},thu:{fasting:false,eveningRun:false},
      fri:{fasting:false,eveningRun:false},sat:{fasting:false,eveningRun:false},
      sun:{fasting:false,eveningRun:false}
    }
  },
  evaluations:[],checkins:{},user:null
};

let state = loadLocal();
let currentDay = todayId();
let assessmentMode = "basic";
let planIndex = 0;
let unsubs = [];
let deferredPrompt = null;

const dayMeta=[["mon","Segunda"],["tue","Terça"],["wed","Quarta"],["thu","Quinta"],["fri","Sexta"],["sat","Sábado"],["sun","Domingo"]];

const foodDB={
  rice:{name:"arroz branco cozido",g:"carb",v:28,state:"cozido"},
  pasta:{name:"macarrão comum cozido",g:"carb",v:30,state:"cozido"},
  potato:{name:"batata inglesa cozida",g:"carb",v:17,state:"cozido"},
  cassava:{name:"mandioca cozida",g:"carb",v:30,state:"cozido"},
  bread:{name:"pão francês",g:"carb",v:58,state:"pronto"},
  tapioca:{name:"goma de tapioca",g:"carb",v:63,state:"hidratada"},
  oats:{name:"aveia",g:"carb",v:66,state:"seca"},
  chicken:{name:"peito de frango",g:"protein",v:31,state:"cozido"},
  beef:{name:"carne bovina magra",g:"protein",v:27,state:"cozida"},
  pork:{name:"lombo suíno",g:"protein",v:27,state:"cozido"},
  whey:{name:"whey protein",g:"protein",v:80,state:"pó"},
  yogurt:{name:"iogurte proteico/natural",g:"protein",v:8,state:"pronto"},
  olive:{name:"azeite",g:"fat",v:100,state:"puro"},
  nuts:{name:"castanhas",g:"fat",v:52,state:"prontas"},
  peanut:{name:"pasta de amendoim",g:"fat",v:50,state:"pronta"},
  avocado:{name:"abacate",g:"fat",v:15,state:"in natura"}
};

const plans={
  light:[
    [
      ["Café da manhã","3 ovos + 2 fatias de pão + banana + café","Proteína alta cedo sem excesso de volume."],
      ["Lanche","Iogurte + fruta","Pequeno e fácil de digerir."],
      ["Almoço",'<food k="chicken" q="180">frango 180 g</food> + <food k="rice" q="180">arroz branco 180 g</food> + feijão 80–100 g + legumes',"Refeição completa sem necessidade de integrais."],
      ["Lanche",'Pão francês + <food k="chicken" q="90">frango 90 g</food> + fruta',"Ajuda a fechar proteína."],
      ["Jantar",'<food k="beef" q="180">carne magra 180 g</food> + <food k="potato" q="280">batata 280 g</food> + legumes',"Boa saciedade e carbo moderado."]
    ],
    [
      ["Café da manhã","Iogurte + whey + banana + aveia 30–40 g + mel","Menor volume."],
      ["Lanche","Fruta + 15–20 g castanhas","Compacto."],
      ["Almoço",'<food k="beef" q="180">patinho 180 g</food> + <food k="rice" q="170">arroz 170 g</food> + legumes',"Simples."],
      ["Lanche","Whey + banana","Baixo volume."],
      ["Jantar","Omelete 3 ovos + frango 120 g + mandioca 220 g","Proteína alta sem pratão."]
    ]
  ],
  hard:[
    [
      ["Café da manhã","3 ovos + 2 fatias de pão + banana + café","Começa o dia abastecido."],
      ["Lanche","Iogurte + fruta","Mantém energia."],
      ["Almoço",'<food k="chicken" q="180">frango 180 g</food> + <food k="rice" q="230">arroz 230 g</food> + feijão 80 g + legumes',"Mais glicogênio antes do treino."],
      ["Pré-treino 1–2 h",'<food k="bread" q="70">pão francês ~70 g</food> + frango 80–100 g + banana + mel',"Carbo fácil de digerir."],
      ["Pós / jantar",'<food k="rice" q="250">arroz 250 g</food> + <food k="beef" q="190">carne/frango 190 g</food> + legumes + fruta',"Recuperação."]
    ],
    [
      ["Café da manhã","Iogurte + whey + banana + aveia + mel","Compacto."],
      ["Almoço",'<food k="pasta" q="220">macarrão cozido 220 g</food> + <food k="beef" q="180">patinho 180 g</food>',"Boa densidade energética."],
      ["Pré-treino","Banana + whey com água + suco OU pão com mel","Pouco volume."],
      ["Pós / jantar",'<food k="potato" q="330">batata 330 g</food> + <food k="chicken" q="190">frango 190 g</food> + fruta',"Boa recuperação."]
    ]
  ],
  recovery:[
    [
      ["Café da manhã","3 ovos + 2 fatias de pão + fruta","Proteína alta com carbo moderado."],
      ["Almoço",'<food k="chicken" q="180">frango 180 g</food> + <food k="rice" q="190">arroz 190 g</food> + feijão + legumes',"Recuperação."],
      ["Lanche","Whey + banana","Prático."],
      ["Jantar",'<food k="beef" q="180">carne 180 g</food> + <food k="potato" q="280">batata 280 g</food> + legumes',"Boa saciedade."]
    ]
  ],
  long:[
    [
      ["Pré 1h30–2h30","2 pães + banana + mel/geleia + whey com água","Carbo alto, pouca gordura e fibra."],
      ["Durante","30–60 g de carboidrato/h + água; eletrólitos conforme clima/suor","Combustível do treino."],
      ["Pós imediato","Whey/iogurte + fruta OU sanduíche simples","Inicia recuperação."],
      ["Almoço pós-longão",'<food k="rice" q="270">arroz 270 g</food> + <food k="chicken" q="190">frango/carne 190 g</food> + legumes + fruta',"Recupera glicogênio e proteína."],
      ["Jantar","Proteína 160–180 g + arroz/batata moderado + legumes","Volta ao controle."]
    ],
    [
      ["Pré 60–90 min","Banana + pão com mel + whey com água + suco","Menor volume."],
      ["Durante","30–60 g carbo/h","Treinar intestino também."],
      ["Pós","Iogurte + whey + banana + cereal simples","Compacto."],
      ["Almoço",'<food k="pasta" q="250">macarrão cozido 250 g</food> + <food k="beef" q="180">patinho 180 g</food>',"Boa reposição."],
      ["Jantar",'<food k="chicken" q="180">frango 180 g</food> + <food k="potato" q="250">batata 250 g</food> + legumes',"Fecha recuperação."]
    ]
  ]
};

function deepMerge(base,incoming){
  const out=structuredClone(base);
  if(!incoming||typeof incoming!=="object")return out;
  for(const [k,v] of Object.entries(incoming)){
    if(v&&typeof v==="object"&&!Array.isArray(v)&&out[k]&&typeof out[k]==="object"&&!Array.isArray(out[k])) out[k]=deepMerge(out[k],v);
    else out[k]=v;
  }
  return out;
}
function loadLocal(){
  try{return deepMerge(DEFAULT,JSON.parse(localStorage.getItem("ih_firebase_v3")||"{}"))}
  catch{return structuredClone(DEFAULT)}
}
function saveLocal(){localStorage.setItem("ih_firebase_v3",JSON.stringify(state))}
function todayId(){return ["sun","mon","tue","wed","thu","fri","sat"][new Date().getDay()]}
function todayISO(){return new Date().toISOString().slice(0,10)}
function toast(t){const e=document.getElementById("toast");e.textContent=t;e.classList.remove("hidden");setTimeout(()=>e.classList.add("hidden"),2600)}
function num(v){const n=Number(v);return v!==""&&Number.isFinite(n)?n:null}
function fmt(v,d=1){return v!==null&&v!==undefined&&v!==""?Number(v).toFixed(d):"—"}
function latest(){return state.evaluations.length?[...state.evaluations].sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]:null}
function ageFromBirth(dateStr){
  if(!dateStr)return null;
  const b=new Date(dateStr+"T12:00:00"),n=new Date();
  let a=n.getFullYear()-b.getFullYear();
  const m=n.getMonth()-b.getMonth();
  if(m<0||(m===0&&n.getDate()<b.getDate()))a--;
  return a>0?a:null;
}
function bmrFromData(data={}){
  const w=Number(data.weightKg||0);
  const h=Number(data.heightCm||state.profile.heightCm||0);
  const birthDate=data.birthDate||state.profile.birthDate||"";
  const a=ageFromBirth(birthDate);
  const s=data.sex||state.profile.sex;
  const activity=Number(data.activityFactor||state.profile.activityFactor||1.55);

  let mif=null,k=null,c=null;
  if(w&&h&&a)mif=10*w+6.25*h-5*a+(s==="male"?5:-161);

  let lbm=Number(data.leanMassKg||0);
  const bf=data.bodyFatPct!==null&&data.bodyFatPct!==undefined&&data.bodyFatPct!=="" ? Number(data.bodyFatPct) : null;
  if(!lbm&&w&&bf!==null&&Number.isFinite(bf)) lbm=w*(1-bf/100);

  if(lbm){
    k=370+21.6*lbm;
    c=500+22*lbm;
  }

  const available=[mif,k,c].filter(Number.isFinite);
  const practical=available.length?available.reduce((x,y)=>x+y,0)/available.length:null;
  const tdee=practical?practical*activity:null;
  return {mif,k,c,pr:practical,tdee,lbm};
}
function bmr(){
  const e=latest();
  return bmrFromData({
    weightKg:e?.weightKg,
    leanMassKg:e?.leanMassKg,
    bodyFatPct:e?.bodyFatPct,
    heightCm:state.profile.heightCm,
    birthDate:state.profile.birthDate,
    sex:state.profile.sex,
    activityFactor:state.profile.activityFactor
  });
}
function dayType(id){if(id===state.settings.longDay)return "long";if(id==="tue"||id==="thu")return "hard";if(id==="fri")return "recovery";return "light"}
function prevDay(id){const ids=dayMeta.map(x=>x[0]),i=ids.indexOf(id);return ids[(i+6)%7]}
function isEve(id){return id===prevDay(state.settings.longDay)}
function typeLabel(t){return {light:"dia leve",hard:"treino forte",recovery:"regenerativo",long:"longão"}[t]}
function macros(t){
  const w=Number(latest()?.weightKg||0);if(!w)return null;
  const z={light:{p:2.2,c:2.7,f:.8},recovery:{p:2.2,c:3,f:.8},hard:{p:2.2,c:3.8,f:.75},long:{p:2.2,c:4.3,f:.7}}[t];
  const p=Math.round(w*z.p),c=Math.round(w*z.c),f=Math.round(w*z.f);return {p,c,f,kcal:p*4+c*4+f*9}
}
function field(id,label,type,value="",step=""){return `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${value??""}" ${step?`step="${step}"`:""}></div>`}
function go(v){document.querySelectorAll(".view").forEach(e=>e.classList.remove("active"));document.getElementById("view-"+v).classList.add("active");document.querySelectorAll(".nav-btn").forEach(e=>e.classList.toggle("active",e.dataset.view===v));scrollTo({top:0,behavior:"smooth"})}
function openModal(t,b){document.getElementById("modalTitle").textContent=t;document.getElementById("modalBody").innerHTML=b;document.getElementById("modal").classList.remove("hidden")}
function closeModal(){document.getElementById("modal").classList.add("hidden")}

function renderDashboard(){
  const e=latest(),B=bmr(),t=dayType(todayId()),M=macros(t);
  document.getElementById("view-dashboard").innerHTML=`
  <div class="hero"><div class="kicker">Painel de hoje</div><h1>${dayMeta.find(x=>x[0]===todayId())[1]} • ${typeLabel(t)}</h1><p>${t==="hard"?"Déficit pequeno e carbo concentrado para preservar rendimento.":t==="long"?"Abastecer, correr e recuperar.":"Proteína alta e déficit controlado."}</p></div>
  <div class="card"><h3>Estado atual</h3><div class="grid four">
  <div class="metric"><div class="k">Peso</div><div class="v">${e?fmt(e.weightKg)+" kg":"—"}</div></div>
  <div class="metric"><div class="k">BF</div><div class="v">${e?.bodyFatPct!=null?fmt(e.bodyFatPct)+"%":"—"}</div></div>
  <div class="metric"><div class="k">Cintura</div><div class="v">${e?.measurements?.waist?fmt(e.measurements.waist)+" cm":"—"}</div></div>
  <div class="metric"><div class="k">TMB prática</div><div class="v">${B.pr?Math.round(B.pr)+" kcal":"—"}</div></div></div>
  ${M?`<div class="grid four" style="margin-top:10px"><div class="metric"><div class="k">Meta kcal</div><div class="v">${M.kcal}</div></div><div class="metric"><div class="k">Proteína</div><div class="v">${M.p} g</div></div><div class="metric"><div class="k">Carbo</div><div class="v">${M.c} g</div></div><div class="metric"><div class="k">Gordura</div><div class="v">${M.f} g</div></div></div>`:`<div class="note warn" style="margin-top:10px">Cadastre uma avaliação com peso para liberar metas.</div>`}</div>
  <div class="card"><h3>Longão</h3><div class="grid four"><div class="metric"><div class="k">Dia</div><div class="v">${state.settings.longDay==="sat"?"Sábado":"Domingo"}</div></div><div class="metric"><div class="k">Horário</div><div class="v">${state.settings.longTime}</div></div><div class="metric"><div class="k">Distância</div><div class="v">${state.settings.longDistanceKm} km</div></div><div class="metric"><div class="k">Duração</div><div class="v">${state.settings.longDurationMin} min</div></div></div></div>
  <div class="card"><h3>Check-in rápido</h3>${["Proteína cumprida","Hidratação adequada","Energia boa no treino","Fome controlável","Sem empanturramento"].map((x,i)=>{const k=todayISO()+"_"+i;return `<label class="check"><input data-check="${k}" type="checkbox" ${state.checkins[k]?"checked":""}><span>${x}</span></label>`}).join("")}</div>`;
  document.querySelectorAll("[data-check]").forEach(el=>el.addEventListener("change",()=>saveCheck(el.dataset.check,el.checked)))
}

function dietPref(dayId){
  if(!state.settings.dietPrefs)state.settings.dietPrefs={};
  if(!state.settings.dietPrefs[dayId])state.settings.dietPrefs[dayId]={fasting:false,eveningRun:false};
  return state.settings.dietPrefs[dayId];
}
async function updateDietPref(dayId,key,value){
  const p=dietPref(dayId);
  p[key]=value;
  saveLocal();
  if(state.user)await saveProfile();
  renderDiet();
}

function foodButton(k,q,label){
  return `<button class="food-btn" data-food="${k}" data-qty="${q}">${label}</button>`;
}
function mealCard(time,title,body,why,extraClass=""){
  return `<div class="meal ${extraClass}">
    <div class="badge">${time}</div>
    <h4 style="margin-top:8px">${title}</h4>
    <div class="meal-line">${body}</div>
    <div class="why"><b>Por quê:</b> ${why}</div>
  </div>`;
}

function regularDietMeals(t,pref,option,eve){
  const hard=t==="hard", recovery=t==="recovery";
  const fasting=!!pref.fasting, evening=!!pref.eveningRun;
  const lunchRice=fasting?(hard?260:220):(hard?230:(recovery?190:180));
  const lunchProtein=fasting?200:180;
  const dinnerRice=hard?250:(recovery?190:180);
  const dinnerProtein=fasting?200:185;

  const breakfastA=`3 ovos + 2 fatias de pão + banana + iogurte`;
  const breakfastB=`Iogurte 200 g + whey 30 g + banana + granola 20–30 g`;
  const lunchA=`${foodButton("chicken",lunchProtein,`frango ${lunchProtein} g`)} + ${foodButton("rice",lunchRice,`arroz branco ${lunchRice} g`)} + feijão 80–100 g + legumes`;
  const lunchB=`${foodButton("beef",lunchProtein,`patinho/carne magra ${lunchProtein} g`)} + ${foodButton("pasta",Math.round(lunchRice*0.95/5)*5,`macarrão cozido ~${Math.round(lunchRice*0.95/5)*5} g`)} + molho de tomate/legumes`;
  const lunch=option===0?lunchA:lunchB;

  const preA=`4–6 biscoitos de arroz + geleia ou mel (15–25 g)${hard?" + 1 banana":""}. Se precisar fechar proteína: whey com água em pequena quantidade.`;
  const preB=`1 pão francês com geleia/mel + banana${hard?" + suco em pequena porção se estiver com pouca energia":""}.`;
  const afternoonNormal=option===0
    ? `Sanduíche com pão + frango 80–100 g + fruta`
    : `Iogurte + whey + fruta; se precisar de mais carbo, 20–30 g de granola`;

  const normalDinner=eve
    ? `${foodButton("rice",230,"arroz branco ~230 g")} OU ${foodButton("pasta",220,"macarrão cozido ~220 g")} + ${foodButton("chicken",180,"frango/carne magra ~180 g")} + legumes/molho simples`
    : `${foodButton(option===0?"beef":"chicken",dinnerProtein,`${option===0?"carne magra":"frango"} ${dinnerProtein} g`)} + ${foodButton(option===0?"rice":"potato",option===0?dinnerRice:300,option===0?`arroz ${dinnerRice} g`:"batata ~300 g")} + legumes`;

  const ceia=`Fruta + whey 25–30 g + leite 200–250 ml. Granola 20–30 g é opcional quando houver fome ou necessidade de completar carboidratos; não é obrigatória.`;

  const meals=[];
  if(!fasting){
    meals.push(mealCard("09:00","Café da manhã",option===0?breakfastA:breakfastB,
      "Você costuma tomar café por volta das 9h. A refeição dá proteína suficiente sem criar um volume grande."));
  }else{
    meals.push(`<div class="note good"><b>Jejum selecionado:</b> sem café da manhã. O jejum aqui é apenas uma forma de organizar as refeições; a perda de gordura continua dependendo do déficit e da ingestão total do dia.</div>`);
  }

  meals.push(mealCard("12:00–13:00","Almoço",lunch,
    fasting?"Como há menos refeições, o almoço recebe um pouco mais de proteína e carboidrato sem virar um prato gigantesco.":"Refeição principal do meio do dia, com proteína alta e carbo ajustado ao treino."));

  if(evening){
    meals.push(mealCard("16:30–17:30","Lanche / pré-corrida",option===0?preA:preB,
      "Pré-treino propositalmente leve, com carboidrato fácil de digerir e pouca gordura/fibra. Biscoito de arroz, geleia e mel encaixam muito bem aqui."));
    meals.push(mealCard("20:30–21:00",eve?"Jantar pós-corrida • véspera do longão":"Jantar pós-corrida",normalDinner,
      eve?"Além de recuperar a corrida, esta refeição prepara o glicogênio para o longão do dia seguinte.":"Depois da corrida, concentramos proteína e carboidrato para recuperação."));
    meals.push(mealCard("Após o jantar","Complemento",`1–2 porções de frutas. Se a proteína do dia ainda estiver baixa, acrescente whey e/ou leite. Granola 20–30 g pode entrar se o treino tiver sido mais exigente.`,
      "Como você já janta tarde quando corre, não faz sentido obrigar uma segunda refeição grande antes de dormir."));
  }else{
    meals.push(mealCard("15:30–16:30","Lanche da tarde",afternoonNormal,
      "Mantém proteína distribuída e evita chegar com fome exagerada ao jantar."));
    meals.push(mealCard("18:00",eve?"Jantar • véspera do longão":"Jantar",normalDinner,
      eve?"O jantar ganha mais carboidrato porque antecede o longão.":"Horário que você costuma preferir quando não corre à noite."));
    meals.push(mealCard("21:00–22:00","Ceia",ceia,
      "Fruta + whey + leite entrega proteína com pouco volume. A granola entra como ferramenta, não como obrigação."));
  }

  if(hard && fasting){
    meals.push(`<div class="note warn"><b>Treino forte + jejum:</b> pode funcionar se você tolerar bem, mas o app preserva carboidrato no almoço e no pré-treino. Se potência, ritmo ou percepção de esforço piorarem, a primeira mudança é retirar o jejum do dia forte — não cortar mais calorias.</div>`);
  }
  return meals.join("");
}

function longDietMeals(pref,option){
  const fasting=!!pref.fasting;
  const morning=String(state.settings.longTime||"06:30")<"12:00";
  const warning=fasting&&morning
    ? `<div class="note warn"><b>Jejum selecionado, mas com exceção de performance:</b> para um longão matinal, especialmente acima de ~75 min, o app mantém o pré-longão. A ideia é reduzir gordura sem sacrificar a sessão mais longa da semana.</div>`
    : "";
  const pre=option===0
    ? `2 pães + banana + mel/geleia + whey com água`
    : `Banana + pão/biscoito de arroz com mel + whey com água + pequena porção de suco`;
  const lunch=option===0
    ? `${foodButton("rice",270,"arroz ~270 g")} + ${foodButton("chicken",190,"frango/carne ~190 g")} + legumes + fruta`
    : `${foodButton("pasta",250,"macarrão cozido ~250 g")} + ${foodButton("beef",180,"patinho ~180 g")} + fruta`;
  return warning+
    mealCard("1h30–2h30 antes","Pré-longão",pre,"Carboidrato alto, pouca gordura e fibra para chegar com glicogênio e sem estômago pesado.")+
    mealCard("Durante","Combustível","30–60 g de carboidrato por hora + água; eletrólitos conforme calor e suor.","Carboidrato durante o longão é combustível de treino, não uma saída da dieta.")+
    mealCard("0–60 min depois","Pós imediato","Whey/iogurte + fruta; se o almoço for logo depois, pode ser apenas algo pequeno.","Começa a recuperação sem obrigar uma refeição enorme.")+
    mealCard("Almoço","Refeição principal",lunch,"Reposição de carboidrato e proteína depois do maior treino da semana.")+
    mealCard("18:00–20:00","Jantar","Proteína 170–190 g + arroz/batata moderado + legumes.","Depois da recuperação inicial, voltamos ao controle normal do dia.")+
    mealCard("Opcional","Ceia","Fruta + whey + leite se houver fome ou se a proteína ainda estiver abaixo da meta.","Evita comer por obrigação quando o jantar já foi suficiente.");
}

function renderDiet(){
  const t=dayType(currentDay),pref=dietPref(currentDay);
  const optionCount=2;if(planIndex>=optionCount)planIndex=0;
  const tabs=dayMeta.map(([id,n])=>`<button class="tab ${id===currentDay?"active":""}" data-day="${id}">${n}</button>`).join("");
  const subs=[0,1].map(i=>`<button class="subtab ${i===planIndex?"active":""}" data-plan="${i}">Opção ${String.fromCharCode(65+i)}</button>`).join("");

  const routine=`
    <div class="card">
      <h3>Rotina do dia</h3>
      <div class="form-grid two">
        <div class="field"><label>Manhã</label>
          <select id="dietFasting">
            <option value="no" ${!pref.fasting?"selected":""}>Com café da manhã (~09:00)</option>
            <option value="yes" ${pref.fasting?"selected":""}>Jejum até o almoço</option>
          </select>
        </div>
        <div class="field"><label>Corrida à noite</label>
          <select id="dietEveningRun" ${t==="long"?"disabled":""}>
            <option value="no" ${!pref.eveningRun?"selected":""}>Não</option>
            <option value="yes" ${pref.eveningRun?"selected":""}>Sim</option>
          </select>
        </div>
      </div>
      <p class="muted small">As escolhas ficam salvas por dia da semana e sincronizam pelo Firebase. Se houver corrida à noite, o jantar das 18h é retirado e o lanche da tarde vira pré-treino.</p>
    </div>`;

  const body=t==="long"
    ? longDietMeals(pref,planIndex)
    : regularDietMeals(t,pref,planIndex,isEve(currentDay));

  document.getElementById("view-diet").innerHTML=`
    <div class="hero"><div class="kicker">Dieta</div><h1>Cutting + performance</h1><p>Agora cada dia pode ter rotina com ou sem jejum, e com ou sem corrida à noite.</p></div>
    <div class="card"><div class="tabs">${tabs}</div></div>
    ${routine}
    <div class="card"><div class="subtabs">${subs}</div><span class="badge">${typeLabel(t)}</span>${body}</div>
    <div class="card"><h3>Substituições</h3><div class="actions"><button class="btn" data-lib="carb">Carboidratos</button><button class="btn" data-lib="protein">Proteínas</button><button class="btn" data-lib="fat">Gorduras</button></div></div>`;

  document.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>{currentDay=b.dataset.day;planIndex=0;renderDiet()});
  document.querySelectorAll("[data-plan]").forEach(b=>b.onclick=()=>{planIndex=Number(b.dataset.plan);renderDiet()});
  document.querySelectorAll("[data-food]").forEach(b=>b.onclick=()=>showFood(b.dataset.food,Number(b.dataset.qty)));
  document.querySelectorAll("[data-lib]").forEach(b=>b.onclick=()=>openLibrary(b.dataset.lib));

  document.getElementById("dietFasting").onchange=e=>updateDietPref(currentDay,"fasting",e.target.value==="yes");
  const eveningEl=document.getElementById("dietEveningRun");
  if(eveningEl)eveningEl.onchange=e=>updateDietPref(currentDay,"eveningRun",e.target.value==="yes");
}
function showFood(k,q){const f=foodDB[k];const rows=Object.values(foodDB).filter(x=>x.g===f.g&&x.name!==f.name).map(x=>{const eq=Math.round(((q/100*f.v)/x.v*100)/5)*5;return `<tr><td>${x.name}</td><td>${eq} g</td><td>${x.state}</td></tr>`}).join("");openModal("Substituir "+f.name,`<div class="note">Base: <b>${q} g</b>. Equivalência aproximada pelo macronutriente principal.</div><div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Alimento</th><th>Quantidade</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`)}
function openLibrary(g){const rows=Object.values(foodDB).filter(x=>x.g===g).map(x=>`<tr><td>${x.name}</td><td>${x.v} g/100 g</td><td>${x.state}</td></tr>`).join("");openModal("Biblioteca",`<div class="table-wrap"><table><thead><tr><th>Alimento</th><th>Referência</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table></div>`)}

function assessmentDraft(){
  const g=id=>document.getElementById(id)?.value??"";
  return {
    weightKg:num(g("weightKg")),
    heightCm:num(g("heightCm")),
    birthDate:g("birthDate"),
    sex:g("sex")||state.profile.sex,
    activityFactor:g("activityFactor")||state.profile.activityFactor,
    bodyFatPct:num(g("bodyFatPct")),
    leanMassKg:num(g("leanMassKg"))
  };
}
function estimateValue(v){return Number.isFinite(v)?Math.round(v)+" kcal":"—"}
function estimateHint(kind,B){
  if(kind==="mif")return B.mif?"Mifflin-St Jeor com peso, altura, idade e sexo.":"Preencha peso, altura e nascimento.";
  if(kind==="k")return B.k?"Baseada em massa livre de gordura.":"Requer BF% ou massa livre de gordura.";
  if(kind==="c")return B.c?"Cunningham baseada em massa livre de gordura.":"Requer BF% ou massa livre de gordura.";
  if(kind==="tdee")return B.tdee?"Estimativa de gasto diário = média dos métodos disponíveis × fator de atividade.":"Faltam dados para estimar gasto diário.";
  return "";
}
function updateAssessmentPreview(useLatest=false){
  const data=useLatest?null:assessmentDraft();
  const B=useLatest?bmr():bmrFromData(data);
  const map={mif:"estMif",k:"estKatch",c:"estCunningham",tdee:"estTdee"};
  for(const [kind,id] of Object.entries(map)){
    const val=kind==="mif"?B.mif:kind==="k"?B.k:kind==="c"?B.c:B.tdee;
    const el=document.getElementById(id),hint=document.getElementById(id+"Hint");
    if(el)el.textContent=estimateValue(val);
    if(hint)hint.textContent=estimateHint(kind,B);
  }
  const lbm=document.getElementById("estLbm");
  if(lbm)lbm.textContent=B.lbm?`MLG usada no cálculo: ${B.lbm.toFixed(1)} kg`:"";
}
function estimateCards(B){
  return `<div class="grid four">
    <div class="metric"><div class="k">Mifflin</div><div class="v" id="estMif">${estimateValue(B.mif)}</div><div class="muted small" id="estMifHint">${estimateHint("mif",B)}</div></div>
    <div class="metric"><div class="k">Katch-McArdle</div><div class="v" id="estKatch">${estimateValue(B.k)}</div><div class="muted small" id="estKatchHint">${estimateHint("k",B)}</div></div>
    <div class="metric"><div class="k">Cunningham</div><div class="v" id="estCunningham">${estimateValue(B.c)}</div><div class="muted small" id="estCunninghamHint">${estimateHint("c",B)}</div></div>
    <div class="metric"><div class="k">TDEE</div><div class="v" id="estTdee">${estimateValue(B.tdee)}</div><div class="muted small" id="estTdeeHint">${estimateHint("tdee",B)}</div></div>
  </div>
  <p class="muted small" id="estLbm">${B.lbm?`MLG usada no cálculo: ${B.lbm.toFixed(1)} kg`:""}</p>
  <div class="note"><b>Importante:</b> na avaliação básica, Mifflin e TDEE podem ser calculados. Katch-McArdle e Cunningham só aparecem quando houver % de gordura ou massa livre de gordura; o app não inventa essa informação.</div>`;
}

function renderAssessment(){
  const tabs=["basic","bio","full"].map(m=>`<button class="tab ${assessmentMode===m?"active":""}" data-assess="${m}">${{basic:"Básica",bio:"Bioimpedância",full:"Completa"}[m]}</button>`).join("");
  const bio=assessmentMode!=="basic"?`<hr class="sep"><h3>Bioimpedância</h3><div class="form-grid">${field("bodyFatPct","Gordura corporal (%)","number","","0.1")}${field("fatMassKg","Massa gorda (kg)","number","","0.1")}${field("leanMassKg","Massa livre de gordura (kg)","number","","0.1")}${field("skeletalMuscleKg","Massa muscular esquelética (kg)","number","","0.1")}${field("bodyWaterPct","Água corporal (%)","number","","0.1")}${field("visceralFat","Gordura visceral","number","","0.1")}</div>`:"";
  const full=assessmentMode==="full"?`<hr class="sep"><h3>Dobras (mm)</h3><div class="form-grid">${[["chest","Peitoral"],["axillary","Axilar média"],["triceps","Tríceps"],["subscapular","Subescapular"],["abdominal","Abdominal"],["suprailiac","Supra-ilíaca"],["thigh","Coxa"]].map(([i,l])=>field("sf_"+i,l,"number","","0.1")).join("")}</div><hr class="sep"><h3>Perímetros (cm)</h3><div class="form-grid">${[["neck","Pescoço"],["chest","Tórax"],["waist","Cintura"],["abdomen","Abdômen"],["hip","Quadril"],["armR","Braço D"],["armL","Braço E"],["forearm","Antebraço"],["thighProx","Coxa proximal"],["thighMid","Coxa média"],["calf","Panturrilha"]].map(([i,l])=>field("m_"+i,l,"number","","0.1")).join("")}</div>`:"";
  const B=bmr();

  document.getElementById("view-assessment").innerHTML=`
    <div class="hero"><div class="kicker">Avaliação</div><h1>Composição corporal</h1><p>As estimativas agora atualizam enquanto você preenche e continuam visíveis depois de salvar.</p></div>
    <div class="card">
      <div class="tabs">${tabs}</div>
      <form id="assessmentForm">
        <div class="form-grid">${field("evalDate","Data","date",todayISO())}${field("weightKg","Peso (kg)","number","","0.1")}${field("heightCm","Altura (cm)","number",state.profile.heightCm,"0.1")}</div>
        <div class="form-grid">
          <div class="field"><label>Sexo</label><select id="sex"><option value="male" ${state.profile.sex==="male"?"selected":""}>Masculino</option><option value="female" ${state.profile.sex==="female"?"selected":""}>Feminino</option></select></div>
          ${field("birthDate","Nascimento","date",state.profile.birthDate)}
          <div class="field"><label>Atividade</label><select id="activityFactor">${[["1.35","Leve"],["1.5","Moderado"],["1.65","Alto"],["1.75","Muito alto"]].map(([v,l])=>`<option value="${v}" ${state.profile.activityFactor===v?"selected":""}>${l} (${v})</option>`).join("")}</select></div>
        </div>
        ${bio}${full}
        <div class="field" style="margin-top:12px"><label>Observações</label><textarea id="notes"></textarea></div>
        <div class="actions" style="margin-top:14px"><button class="btn primary">Salvar avaliação</button></div>
      </form>
    </div>
    <div class="card"><h3>Estimativas metabólicas</h3>${estimateCards(B)}</div>`;

  document.querySelectorAll("[data-assess]").forEach(b=>b.onclick=()=>{assessmentMode=b.dataset.assess;renderAssessment()});
  const form=document.getElementById("assessmentForm");
  form.onsubmit=saveAssessment;
  form.addEventListener("input",()=>updateAssessmentPreview(false));
  form.addEventListener("change",()=>updateAssessmentPreview(false));
}

async function saveAssessment(e){
  e.preventDefault();
  const g=id=>document.getElementById(id)?.value||"";

  const weight=num(g("weightKg")),height=num(g("heightCm")),birth=g("birthDate");
  if(!weight||!height||!birth){
    toast("Preencha peso, altura e data de nascimento.");
    return;
  }

  state.profile.heightCm=String(height);
  state.profile.sex=g("sex");
  state.profile.birthDate=birth;
  state.profile.activityFactor=g("activityFactor");

  const a={
    date:g("evalDate")||todayISO(),mode:assessmentMode,weightKg:weight,
    bodyFatPct:num(g("bodyFatPct")),fatMassKg:num(g("fatMassKg")),
    leanMassKg:num(g("leanMassKg")),skeletalMuscleKg:num(g("skeletalMuscleKg")),
    bodyWaterPct:num(g("bodyWaterPct")),visceralFat:num(g("visceralFat")),
    notes:g("notes"),skinfolds:{},measurements:{}
  };

  if(!a.leanMassKg&&a.bodyFatPct!=null) a.leanMassKg=Number((weight*(1-a.bodyFatPct/100)).toFixed(2));
  if(!a.fatMassKg&&a.bodyFatPct!=null) a.fatMassKg=Number((weight*a.bodyFatPct/100).toFixed(2));

  if(assessmentMode==="full"){
    ["chest","axillary","triceps","subscapular","abdominal","suprailiac","thigh"].forEach(k=>a.skinfolds[k]=num(g("sf_"+k)));
    ["neck","chest","waist","abdomen","hip","armR","armL","forearm","thighProx","thighMid","calf"].forEach(k=>a.measurements[k]=num(g("m_"+k)));
  }

  if(state.user){
    await saveProfile();
    const ref=await addDoc(collection(db,"users",state.user.uid,"assessments"),{...a,createdAt:serverTimestamp()});
    a.id=ref.id;
  }else{
    a.localId=crypto.randomUUID();
  }

  // Atualiza imediatamente a interface; o listener do Firestore depois substitui pela versão sincronizada.
  if(!state.evaluations.some(x=>(x.id&&x.id===a.id)||(x.localId&&x.localId===a.localId))){
    state.evaluations.push(a);
  }
  saveLocal();
  toast("Avaliação salva e estimativas atualizadas.");
  renderAll();
}

function renderEvolution(){
  const evs=[...state.evaluations].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  document.getElementById("view-evolution").innerHTML=`<div class="hero"><div class="kicker">Evolução</div><h1>Histórico semanal</h1><p>Peso, cintura, BF e massa livre de gordura ao longo do cutting.</p></div><div class="card"><h3>Peso</h3><canvas id="chartWeight" class="chart"></canvas></div><div class="card"><h3>Cintura</h3><canvas id="chartWaist" class="chart"></canvas></div><div class="card"><h3>Histórico</h3>${evs.length?`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Peso</th><th>BF%</th><th>MLG</th><th>Cintura</th></tr></thead><tbody>${evs.slice().reverse().map(e=>`<tr><td>${e.date}</td><td>${fmt(e.weightKg)}</td><td>${fmt(e.bodyFatPct)}</td><td>${fmt(e.leanMassKg)}</td><td>${fmt(e.measurements?.waist)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="note">Ainda sem avaliações.</div>`}</div>`;
  requestAnimationFrame(()=>{draw("chartWeight",evs.map(e=>e.weightKg).filter(x=>x!=null),"kg");draw("chartWaist",evs.map(e=>e.measurements?.waist).filter(x=>x!=null),"cm")})
}
function draw(id,vals,suf){const c=document.getElementById(id);if(!c)return;const r=c.getBoundingClientRect(),d=devicePixelRatio||1;c.width=r.width*d;c.height=r.height*d;const x=c.getContext("2d");x.scale(d,d);const W=r.width,H=r.height,p=34;x.strokeStyle="#2b3447";x.beginPath();x.moveTo(p,12);x.lineTo(p,H-p);x.lineTo(W-10,H-p);x.stroke();if(!vals.length){x.fillStyle="#9ca3af";x.fillText("Sem dados",p+10,H/2);return}const mn=Math.min(...vals),mx=Math.max(...vals),sp=(mx-mn)||1,step=vals.length>1?(W-p-20)/(vals.length-1):0,Y=v=>12+(H-p-22)*(1-(v-mn)/sp);x.strokeStyle="#f59e0b";x.lineWidth=2;x.beginPath();vals.forEach((v,i)=>{const xx=p+i*step,yy=Y(v);i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke();x.fillStyle="#9ca3af";x.font="11px sans-serif";x.fillText(mx.toFixed(1)+" "+suf,3,20);x.fillText(mn.toFixed(1)+" "+suf,3,H-p)}

function renderAccount(){
  document.getElementById("view-account").innerHTML=`<div class="hero"><div class="kicker">Firebase • V4</div><h1>${state.user?"Conta conectada":"Login e sincronização"}</h1><p>${state.user?"Seus dados estão ligados ao usuário Firebase e sincronizam em tempo real.":"Entre com a mesma conta no celular e no PC."}</p></div>
  ${state.user?`<div class="card"><h3>${state.user.email}</h3><div class="note good">Sincronização ativa. O Firestore mantém cache local e atualiza os dispositivos conectados.</div><div class="actions" style="margin-top:12px"><button id="logoutBtn" class="btn bad">Sair</button></div></div>`:
  `<div class="card"><h3>Entrar</h3><div class="form-grid two">${field("loginEmail","E-mail","email","")}${field("loginPassword","Senha","password","")}</div><div class="actions" style="margin-top:12px"><button id="loginBtn" class="btn primary">Entrar</button><button id="signupBtn" class="btn">Criar conta</button></div></div>`}
  <div class="card"><h3>Semana de treino</h3><div class="form-grid"><div class="field"><label>Longão</label><select id="longDay"><option value="sat" ${state.settings.longDay==="sat"?"selected":""}>Sábado</option><option value="sun" ${state.settings.longDay==="sun"?"selected":""}>Domingo</option></select></div>${field("longTime","Horário","time",state.settings.longTime)}${field("longDistanceKm","Distância (km)","number",state.settings.longDistanceKm,"0.1")}${field("longDurationMin","Duração (min)","number",state.settings.longDurationMin,"1")}<div class="field"><label>Intensidade</label><select id="longIntensity"><option value="easy" ${state.settings.longIntensity==="easy"?"selected":""}>Leve</option><option value="progressive" ${state.settings.longIntensity==="progressive"?"selected":""}>Progressivo</option><option value="tempo" ${state.settings.longIntensity==="tempo"?"selected":""}>Ritmado/blocos</option></select></div>${field("hardTime","Treino forte","time",state.settings.hardTime)}</div><div class="actions" style="margin-top:12px"><button id="saveWeekBtn" class="btn good">Salvar semana</button></div></div>`;
  if(state.user)document.getElementById("logoutBtn").onclick=()=>firebaseSignOut(auth);
  else{
    document.getElementById("loginBtn").onclick=login;
    document.getElementById("signupBtn").onclick=signup;
  }
  document.getElementById("saveWeekBtn").onclick=saveWeek;
}

async function login(){const e=document.getElementById("loginEmail").value.trim(),p=document.getElementById("loginPassword").value;try{await signInWithEmailAndPassword(auth,e,p);toast("Login realizado.")}catch(err){toast("Erro: "+(err.code||err.message))}}
async function signup(){const e=document.getElementById("loginEmail").value.trim(),p=document.getElementById("loginPassword").value;try{await createUserWithEmailAndPassword(auth,e,p);toast("Conta criada.")}catch(err){toast("Erro: "+(err.code||err.message))}}

async function saveProfile(){
  if(!state.user)return;
  await setDoc(doc(db,"users",state.user.uid),{profile:state.profile,settings:state.settings,updatedAt:serverTimestamp()},{merge:true})
}
async function saveWeek(){
  const g=id=>document.getElementById(id).value;
  state.settings={...state.settings,longDay:g("longDay"),longTime:g("longTime"),longDistanceKm:g("longDistanceKm"),longDurationMin:g("longDurationMin"),longIntensity:g("longIntensity"),hardTime:g("hardTime")};
  saveLocal();if(state.user)await saveProfile();toast("Semana salva.");renderAll()
}
async function saveCheck(k,v){
  state.checkins[k]=v;saveLocal();
  if(state.user)await setDoc(doc(db,"users",state.user.uid,"checkins",k),{key:k,value:v,updatedAt:serverTimestamp()},{merge:true})
}

function startRealtime(uid){
  stopRealtime();
  unsubs.push(onSnapshot(doc(db,"users",uid),snap=>{if(snap.exists()){const d=snap.data();state.profile={...state.profile,...(d.profile||{})};state.settings={...state.settings,...(d.settings||{})};saveLocal();renderAll()}}));
  unsubs.push(onSnapshot(query(collection(db,"users",uid,"assessments"),orderBy("date","asc")),snap=>{state.evaluations=snap.docs.map(d=>({id:d.id,...d.data()}));saveLocal();renderAll()}));
  unsubs.push(onSnapshot(collection(db,"users",uid,"checkins"),snap=>{const c={};snap.docs.forEach(d=>{const x=d.data();c[x.key||d.id]=!!x.value});state.checkins=c;saveLocal();renderDashboard()}));
}
function stopRealtime(){unsubs.forEach(fn=>{try{fn()}catch{}});unsubs=[]}

function renderAll(){renderDashboard();renderDiet();renderAssessment();renderEvolution();renderAccount();updateStatus()}
function updateStatus(){const e=document.getElementById("syncStatus");if(state.user){e.textContent="Firebase";e.className="status-pill online"}else{e.textContent="Local";e.className="status-pill offline"}}

onAuthStateChanged(auth,async user=>{
  stopRealtime();
  state.user=user?{uid:user.uid,email:user.email}:null;saveLocal();
  if(user){
    const ref=doc(db,"users",user.uid),snap=await getDoc(ref).catch(()=>null);
    if(!snap?.exists())await setDoc(ref,{profile:state.profile,settings:state.settings,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    startRealtime(user.uid);
  }
  renderAll()
});

function initInstall(){
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;document.getElementById("installBtn").classList.remove("hidden")});
  document.getElementById("installBtn").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;document.getElementById("installBtn").classList.add("hidden")}else toast("Use o menu do navegador → Instalar app / Adicionar à tela inicial.")}
}

document.addEventListener("DOMContentLoaded",()=>{
  document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>go(b.dataset.view));
  document.getElementById("modalClose").onclick=closeModal;
  document.getElementById("modal").onclick=e=>{if(e.target.id==="modal")closeModal()};
  initInstall();renderAll();go("dashboard");
  if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(console.warn)
});
