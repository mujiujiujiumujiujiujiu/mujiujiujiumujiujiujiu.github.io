class SceneGesture{
 constructor(holdMs=220){this.holdMs=holdMs;this.points=new Map;this.pinching=false;this.held=false;this.distance=0;}
 begin(id,x,y,time){this.points.set(id,{x,y,startX:x,startY:y,time});if(this.points.size>=2){this.pinching=true;this.held=false;this.distance=this.measure();}}
 measure(){const [a,b]=this.points.values();return a&&b?Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)):1;}
 move(id,x,y){const p=this.points.get(id);if(!p)return null;p.x=x;p.y=y;if(this.pinching&&this.points.size>=2){const next=this.measure(),ratio=next/this.distance;this.distance=next;return{type:'zoom',ratio};}return null;}
 hold(){if(this.pinching||this.points.size!==1)return null;this.held=true;return [...this.points.values()][0];}
 end(id,x,y,time){const p=this.points.get(id),tap=p&&!this.pinching&&!this.held&&time-p.time<this.holdMs&&Math.hypot(x-p.startX,y-p.startY)<=10;this.points.delete(id);if(!this.points.size){this.pinching=false;this.held=false;}return!!tap;}
 cancel(){this.points.clear();this.pinching=false;this.held=false;}
}
function bindSceneInteractions(canvas,{onInteract,onZoom,onHover=()=>{},onLeave=()=>{},onStrokeStart=()=>{},onStrokeEnd=()=>{},enabled=()=>true}){
 const gesture=new SceneGesture;let timer=null,repeatTimer=null,stroke=false;
 const endStroke=()=>{if(stroke){stroke=false;onStrokeEnd();}};
 const clear=()=>{clearTimeout(timer);clearInterval(repeatTimer);timer=repeatTimer=null;};
 const interact=(point,repeat=false)=>{if(!enabled())return;if(!stroke){stroke=true;onStrokeStart();}onInteract({clientX:point.x,clientY:point.y},{repeat});};
 canvas.addEventListener('pointerdown',e=>{if(!enabled()||(e.pointerType==='mouse'&&e.button!==0))return;gesture.begin(e.pointerId,e.clientX,e.clientY,e.timeStamp);canvas.setPointerCapture(e.pointerId);if(gesture.pinching){clear();endStroke();return;}timer=setTimeout(()=>{const p=gesture.hold();if(p){interact(p);repeatTimer=setInterval(()=>{const q=gesture.hold();if(q)interact(q,true);},130);}},gesture.holdMs);});
 canvas.addEventListener('pointermove',e=>{const result=gesture.move(e.pointerId,e.clientX,e.clientY);if(result){onZoom(result.ratio);return;}onHover(e);if(gesture.held&&!gesture.pinching){const p=gesture.points.get(e.pointerId);if(p)interact(p,true);}});
 canvas.addEventListener('pointerup',e=>{clear();const tap=gesture.end(e.pointerId,e.clientX,e.clientY,e.timeStamp);if(tap)interact({x:e.clientX,y:e.clientY});endStroke();});
 const cancel=()=>{clear();gesture.cancel();endStroke();};canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',e=>{if(gesture.points.has(e.pointerId))cancel();});canvas.addEventListener('pointerleave',onLeave);canvas.addEventListener('contextmenu',e=>e.preventDefault());window.addEventListener('blur',cancel);return{cancel};
}
