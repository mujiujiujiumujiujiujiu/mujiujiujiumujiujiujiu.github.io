const DUCK_WATER_PARTICLES=5;
const DEFAULT_DUCKS=[[10.5,16.5],[17.5,10.5],[22.5,6.5]];
function freshDucks(positions=DEFAULT_DUCKS){return positions.map(([x,y])=>({x,y,absorbed:0,collected:false}));}
function saveBestStars(storage,level,stars){if(level<0)return;try{let scores=JSON.parse(storage.getItem('croco-bath-stars-v1')||'{}');if(!scores||typeof scores!=='object'||Array.isArray(scores))scores={};const old=Number(scores[level]);scores[level]=Math.max(Number.isInteger(old)&&old>=0&&old<=3?old:0,Math.max(0,Math.min(3,Math.floor(stars))));storage.setItem('croco-bath-stars-v1',JSON.stringify(scores));}catch{}}
