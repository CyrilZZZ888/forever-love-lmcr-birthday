// PRISM secret-card effect adapted from SimpleMkt under the MIT license in prism-sound.js.
function revealSecretWish(button) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = button.getBoundingClientRect();
  const base = rect.width * .34;
  const canvas = document.createElement('canvas');
  canvas.className = 'rare-burst';
  canvas.setAttribute('aria-hidden','true');
  const dpr = Math.min(devicePixelRatio, 2);
  const size = Math.ceil(Math.max(1000, rect.width * 2.5));
  canvas.width = canvas.height = size*dpr;
  Object.assign(canvas.style,{width:size+'px',height:size+'px',left:(rect.left+(rect.width-size)/2)+'px',top:(rect.top+(rect.height-size)/2)+'px'});
  document.body.append(canvas);
  const ctx2d = canvas.getContext('2d');
  const rand=(a,b)=>a+(b-a)*Math.random();
  const colors=['#ffd454','#ff66dc','#5ce6ff','#ffffff','#a98cff'];
  const center=size/2;
  let shockRings=['#ff5cd6','#ffd454','#5ce6ff'].map((color,i)=>({
    x:center,y:center,r0:base*.35,r1:base*(2.5+i*.45),
    age:-i*.055,life:.58,color,width:4.5-i*.8
  }));
  const count=matchMedia('(pointer:coarse)').matches ? 34 : 58;
  let sparkParticles=Array.from({length:count},()=>{
    const angle=rand(0,2*Math.PI),speed=rand(180,660);
    return {x:center,y:center,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-rand(20,90),
      gravity:520,age:0,life:rand(.42,.88),scale:rand(.8,1.65),rot:rand(0,2*Math.PI),
      spin:rand(-8,8),color:colors[Math.floor(Math.random()*colors.length)]};
  });
  const stage=document.getElementById('scene');
  stage.animate([{translate:'0 0'},{translate:'-5px 3px'},{translate:'4px -2px'},
    {translate:'-2px 1px'},{translate:'0 0'}],{duration:300});
  const STAR_SPARK_PATH = new Path2D('M0-7 1.4-1.4 7 0 1.4 1.4 0 7-1.4 1.4-7 0-1.4-1.4Z');
  let previous=performance.now();
  function paint(now){
    const dt=Math.min(.05,(now-previous)/1000);
    previous=now;
    ctx2d.resetTransform();
    ctx2d.clearRect(0,0,canvas.width,canvas.height);
  if (shockRings.length) {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    shockRings = shockRings.filter((ring) => {
      ring.age += dt;
      if (ring.age < 0) return true;
      const u = ring.age / ring.life;
      if (u >= 1) return false;
      const ease = 1 - Math.pow(1 - u, 3);
      const r = ring.r0 + (ring.r1 - ring.r0) * ease;
      ctx2d.save();
      ctx2d.globalAlpha = Math.pow(1 - u, 1.6) * 0.9;
      ctx2d.strokeStyle = ring.color;
      ctx2d.lineWidth = Math.max(0.5, ring.width * (1 - u * 0.7));
      ctx2d.beginPath();
      ctx2d.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.restore();

      return true;
    });
  }

  // 2. 四芒星火花粒子
  if (sparkParticles.length) {
    sparkParticles = sparkParticles.filter((sp) => {
      sp.age += dt;
      if (sp.age >= sp.life) return false;
      sp.vy += sp.gravity * dt;
      sp.vx *= 1 - Math.min(0.9, 2.4 * dt);
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.rot += sp.spin * dt;
      const u = sp.age / sp.life;
      const k = dpr * sp.scale * (1 - u * 0.65);
      const cr = Math.cos(sp.rot);
      const sr = Math.sin(sp.rot);
      ctx2d.setTransform(k * cr, k * sr, -k * sr, k * cr, sp.x * dpr, sp.y * dpr);
      ctx2d.globalAlpha = Math.pow(1 - u, 1.25);
      ctx2d.fillStyle = sp.color;
      ctx2d.fill(STAR_SPARK_PATH);
      ctx2d.globalAlpha = 1;

      return true;
    });
  }


    if ((shockRings.length || sparkParticles.length) && button.closest('#deck:not([hidden])')) requestAnimationFrame(paint);
    else canvas.remove();
  }
  requestAnimationFrame(paint);
  const frames=[];
  let flip=0, velocity=0, lift=0, depth=0, vy=-250, vz=540;
  const w=2*Math.PI/.58, pose=2*Math.PI/.55;
  for(let i=0;i<=240;i++){
    if(i%4===0) frames.push({transform:`translate3d(0,${lift}px,${depth}px) rotateY(${flip}deg)`});
    velocity+=(w*w*(180-flip)-2*w*.75*velocity)/240;
    flip+=velocity/240;
    vy+=(-pose*pose*lift-2*pose*.78*vy)/240;
    vz+=(-pose*pose*depth-2*pose*.78*vz)/240;
    lift+=vy/240; depth+=vz/240;
  }
  button.querySelector('.turn').animate(frames,{duration:1000});
}
