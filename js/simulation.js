


const W=32,H=28,N=W*H;
const T={AIR:0,DIRT:1,WOOD:2,STONE:3,OBSIDIAN:4,TNT:5,BEDROCK:6,GRASS:7,IRON:8,COBBLE:9};
const LEVELS=[
 {name:'第一关 · 让清泉向下流',hint:'水量有限。挖开水源下方的泥土，让水顺着沟槽流进下方浴池，别让清水漏进死角。',gates:[1,1,1]},
 {name:'第二关 · 矿洞里的回声',hint:'默认铲子挖泥土。TNT 上预装了拉杆：点击小拉杆通电，4 秒后爆破石墙。',gates:[1,3,3]},
 {name:'第三关 · 冷却岩浆',hint:'水和岩浆都是有限流体。满一格岩浆碰水变黑曜石；未满一格的岩浆与水在同一格接触变石头。',gates:[1,2,3]}
];
const at=(x,y)=>y*W+x;
class BathWorld{
 constructor(level=0){this.level=level;this.loadout=defaultLoadout();this.inventory={...this.loadout};this.blocks=new Uint8Array(N);this.water=new Float32Array(N);this.lava=new Float32Array(N);this.damage=new Uint8Array(N);this.collected=0;this.target=4;this.failed=false;this.goalReached=false;this.tick=0;this.events=[];this.fires=new Map;this.fuses=new Map;this.levers=new Map;this.digs=0;this.revision=0;this.leverRevision=0;this.resetDucks();this.build();const water=[],lava=[];for(let i=0;i<N;i++){if(this.water[i])water.push([i%W,Math.floor(i/W),this.water[i]]);if(this.lava[i])lava.push([i%W,Math.floor(i/W),this.lava[i]]);}this.resetFluids(water,lava);}
 valid(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&x<W&&y>=0&&y<H;}
 resetDucks(positions){this.ducks=freshDucks(positions);this.stars=0;}
 igniteWood(x,y,cause='lava'){const i=at(x,y);if(this.get(x,y)!==T.WOOD||this.fires.has(i))return false;this.fires.set(i,{age:0,spread:0});this.events.push({type:'fire',x,y,cause});return true;}
 // Side contact with water is not immunity. Water must fill the upper flame cell;
 // direct lava contact keeps supplying heat even when that flame cell is wet.
 fireCovered(x,y){return this.get(x,y+1)===T.AIR&&this.water[at(x,y+1)]>=.45;}
 updateFire(dt,hot=new Set){const spread=[];for(const[i,fire]of[...this.fires]){const x=i%W,y=Math.floor(i/W);if(this.get(x,y)!==T.WOOD){this.fires.delete(i);continue;}if(!hot.has(i)&&this.fireCovered(x,y)){this.fires.delete(i);this.events.push({type:'extinguish',x,y});continue;}fire.age+=dt;fire.spread+=dt;if(fire.age+1e-6>=1.5&&fire.spread+1e-6>=.5){fire.spread=0;for(const[dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[0,2]]){if(dy===2&&this.get(x,y+1)!==T.AIR)continue;const nx=x+dx,ny=y+dy,t=this.get(nx,ny);if(t===T.WOOD&&(hot.has(at(nx,ny))||!this.fireCovered(nx,ny)))spread.push([nx,ny]);if(t===T.TNT)this.ignite(nx,ny,'fire');}}if(fire.age+1e-6>=10){this.mine(x,y,true);this.events.push({type:'burnout',x,y});}}for(const[x,y]of spread)this.igniteWood(x,y,'spread');}
 absorbDucks(){const used=new Set;for(let index=0;index<this.ducks.length;index++){const d=this.ducks[index];if(d.collected||this.get(Math.floor(d.x),Math.floor(d.y)))continue;for(const p of this.fluidEngine.particles){if(d.absorbed>=DUCK_WATER_PARTICLES)break;if(p.kind||used.has(p.id)||(p.x-d.x)**2+(p.y-d.y)**2>.65**2)continue;let blocked=false;for(const f of[.25,.5,.75])if(this.get(Math.floor(d.x+(p.x-d.x)*f),Math.floor(d.y+(p.y-d.y)*f))){blocked=true;break;}if(blocked)continue;used.add(p.id);d.absorbed++;}if(d.absorbed>=DUCK_WATER_PARTICLES){d.collected=true;this.stars=Math.min(3,this.stars+1);this.events.push({type:'duck-star',index,x:d.x,y:d.y});}}if(used.size){this.fluidEngine.removeWhere(p=>used.has(p.id));this.syncFluids();}}
 get(x,y){return this.valid(x,y)?this.blocks[at(x,y)]:T.BEDROCK;}
 clearLiquid(i){this.fluidEngine?.removeCell(i%W,Math.floor(i/W));this.water[i]=this.lava[i]=0;}
 set(x,y,t){if(!this.valid(x,y))return;const i=at(x,y);this.blocks[i]=t;this.fires?.delete(i);if(t)this.clearLiquid(i);if(t!==T.TNT){this.fuses.delete(i);if(this.levers.delete(i))this.leverRevision++;}this.revision++;}
 bath(x,y){const g=this.goal||{x:21,y:2,width:8,height:4};return x>=g.x&&x<g.x+g.width&&y>=g.y&&y<g.y+g.height;}
 resetFluids(water=[],lava=[]){this.fluidEngine=new ParticleFluid(W,H,(x,y)=>!!this.get(x,y));for(const[x,y,v]of water)this.fluidEngine.add('water',x,y,v);for(const[x,y,v]of lava)this.fluidEngine.add('lava',x,y,v);this.syncFluids();this.initialWater=this.fluidEngine.volume('water');this.initialLava=this.fluidEngine.volume('lava');this.target=this.initialWater>0?Math.min(4,this.initialWater):4;}
 syncFluids(){this.fluidEngine.project(this.water,this.lava);}
 addVolume(kind,x,y,volume=1){if(!this.valid(x,y)||this.get(x,y))return 0;if(!this.fluidEngine){(kind==='water'?this.water:this.lava)[at(x,y)]+=volume;return volume;}if(this.fluidEngine.particles.length+Math.round(volume*FLUID_PPC)>8192)return 0;const added=this.fluidEngine.add(kind,x,y,volume);this.syncFluids();return added;}
 build(){
  for(let y=0;y<26;y++)for(let x=0;x<W;x++)this.set(x,y,x===0||x===31||y===0?6:y===25?7:y<3?3:1);
  const clear=(x0,x1,y0,y1)=>{for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)this.set(x,y,0);};
  clear(8,9,16,20);clear(8,16,16,18);clear(15,16,10,17);clear(15,23,10,12);clear(22,23,4,11);
  for(let y=20;y<=25;y++)for(let x=2;x<=10;x++)this.set(x,y,x===2||x===10||y===20?4:0);
  for(let x=3;x<=9;x++)for(let y=21;y<=24;y++)this.addVolume('water',x,y);
  const gates=LEVELS[this.level].gates;for(let x=8;x<=9;x++)this.set(x,20,gates[0]);for(let y=16;y<=18;y++)this.set(13,y,gates[1]);for(let y=10;y<=12;y++)this.set(20,y,gates[2]);
  clear(21,28,2,5);for(let x=20;x<=29;x++)this.set(x,1,8);for(let y=2;y<=5;y++){this.set(20,y,8);this.set(29,y,8);}
  for(let x=7;x<=14;x++)this.set(x,15,3);for(let x=14;x<=21;x++)this.set(x,9,3);
  for(const [x,y]of [[4,11],[5,11],[6,11],[4,10],[5,10],[11,6],[12,6],[13,6],[27,18],[28,18],[28,17],[5,6]])this.set(x,y,3);
  if(this.level>0){for(const[x,y]of[[13,17],[20,11]]){this.set(x,y,5);this.attachLever(x,y);}}
  if(this.level===2){clear(23,28,14,16);for(let x=23;x<=29;x++)this.set(x,13,4);this.set(23,13,2);for(let x=24;x<=28;x++)for(let y=14;y<=16;y++)this.addVolume('lava',x,y);}
 }
 mine(x,y,force=false,tool='shovel'){const t=this.get(x,y);if(!t||t===T.BEDROCK||t===T.IRON||(force&&t===T.OBSIDIAN)||(!force&&(!canMine(tool,t)||!hasItem(this.inventory,tool))))return false;const i=at(x,y);if(this.fuses.has(i))return false;this.set(x,y,0);this.damage[i]=0;if(!force)consumeItem(this.inventory,tool);this.digs++;this.events.push({type:'break',x,y,material:t});return true;}
 useItem(id,x,y){const def=ITEM_DEFS.find(d=>d.id===id);if(!def||!hasItem(this.inventory,id))return false;if(def.kind==='tool')return this.mine(x,y,false,id);let done=false;if(def.kind==='block')done=this.place(x,y,def.tile);else if(def.kind==='lever')done=this.attachLever(x,y);else if(def.kind==='bucket'&&!this.bath(x,y))done=this.addVolume(def.liquid,x,y,1)>0;if(done)consumeItem(this.inventory,id);return done;}
 place(x,y,t){if(!this.valid(x,y)||this.get(x,y)||this.bath(x,y))return false;if(!this.fluidEngine.displaceCell(x,y))return false;this.set(x,y,t);this.syncFluids();return true;}
 attachLever(x,y){const i=at(x,y);if(this.get(x,y)!==T.TNT||this.levers.has(i)||this.fuses.has(i))return false;this.levers.set(i,false);this.leverRevision++;return true;}
 toggleLever(x,y){const i=at(x,y);if(!this.levers.has(i))return false;const on=!this.levers.get(i);this.levers.set(i,on);this.leverRevision++;this.events.push({type:'lever',x,y,on});if(on)this.ignite(x,y,'lever');return true;}
 ignite(x,y,cause='lava',seconds=4){const i=at(x,y);if(this.get(x,y)!==T.TNT||this.fuses.has(i))return false;this.fuses.set(i,seconds);this.events.push({type:'fuse',x,y,cause,seconds});return true;}
 explode(x,y){const own=at(x,y);this.fuses.delete(own);this.set(x,y,0);this.fluidEngine.impulse(x+.5,y+.5);this.events.push({type:'explosion',x,y});for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(dx*dx+dy*dy<=6){const nx=x+dx,ny=y+dy;if(!this.valid(nx,ny))continue;const i=at(nx,ny);if(this.blocks[i]===T.TNT){const short=.5+((nx*13+ny*7)%21)/20;if(this.fuses.has(i))this.fuses.set(i,Math.min(this.fuses.get(i),short));else this.ignite(nx,ny,'chain',short);}else this.mine(nx,ny,true);}}
 react(){const engine=this.fluidEngine,contacts=engine.contacts();if(!contacts.length)return;const fill=new Float32Array(this.lava),alive=new Set(engine.particles.map(p=>p.id)),converted=new Set;for(const[water,lava]of contacts){if(!alive.has(water.id)||!alive.has(lava.id))continue;const x=Math.floor(lava.x),y=Math.floor(lava.y),i=at(x,y),sameCell=Math.floor(water.x)===x&&Math.floor(water.y)===y,full=fill[i]>=1-1e-5;if(converted.has(i)||this.get(x,y)||(!sameCell&&!full))continue;const t=full?T.OBSIDIAN:T.STONE;for(const id of engine.removeCell(x,y,'reacted'))alive.delete(id);if(alive.has(water.id))for(const id of engine.removeWhere(p=>p.id===water.id,'reacted'))alive.delete(id);this.set(x,y,t);converted.add(i);this.events.push({type:'steam',x,y,material:t});}if(converted.size)this.syncFluids();}
 step(dt=1/40){this.tick++;
  for(const[i,time]of[...this.fuses]){if(time<=dt)this.explode(i%W,Math.floor(i/W));else this.fuses.set(i,time-dt);}
  this.react();this.fluidEngine.step(dt);this.syncFluids();this.react();
  const hotWood=new Set;for(const p of this.fluidEngine.particles)if(p.kind===1)for(let y=Math.floor(p.y-.28);y<=Math.floor(p.y+.28);y++)for(let x=Math.floor(p.x-.28);x<=Math.floor(p.x+.28);x++){const t=this.get(x,y);if(t!==T.TNT&&t!==T.WOOD)continue;const nx=Math.max(x,Math.min(x+1,p.x)),ny=Math.max(y,Math.min(y+1,p.y));if((p.x-nx)**2+(p.y-ny)**2>.28**2)continue;if(t===T.WOOD)hotWood.add(at(x,y));else this.ignite(x,y,'lava');}for(const i of hotWood)this.igniteWood(i%W,Math.floor(i/W),'lava');this.updateFire(dt,hotWood);
  this.absorbDucks();if(this.initialWater>0)this.target=Math.min(4,Math.max(1/FLUID_PPC,this.initialWater-this.ducks.reduce((n,d)=>n+d.absorbed/FLUID_PPC,0)));this.collected=0;this.failed=false;const goal=this.goal||{x:21,y:2,width:8,height:4};for(let y=goal.y;y<goal.y+goal.height;y++)for(let x=goal.x;x<goal.x+goal.width;x++){const i=at(x,y);this.collected+=this.water[i];if(this.lava[i])this.failed=true;}if(this.collected+1e-5>=this.target)this.goalReached=true;
 }
}



