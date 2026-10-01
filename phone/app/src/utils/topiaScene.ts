import * as THREE from "three";

const C={
  ink:0x3b4168,cream:0xfff3d6,wall:0xf8e8c8,wood:0xb77952,woodDark:0x76506a,
  coral:0xff8292,blue:0x6c78ff,sky:0x8de1f1,mint:0x69d4a3,yellow:0xffd75e,
  lavender:0xc9c4ff,blanket:0x8995ff,cloud:0xf7fbff,
};

function mat(color:number,roughness=.82){return new THREE.MeshStandardMaterial({color,roughness,metalness:.03,flatShading:true})}
function mesh(geometry:THREE.BufferGeometry,color:number){const value=new THREE.Mesh(geometry,mat(color));value.castShadow=true;value.receiveShadow=true;return value}
function block(w:number,h:number,d:number,color:number,x:number,y:number,z:number){const value=mesh(new THREE.BoxGeometry(w,h,d),color);value.position.set(x,y,z);return value}
function glow(geometry:THREE.BufferGeometry,color:number){return new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.6,roughness:.35,flatShading:true}))}

function cloud(x:number,y:number,z:number,scale:number){
  const group=new THREE.Group();
  [[-.55,0,0,.65],[0,.12,0,.82],[.62,-.03,.03,.56],[.1,-.16,.08,.72]].forEach(([px,py,pz,s])=>{const puff=mesh(new THREE.IcosahedronGeometry(.75,1),C.cloud);puff.position.set(px,py,pz);puff.scale.set(s,s*.72,s);group.add(puff)});
  group.position.set(x,y,z);group.scale.setScalar(scale);return group;
}

function plant(x:number,z:number){
  const group=new THREE.Group(),pot=mesh(new THREE.CylinderGeometry(.28,.22,.35,6),C.coral);pot.position.y=.18;group.add(pot);
  [[-.13,.52,0,-.42],[.13,.57,.03,.38],[0,.69,-.05,.05]].forEach(([px,py,pz,rotation])=>{const leaf=mesh(new THREE.IcosahedronGeometry(.24,1),C.mint);leaf.scale.set(.6,1,.45);leaf.position.set(px,py,pz);leaf.rotation.z=rotation;group.add(leaf)});
  group.position.set(x,.06,z);return group;
}

function crystal(x:number,y:number,z:number,color:number,scale=1){const value=glow(new THREE.OctahedronGeometry(.18*scale,0),color);value.position.set(x,y,z);value.scale.y=1.6;return value}

