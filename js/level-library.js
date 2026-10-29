
const LEVEL_LIBRARY_KEY='croco-published-levels-v1';
function validateLibrary(data){
 if(!data||data.format!=='croco-level-library'||data.version!==1||!Array.isArray(data.entries)||data.entries.length>64)throw Error('关卡库格式无效');
 const used=new Set;return{format:'croco-level-library',version:1,entries:data.entries.map(e=>{if(!e||!Number.isInteger(e.id)||e.id<0||e.id>1023||used.has(e.id)||!Number.isFinite(e.updatedAt))throw Error('关卡编号无效或重复');used.add(e.id);return{id:e.id,updatedAt:e.updatedAt,map:validateMap(e.map)};})};
}
class LevelLibrary{
 constructor(storage,embedded={format:'croco-level-library',version:1,entries:[]}){this.storage=storage;this.data=validateLibrary(embedded);this.loadError=null;try{const raw=storage.getItem(LEVEL_LIBRARY_KEY);if(raw){const saved=validateLibrary(JSON.parse(raw)),byId=new Map(this.data.entries.map(e=>[e.id,e]));for(const e of saved.entries)if(!byId.has(e.id)||byId.get(e.id).updatedAt<e.updatedAt)byId.set(e.id,e);this.data.entries=[...byId.values()];}}catch(e){this.loadError=e.message;}}
 get(id){const entry=this.data.entries.find(e=>e.id===id);return entry?structuredClone(entry.map):null;}
 ids(){return[...new Set([0,1,2,...this.data.entries.map(e=>e.id)])].sort((a,b)=>a-b);}
 nextId(){return Math.max(2,...this.data.entries.map(e=>e.id))+1;}
 save(map,id=this.nextId()){
  const clean=validateMap(map),entry={id,updatedAt:Math.max(Date.now(),...this.data.entries.map(e=>e.updatedAt+1)),map:clean},entries=this.data.entries.filter(e=>e.id!==id);entries.push(entry);const next=validateLibrary({...this.data,entries});
  // Persist before publishing the new in-memory catalog: quota/errors cannot claim a save.
  this.storage.setItem(LEVEL_LIBRARY_KEY,JSON.stringify(next));this.data=next;return structuredClone(entry);
 }
 export(){return structuredClone(this.data);}
}
function portableGameHTML(shell,styles,code,catalog){const endTag='<'+ '/script>',data=JSON.stringify(validateLibrary(catalog)).replace(/</g,'\\u003c');return shell.replace('<!-- LEVEL_LIBRARY -->',()=>'<script id="authored-levels" type="application/json">'+data+endTag).replace('<!-- INLINE_CSS -->',()=>'<style>'+styles+'</style>').replace('<!-- INLINE_GAME -->',()=>'<script>'+code+endTag);}
function withEmbeddedLibrary(html,catalog){const data=JSON.stringify(validateLibrary(catalog)).replace(/</g,'\\u003c');return html.replace(/(<script id="authored-levels" type="application\/json">)[\s\S]*?(<\/script>)/,(_,open,end)=>open+data+end);}
