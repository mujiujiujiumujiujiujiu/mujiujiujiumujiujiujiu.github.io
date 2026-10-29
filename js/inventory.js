// Shared authoring contract and runtime rules. -1 means unlimited; zero means absent.
const ITEM_DEFS=[
 {id:'shovel',name:'铲子',icon:'iron_shovel',kind:'tool',hint:'挖泥土和草方块'},
 {id:'pickaxe',name:'铁镐',icon:'iron_pickaxe',kind:'tool',hint:'可挖石头、圆石、木块'},
 {id:'diamond_pickaxe',name:'钻石镐',icon:'diamond_pickaxe',kind:'tool',hint:'还可挖黑曜石'},
 {id:'wood',name:'木块',icon:'icon_wood',kind:'block',tile:2,hint:'搭建平台、支撑和挡板'},
 {id:'stone',name:'石块',icon:'icon_stone',kind:'block',tile:3,hint:'搭建平台、改变水路'},
 {id:'dirt',name:'泥土块',icon:'dirt',kind:'block',tile:1,hint:'可放置，也可用铲子挖开'},
 {id:'cobble',name:'圆石',icon:'cobblestone',kind:'block',tile:9,hint:'可堆叠的平台方块'},
 {id:'obsidian',name:'黑曜石',icon:'icon_obsidian',kind:'block',tile:4,hint:'耐爆挡板，钻石镐可挖'},
 {id:'tnt',name:'炸药',icon:'icon_tnt',kind:'block',tile:5,hint:'靠岩浆、火焰或拉杆点燃'},
 {id:'water_bucket',name:'水桶',icon:'icon_water',kind:'bucket',liquid:'water',hint:'倒出一格有限清水'},
 {id:'lava_bucket',name:'岩浆桶',icon:'icon_lava',kind:'bucket',liquid:'lava',hint:'倒出一格有限岩浆'},
 {id:'lever',name:'拉杆',icon:'icon_lever',kind:'lever',hint:'安装到TNT，再点按拨动'}
];
function defaultLoadout(){return{shovel:-1,pickaxe:0,diamond_pickaxe:0,wood:0,stone:0,dirt:0,cobble:0,obsidian:0,tnt:0,water_bucket:0,lava_bucket:0,lever:0};}
function normalizeLoadout(input){if(input===undefined)return defaultLoadout();if(!input||typeof input!=='object'||Array.isArray(input))throw Error('玩家道具配给无效');const valid=new Set(ITEM_DEFS.map(d=>d.id));for(const id of Object.keys(input))if(!valid.has(id))throw Error('未知道具：'+id);const result={};for(const def of ITEM_DEFS){const value=input[def.id]??0;if(!Number.isInteger(value)||value< -1||value>9999)throw Error(def.name+'的数量/耐久必须是-1到9999的整数');result[def.id]=value;}return result;}
const hasItem=(inventory,id)=>inventory[id]===-1||inventory[id]>0;
function consumeItem(inventory,id){if(!hasItem(inventory,id))return false;if(inventory[id]>0)inventory[id]--;return true;}
function canMine(tool,tile){if(tool==='shovel')return tile===1||tile===7;if(tool==='pickaxe')return[1,2,3,7,9].includes(tile);if(tool==='diamond_pickaxe')return[1,2,3,4,7,9].includes(tile);return false;}