function floatingRoom(stage:number){
  const room=new THREE.Group();
  const base=mesh(new THREE.CylinderGeometry(3.65,3.35,.42,10),C.woodDark);base.position.y=-.36;base.scale.z=.76;room.add(base);
  room.add(block(6.25,.2,4.35,C.cream,0,-.08,0));
  room.add(block(6.25,3.25,.16,C.wall,0,1.53,-2.12),block(.16,3.25,4.25,C.wall,-3.04,1.53,0));
  room.add(block(6.35,.16,.2,C.wood,0,3.13,-2.03),block(.18,3.3,.22,C.wood,-3.0,1.56,-2.02),block(.18,3.3,.22,C.wood,3.0,1.56,-2.02));

  // A glowing sky window makes the cutaway room feel like a drifting cabin.
  const window=glow(new THREE.PlaneGeometry(2.4,1.35),C.sky);window.position.set(1.05,1.95,-2.025);room.add(window);
  room.add(block(2.62,.1,.08,C.ink,1.05,2.66,-1.97),block(2.62,.1,.08,C.ink,1.05,1.25,-1.97),block(.1,1.5,.08,C.ink,-.28,1.95,-1.97),block(.1,1.5,.08,C.ink,2.38,1.95,-1.97),block(.08,1.42,.07,C.ink,1.05,1.95,-1.92));

  // Bed, blanket and bedside crystal.
  room.add(block(2.2,.38,1.35,C.woodDark,1.7,.18,.86),block(2.05,.25,1.2,C.cream,1.7,.49,.86),block(1.12,.1,1.22,C.blanket,2.12,.67,.86),block(.55,.16,.78,C.lavender,.98,.66,.86));
  room.add(block(.48,.45,.48,C.wood,.3,.22,1.3),crystal(.3,.72,1.3,C.yellow,1.15));

  // Star-map desk and shelves.
  room.add(block(1.85,.16,.82,C.wood,-1.42,1.02,-1.45));
  [-2.18,-.66].forEach(x=>room.add(block(.13,.93,.13,C.woodDark,x,.5,-1.66),block(.13,.93,.13,C.woodDark,x,.5,-1.23)));
  const map=glow(new THREE.CircleGeometry(.55,6),C.blue);map.rotation.x=-Math.PI/2;map.position.set(-1.42,1.12,-1.44);room.add(map);
  room.add(crystal(-2.12,1.33,-1.42,C.coral,.8),crystal(-.76,1.29,-1.42,C.sky,.72));
  room.add(block(.72,.1,.48,C.woodDark,-1.43,.52,-.45),block(.1,.52,.1,C.wood,-1.7,.25,-.6),block(.1,.52,.1,C.wood,-1.16,.25,-.6));

  // Left-wall library and window garden.
  room.add(block(.35,2.25,1.35,C.wood,-2.78,1.25,-.88));
  [-.35,.25,.85].forEach(y=>room.add(block(.42,.09,1.24,C.woodDark,-2.57,1.03+y,-.88)));
  [C.coral,C.blue,C.yellow,C.mint].forEach((color,index)=>room.add(block(.19,.42,.22,color,-2.53,.43+(index%2)*.62,-1.28+index*.29)));
  room.add(plant(-2.55,.82),plant(2.55,-1.42));

  // Hearth, rug, lantern and small magical details.
  room.add(block(1.05,.95,.48,C.woodDark,-2.35,.47,1.62),block(.65,.57,.05,C.ink,-2.35,.43,1.37));
  const fire=glow(new THREE.ConeGeometry(.23,.5,5),C.yellow);fire.position.set(-2.35,.42,1.33);room.add(fire);
  const rug=mesh(new THREE.CircleGeometry(1.15,12),C.lavender);rug.rotation.x=-Math.PI/2;rug.position.set(-.35,.035,.45);rug.scale.z=.72;room.add(rug);
  room.add(block(.08,1.15,.08,C.woodDark,-.2,2.74,-.3));const lantern=glow(new THREE.IcosahedronGeometry(.28,1),C.yellow);lantern.position.set(-.2,2.16,-.3);room.add(lantern);const lampLight=new THREE.PointLight(0xffd978,2.6,5);lampLight.position.copy(lantern.position);room.add(lampLight);

  // Airship hardware mounted outside the room.
  room.add(block(.14,2.25,.14,C.woodDark,2.72,1.03,1.73),block(1.18,.1,.1,C.wood,2.18,1.92,1.73));
  const pennant=mesh(new THREE.ConeGeometry(.44,1.05,3),C.coral);pennant.rotation.z=Math.PI/2;pennant.position.set(1.68,1.91,1.73);room.add(pennant);
  const hub=mesh(new THREE.CylinderGeometry(.25,.25,.36,8),C.yellow);hub.rotation.z=Math.PI/2;hub.position.set(3.3,.68,.3);room.add(hub);
  [0,Math.PI/2].forEach(rotation=>{const blade=block(.12,1.35,.25,C.blue,3.5,.68,.3);blade.rotation.x=rotation;room.add(blade)});

  for(let index=0;index<stage*4;index++){const color=index%3===0?C.coral:index%2?C.sky:C.yellow;room.add(crystal(-2.6+(index*1.37)%5.2,.2+(index%3)*.3,-1.7+(index*.83)%3.2,color,.45));}
  room.add(cloud(-3.4,-1.0,-1.1,.85),cloud(3.4,-1.15,.5,.72),cloud(.5,-1.35,2.2,.65));
  return room;
}

