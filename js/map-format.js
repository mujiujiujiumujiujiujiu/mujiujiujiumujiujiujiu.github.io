



const MAP_FORMAT='croco-mc-map';
function mapFromWorld(world,name='我的方块水路'){
 const water=[],lava=[],levers=[];for(let i=0;i<N;i++){for(const[kind,list]of [[world.water,water],[world.lava,lava]]){const n=Math.round(kind[i]*FLUID_PPC);if(n)list.push([i%W,Math.floor(i/W),n/FLUID_PPC]);}}for(const[i,on]of world.levers)levers.push([i%W,Math.floor(i/W),on]);
 return {format:MAP_FORMAT,version:4,fluidMode:'finite-particle',width:W,height:H,name:String(name).slice(0,80),blocks:Array.from(world.blocks),water,lava,levers,loadout:normalizeLoadout(world.loadout),ducks:world.ducks.map(d=>[d.x,d.y]),bath:{...(world.goal||{x:21,y:2,width:8,height:4})}};
}
function validateMap(data){
 if(!data||data.format!==MAP_FORMAT||![1,2,3,4].includes(data.version))throw Error('不是受支持的方块浴场地图文件');if(data.width!==W||data.height!==H)throw Error('当前编辑器支持 32×28 地图');if(!Array.isArray(data.blocks)||data.blocks.length!==N||data.blocks.some(t=>!Number.isInteger(t)||t<0||t>9))throw Error('地图方块数据无效');
 const liquids={};let volume=0;for(const field of['water','lava']){const input=data.version===1?data[field+'Sources']?.map(p=>Array.isArray(p)?[...p,1]:p):data[field];if(!Array.isArray(input)||input.length>N)throw Error('液体数据无效');const used=new Set;liquids[field]=[];for(const p of input){if(!Array.isArray(p)||p.length!==3||!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<1||p[0]>=W-1||p[1]<1||p[1]>=H||!Number.isFinite(p[2])||p[2]<=0||p[2]>4)throw Error('液体坐标或容量无效');const i=at(p[0],p[1]),n=Math.round(p[2]*FLUID_PPC);if(!n||data.blocks[i]||used.has(i))throw Error('液体不能与方块或同类液体记录重复');used.add(i);volume+=n/FLUID_PPC;liquids[field].push([p[0],p[1],n/FLUID_PPC]);}}
 if(volume>N+.001)throw Error('地图液体总量过大');if(!Array.isArray(data.levers)||data.levers.length>N)throw Error('拉杆数据无效');const leverIds=new Set;for(const p of data.levers){if(!Array.isArray(p)||p.length!==3||!Number.isInteger(p[0])||!Number.isInteger(p[1])||p[0]<0||p[0]>=W||p[1]<0||p[1]>=H||typeof p[2]!=='boolean')throw Error('拉杆坐标无效');const i=at(p[0],p[1]);if(data.blocks[i]!==T.TNT||leverIds.has(i))throw Error('拉杆必须安装在 TNT 上，且不能重复');leverIds.add(i);}
 const ducks=data.ducks??DEFAULT_DUCKS;if(!Array.isArray(ducks)||ducks.length!==3||ducks.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<1||p[0]>=W-1||p[1]<1||p[1]>=H-1)||new Set(ducks.map(p=>Math.floor(p[0])+','+Math.floor(p[1]))).size!==3)throw Error('需要三个位置不同且在地图内的小鸭子');
 const g=data.bath;if(!g||g.width!==8||g.height!==4||!Number.isInteger(g.x)||!Number.isInteger(g.y)||g.x<1||g.x+g.width>=W||g.y<1||g.y+g.height>H-1)throw Error('浴池位置无效');
 return {format:MAP_FORMAT,version:4,fluidMode:'finite-particle',width:W,height:H,name:typeof data.name==='string'?data.name.slice(0,80):'导入地图',blocks:[...data.blocks],water:liquids.water,lava:liquids.lava,levers:data.levers.map(p=>[...p]),loadout:normalizeLoadout(data.loadout),ducks:ducks.map(p=>[...p]),bath:{x:g.x,y:g.y,width:8,height:4}};
}
function worldFromMap(data){const map=validateMap(data),world=new BathWorld;world.blocks.set(map.blocks);world.fuses.clear();world.levers.clear();world.events=[];world.goal={...map.bath};world.resetDucks(map.ducks);world.resetFluids(map.water,map.lava);world.loadout=normalizeLoadout(map.loadout);world.inventory={...world.loadout};world.collected=0;world.goalReached=false;world.digs=0;for(const[x,y,on]of map.levers){world.levers.set(at(x,y),on);if(on)world.ignite(x,y,'lever');}world.leverRevision++;world.revision++;return world;}