export function mountTopiaScene(canvas:HTMLCanvasElement){
  const container=canvas.parentElement;if(!container)return()=>undefined;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:"high-performance"})}catch{return()=>undefined}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0xd9efff,.018);
  const camera=new THREE.OrthographicCamera(-5,5,3,-3,.1,100);
  scene.add(new THREE.HemisphereLight(0xf8fbff,0x8aa57d,3.2));const sun=new THREE.DirectionalLight(0xfff0c5,4);sun.position.set(-5,9,6);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
  const stage=Number([...container.classList].find(value=>value.startsWith("stage-"))?.slice(6)??1),world=floatingRoom(stage);scene.add(world);
  const sparkleGeometry=new THREE.BufferGeometry(),sparklePositions=new Float32Array(42*3);
  for(let index=0;index<42;index++){const angle=index*2.39996,radius=3.7+(index%7)*.38;sparklePositions[index*3]=Math.cos(angle)*radius;sparklePositions[index*3+1]=-.4+(index%9)*.56;sparklePositions[index*3+2]=Math.sin(angle)*radius;}
  sparkleGeometry.setAttribute("position",new THREE.BufferAttribute(sparklePositions,3));
  const sparkles=new THREE.Points(sparkleGeometry,new THREE.PointsMaterial({color:0xffef9a,size:.075,transparent:true,opacity:.78,depthWrite:false,blending:THREE.AdditiveBlending}));scene.add(sparkles);
  const driftingClouds=new THREE.Group();driftingClouds.add(cloud(-4.7,-1.1,-2.8,.62),cloud(4.5,-.75,-1.8,.5),cloud(.6,3.8,-4.3,.42));
  driftingClouds.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=false;object.receiveShadow=false;const material=object.material as THREE.MeshStandardMaterial;material.transparent=true;material.opacity=.34;material.depthWrite=false;}});scene.add(driftingClouds);
  const ambientGlow=new THREE.PointLight(0x8de1f1,1.1,11);ambientGlow.position.set(0,2.2,1.5);scene.add(ambientGlow);
  container.classList.add("webgl-ready");
  let frame=0,disposed=false,targetYaw=.68,currentYaw=.68,targetPitch=.55,currentPitch=.55;
  const pointers=new Map<number,{x:number;y:number}>();let lastX=0,lastY=0,pinchDistance=0,pinchZoom=1;
  const resize=()=>{const width=container.clientWidth,height=container.clientHeight;renderer.setSize(width,height,false);const aspect=width/Math.max(1,height),view=4.05;camera.left=-view*aspect;camera.right=view*aspect;camera.top=view;camera.bottom=-view;camera.updateProjectionMatrix()};const observer=new ResizeObserver(resize);observer.observe(container);resize();
  const distance=()=>{const values=[...pointers.values()];return values.length<2?0:Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y)};
  const down=(event:PointerEvent)=>{pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);if(pointers.size===1){lastX=event.clientX;lastY=event.clientY}else if(pointers.size===2){pinchDistance=distance();pinchZoom=camera.zoom}};
  const move=(event:PointerEvent)=>{const previous=pointers.get(event.pointerId);if(!previous)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size===1){targetYaw-=(event.clientX-lastX)*.008;targetPitch=THREE.MathUtils.clamp(targetPitch+(event.clientY-lastY)*.006,.18,1.08);lastX=event.clientX;lastY=event.clientY}else if(pointers.size===2&&pinchDistance>0){camera.zoom=THREE.MathUtils.clamp(pinchZoom*distance()/pinchDistance,.78,1.65);camera.updateProjectionMatrix()}};
  const up=(event:PointerEvent)=>{pointers.delete(event.pointerId);if(pointers.size===1){const remaining=[...pointers.values()][0];lastX=remaining.x;lastY=remaining.y}};
  const wheel=(event:WheelEvent)=>{event.preventDefault();camera.zoom=THREE.MathUtils.clamp(camera.zoom-event.deltaY*.0008,.78,1.65);camera.updateProjectionMatrix()};
  canvas.addEventListener("pointerdown",down);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",up);canvas.addEventListener("pointercancel",up);canvas.addEventListener("wheel",wheel,{passive:false});
  const animate=()=>{if(disposed)return;const now=performance.now();currentYaw+=(targetYaw-currentYaw)*.09;currentPitch+=(targetPitch-currentPitch)*.09;const radius=9.5,flat=radius*Math.cos(currentPitch);camera.position.set(Math.sin(currentYaw)*flat,1+Math.sin(currentPitch)*radius,Math.cos(currentYaw)*flat);camera.lookAt(0,1,0);world.position.y=Math.sin(now*.00055)*.05;sparkles.rotation.y=now*.000045;sparkles.position.y=Math.sin(now*.0007)*.08;driftingClouds.position.x=Math.sin(now*.00012)*.65;driftingClouds.position.y=Math.cos(now*.0002)*.08;ambientGlow.intensity=1.05+Math.sin(now*.0011)*.24;renderer.render(scene,camera);frame=requestAnimationFrame(animate)};animate();
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener("pointerdown",down);canvas.removeEventListener("pointermove",move);canvas.removeEventListener("pointerup",up);canvas.removeEventListener("pointercancel",up);canvas.removeEventListener("wheel",wheel);scene.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Points){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(value=>value.dispose())}});renderer.dispose();container.classList.remove("webgl-ready")};
}
