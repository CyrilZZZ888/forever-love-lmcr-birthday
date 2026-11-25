(() => {
  'use strict';
  const {Session,clamp}=window.GachaCore;
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const mix=(a,b,t)=>a+(b-a)*t;
  const $=id=>document.getElementById(id);
  const pedestalPosition=[-1.58,0,-2.4];
  const compactPack=document.documentElement.hasAttribute('data-ripple-floor');
  const worldPackScale=compactPack?1/3:1;
  const CONFIG={anchor:[2.5,compactPack?2.62:1.65,-2.5],reach:1.15,skyLook:true};
  // Horizontal footprints enclose the platter and the gently rotating foil pack.
  const tableObstacle={center:pedestalPosition,halfLength:0,radius:1.01};
  CONFIG.obstacles=[
    ...(compactPack?[]:[tableObstacle]),
    {center:CONFIG.anchor,halfLength:.72*worldPackScale,radius:.17*worldPackScale}
  ];
  function create({gl,canvas,math:M,host}) {
    const session=new Session();
    let phase='idle',flightTime=0,sourcePose=null;
    let mode='A',saved=null,returning=false,focus=0,clock=0,lastState='',lastPercent=-1,entryFocus=null;
    let lastVP=null,lastModel=null,tearRect=null,closed=false;
    const stats={opens:0,closes:0,replays:0,draws:0};
    const candle={lit:true,level:1,ember:0};
    let cakeVisible=!compactPack;
    function atCandle(){
      const distance=Math.hypot(host.person.x-pedestalPosition[0],host.person.z-pedestalPosition[2]);
      return !compactPack && cakeVisible && stats.cakeReady && host.ready() && !locked() && !finale && distance<=2.35 &&
        distance<Math.hypot(host.person.x-CONFIG.anchor[0],host.person.z-CONFIG.anchor[2]);
    }
    function interact(){
      if(!atCandle())return open();
      candle.lit=!candle.lit;
      if(!candle.lit)candle.ember=candle.level;
      announce(candle.lit?'烛火重新点亮':'烛火已吹灭');
    }
    const vertex=`#version 300 es
      layout(location=0) in vec3 aPosition;layout(location=1) in vec2 aUv;
      layout(location=2) in vec3 aNormal;out vec3 vNormal;
      uniform vec4 uCake;out vec3 localPos;uniform mat4 uModel,uVP;out vec2 vUv;out vec3 vP;
      void main(){localPos=aPosition;
        vec3 pos=aPosition;
        if(uCake.x>.5 && pos.y>.56){
          vec3 wick=vec3(-.009,.56,-.015);
          pos=wick+(pos-wick)*uCake.y;
          pos.x+=uCake.z*smoothstep(.56,.65,aPosition.y);
        }
        vec4 p=uModel*vec4(pos,1.);vUv=aUv;vNormal=mat3(uModel)*aNormal;vP=p.xyz;gl_Position=uVP*p;}`;
    const fragment=`#version 300 es
      precision highp float;uniform vec4 uCake;in vec3 localPos;in vec3 vNormal;in vec2 vUv;in vec3 vP;out vec4 outColor;
      uniform sampler2D uMap;uniform vec4 uColor;uniform float uFoil,uTime,uUnlit;uniform vec3 uEye;
      void main(){
        vec4 tex=texture(uMap,vUv);vec3 n=normalize(cross(dFdx(vP),dFdy(vP)));if(length(vNormal)>.001)n=normalize(vNormal);else if(!gl_FrontFacing)n=-n;
        vec3 eye=normalize(uEye-vP);float light=.75+.25*abs(dot(n,normalize(vec3(-.5,.8,1.))));
        vec3 c=tex.rgb*uColor.rgb*mix(light,1.,uUnlit);
        if(uCake.x>.5){
          if(localPos.y>.56 && uCake.y<.003)discard;
          float flame=smoothstep(.559,.577,localPos.y);
          float pool=exp(-8.*distance(localPos,vec3(-.009,.568,-.015)));
          c+=vec3(.42,.20,.045)*pool*uCake.y;
          c=mix(c,vec3(1.,.69,.23)+vec3(0.,.22,.35)*flame,flame);
          c+=vec3(.68,.12,.015)*exp(-170.*distance(localPos,vec3(-.009,.556,-.015)))*uCake.w;
        }
        float sheen=pow(max(0.,1.-abs(vUv.x*.8+vUv.y*.25-.5-dot(eye,vec3(.8,.2,0.))*.38)),20.);
        c+=uFoil*sheen*vec3(.22,.3,.4);outColor=vec4(c,tex.a*uColor.a);
      }`;
    function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
    const program=gl.createProgram();const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const U={};for(const name of ['Model','VP','Map','Color','Foil','Time','Unlit','Eye','Cake'])U[name]=gl.getUniformLocation(program,'u'+name);
    const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,20,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,20,12);
    function texture(source){const t=gl.createTexture();upload(t,source);return t;}
    function upload(t,source){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
    function artCanvas(w=768,h=1024){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
    const packTex=texture(artCanvas()), sealTex=texture(artCanvas());
    const whiteCanvas=artCanvas(2,2);whiteCanvas.getContext('2d').fillStyle='#fff';whiteCanvas.getContext('2d').fillRect(0,0,2,2);const white=texture(whiteCanvas);
    let artReady=false;
    const photo=new Image();
    photo.onload=()=>{
      for(const [tex,y,height] of [[packTex,126,1280],[sealTex,35,88]]){
        const crop=artCanvas(768,tex===packTex?1024:90);
        crop.getContext('2d').drawImage(photo,76,y,872,height,0,0,crop.width,crop.height);
        upload(tex,crop);
      }
      artReady=true;
    };
    photo.src=window.birthdayTextures.black;
    const deck=$('deck');
    const revealSound=window.createPrismSound();
    let collected=false;
    try{collected=!compactPack && sessionStorage.getItem('birthday.collected')==='yes';}catch{}
    function flipRemaining(){for(const b of cards)if(!b.classList.contains('flipped'))b.click();}
    function allRevealed(){return cards.every(card=>card.classList.contains('flipped'));}
    function accept(){
      if(session.state!=='result'||!allRevealed())return;
      const firstCollection=!collected;
      collected=true;
      try{sessionStorage.setItem('birthday.collected','yes');}catch{}
      close();
      if(firstCollection)launchFireworks(true);
    }
    const faces=[
      ['天天开心','爱爱','card-08-happy-candy-light-red.png'],
      ['超级仙仙','美美','card-09-fairy-watercolor.png'],
      ['次饭香香','乖乖','card-10-hotpot-watercolor-v3.png'],
      ['平安健康','亲亲','card-11-apple-watercolor.png']
    ];
    function tilt(area,x,y) {
      area.style.setProperty('--pitch', -12*y+'deg');
      area.style.setProperty('--yaw', 16*x+'deg');
      area.style.setProperty('--shine-x', 50+45*x+'%');
      area.style.setProperty('--shine-y', 50+45*y+'%');
    }
    function track(area) {
      function move(e) {
        const r=area.getBoundingClientRect();
        tilt(area,2*clamp((e.clientX-r.left)/r.width)-1,2*clamp((e.clientY-r.top)/r.height)-1);
      }
      area.addEventListener('pointerdown',move);
      area.addEventListener('pointermove',move);
      for(const event of ['pointerleave','pointercancel','pointerup']) area.addEventListener(event,()=>tilt(area,0,0));
    }
    const cards=faces.map(([name,nickname,file],i)=>{
      const button=document.createElement('button');
      button.className='wish-card';
      button.innerHTML='<span class="holo-surface"><span class="turn"><span class="back" aria-hidden="true"></span><img class="front" alt=""><i class="foil-light"></i></span></span>';
      const img=button.querySelector('img');
      img.src='design-samples/romance-birthday-v1/'+file;
      track(button);
      button.onclick=()=>{
        if(session.state!=='result')return;
        if(button.disabled)return;
        button.disabled=true;
        button.classList.add('flipped');
        revealSecretWish(button);
        const heart=document.createElement('span');
        heart.className='title-heart';
        heart.textContent='❤';
        $('session-title').replaceChildren('祝我的'+nickname+'宝贝',heart,name+'~');
        revealSound.call('cardFlip','secret',i);
        button.setAttribute('aria-label',name+'，已翻开');
        announce(name);
      };
      deck.append(button);
      return button;
    });
    function resetCards(){cards.forEach((b,i)=>{b.disabled=false;b.classList.remove('flipped');b.setAttribute('aria-label','翻开第 '+(i+1)+' 张卡');});}
    function quad(a,b,c,d,uv=[[0,0],[1,0],[1,1],[0,1]]){return [a,b,c,a,c,d].flatMap((p,i)=>[...p,...uv[[0,1,2,0,2,3][i]]]);}
    function mesh(data,model,vp,tex=white,color=[1,1,1,1],foil=0,unlit=0,eye=host.camera.eye){
      gl.useProgram(program);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
      gl.uniformMatrix4fv(U.Model,false,model);gl.uniformMatrix4fv(U.VP,false,vp);gl.uniform4fv(U.Color,color);gl.uniform1f(U.Foil,foil);gl.uniform1f(U.Unlit,unlit);gl.uniform1f(U.Time,clock);gl.uniform3fv(U.Eye,eye);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(U.Map,0);gl.drawArrays(gl.TRIANGLES,0,data.length/5);
    }
    // The cake and its turned pedestal use static GPU buffers in world space.
    const pedestalModel=M.translation(...pedestalPosition);
    const displayHeight=compactPack?1.42:1.04;
    const cakeModel=M.compose(pedestalModel,M.translation(0,displayHeight,0),M.scaling(1.36,1.36,1.36));
    function staticPart(vertices,indices,model,tex,tint,hasNormals=false){
      const part=gl.createVertexArray();
      gl.bindVertexArray(part);
      gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
      const stride=hasNormals?32:20;
      if(hasNormals){gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,stride,20);}
      gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
      gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,stride,12);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
      return vp=>{
        gl.useProgram(program);gl.bindVertexArray(part);
        if(hasNormals){
          const flutter=Math.sin(clock*7.3)*.6+Math.sin(clock*11.7)*.4;
          const bend=candle.level*(.009*flutter+(candle.lit?0:.13*(1-candle.level)));
          gl.uniform4f(U.Cake,1,candle.level*(1+.035*flutter),bend,candle.ember);
        }
        gl.uniformMatrix4fv(U.Model,false,model);gl.uniformMatrix4fv(U.VP,false,vp);
        gl.uniform4fv(U.Color,tint);gl.uniform1f(U.Foil,0);gl.uniform1f(U.Unlit,0);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(U.Map,0);
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_INT,0);
        if(hasNormals)gl.uniform4f(U.Cake,0,0,0,0);
      };
    }
    function turnedPart(profile,tint,fluting=0){
      const vertices=[],indices=[],sides=120;
      profile.forEach(([radius,y],row)=>{
        for(let k=0;k<=sides;k++){
          const angle=2*Math.PI*k/sides,r=radius*(1+fluting*Math.cos(24*angle));
          vertices.push(r*Math.cos(angle),y,r*Math.sin(angle),k/sides,row/(profile.length-1));
          if(row && k){const a=vertices.length/5-1,b=a-sides-1;indices.push(b-1,a-1,a,b-1,a,b);}
        }
      });
      return staticPart(new Float32Array(vertices),new Uint32Array(indices),pedestalModel,white,tint);
    }
    const brass=[.88,.69,.42,1],porcelain=[.98,.86,.81,1];
    const cakeDisplay=[
      turnedPart([[.54,.01],[.57,.04],[.55,.08],[.47,.1]],brass),
      turnedPart([[.49,.08],[.49,.13],[.34,.19],[.22,.26],[.18,.34],[.21,.69],[.29,.78],[.36,.82]],porcelain,.036),
      turnedPart([[.197,.32],[.207,.34],[.196,.36]],brass),
      turnedPart([[.32,.79],[.52,.84],[.87,.88],[.99,.94],[1,.99],[.98,1.04],[0,1.04]],porcelain),
      turnedPart([[.985,.93],[1.002,.95],[1.005,.965],[.997,.977]],brass)
    ];
    async function unpackCake(encoded){
      const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    }
    const cakePhoto=new Image();
    cakePhoto.src=location.protocol==='file:' ? window.birthdayCakePhoto : 'cake-basecolor.jpg';
    Promise.all([cakePhoto.decode(),...window.birthdayCakeMesh.map(unpackCake)]).then(([,vertices,indices])=>{
      cakeDisplay.push(staticPart(new Float32Array(vertices),new Uint32Array(indices),cakeModel,texture(cakePhoto),[1,1,1,1],true));
      stats.cakeReady=true;
    });
    const edge=x=>.86+(Math.round((x+.72)/1.44*64)%2)*.014;
    function packageGeometry(progress){const out=[],nx=64,ny=14,opened=session.state==='opening'||session.state==='result';
      const point=(u,v,side)=>{const x=(u-.5)*1.44,tooth=(Math.round(u*64)%2)*.014;
        // Keep printed artwork smooth: serration only affects the two welded rims.
        const y=mix(-1.04,.86,v)+tooth*(smooth((v-.92)/.08)+1-smooth(v/.08));const bow=Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*.075;
        const open=opened?smooth(session.elapsed*2)*.10:0;
        const torn = progress ? smooth((u - (1-progress) + .045) / .045) : 0;
        return [x,y + tearSeam(u)*torn*smooth((v-.88)/.12),side*(.055+bow+open*v*v)+Math.sin(u*22)*.006*Math.sin(v*Math.PI)];};
      for(const side of [-1,1])for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const u=x/nx,v=y/ny,du=1/nx,dv=1/ny;out.push(...quad(point(u,v,side),point(u+du,v,side),point(u+du,v+dv,side),point(u,v+dv,side),[[u,v],[u+du,v],[u+du,v+dv],[u,v+dv]]));}
      return out;}
    let audio, foilNoise;
    let lastTear = 0, flex = 0, flexSpeed = 0;

    function enablePackAudio() {
      const Engine = window.AudioContext || window.webkitAudioContext;
      if (!Engine) return;
      if (!audio) {
        audio = window.sceneMusic?.context || new Engine();
        foilNoise = audio.createBuffer(1, Math.ceil(audio.sampleRate * .14), audio.sampleRate);
        const samples = foilNoise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    }

    function playFireworkBurst(count) {
      if (audio?.state !== 'running' || document.hidden) return;
      const now = audio.currentTime;
      const level = Math.min(.32, .16 + .025 * count);
      const crack = audio.createBufferSource();
      crack.buffer = foilNoise;
      const filter = audio.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(4400, now);
      filter.frequency.exponentialRampToValueAtTime(450, now + .13);
      const snap = audio.createGain();
      snap.gain.setValueAtTime(level, now);
      snap.gain.exponentialRampToValueAtTime(.001, now + .14);
      crack.connect(filter).connect(snap).connect(audio.destination);
      crack.start(now);

      const boom = audio.createOscillator();
      const tail = audio.createGain();
      boom.frequency.setValueAtTime(105 + Math.random() * 35, now);
      boom.frequency.exponentialRampToValueAtTime(45, now + .42);
      tail.gain.setValueAtTime(.001, now);
      tail.gain.exponentialRampToValueAtTime(level * .7, now + .009);
      tail.gain.exponentialRampToValueAtTime(.001, now + .48);
      boom.connect(tail).connect(audio.destination);
      boom.start(now);
      boom.stop(now + .48);
    }

    function updateSeal(dt) {
      const delta = session.progress - lastTear;
      lastTear = session.progress;
      if (!session.active || session.state === 'result') { flex = flexSpeed = 0; return; }
      const speed = clamp(delta / Math.max(.001, dt));
      const advancing = Math.max(0, delta);
      const snapped = advancing > 0 && session.state === 'opening';
      revealSound.call('setRip', snapped ? 0 : Math.pow(advancing / Math.max(dt,.004) / 4,.6));
      if (snapped) revealSound.call('burst',false);
      if (advancing && !quietTear.matches) emitTipFlecks(session.progress - advancing, advancing);
      while (flecks.length && clock - flecks[0].born > .44) flecks.shift();
      // Substeps keep the loose end stable on slower displays.
      let remaining = Math.min(.08, dt);
      while (remaining > 0) {
        const step = Math.min(1 / 120, remaining);
        flexSpeed += ((speed - flex) * 360 - flexSpeed * 16) * step;
        flex += flexSpeed * step;
        remaining -= step;
      }
    }

    const quietTear = matchMedia('(prefers-reduced-motion: reduce)');
    let grabY = 0, pullLift = 0;
    const naturalEdge = new Float32Array(65), handEdge = new Float32Array(65);
    let fleckCarry = 0, previousY = 0, previousX = 0, steer = 0;
    const flecks = [], heartSites = [];
    function resetTear() {
      const slope = (Math.random()-.5)*.12, phase = Math.random()*Math.PI*2;
      let drift = 0;
      for (let i=0;i<=64;i++) {
        const u = i/64;
        drift = Math.max(-.024,Math.min(.024,drift+(Math.random()-.5)*.014));
        naturalEdge[i] = slope*(u-.5)+.022*Math.sin(5*u+phase)+drift+(Math.random()-.5)*.021;
      }
      handEdge.fill(0);
      flecks.length = heartSites.length = 0;
      fleckCarry = steer = pullLift = lastTear = 0;
      for (let i=0;i<20;i++) heartSites.push({u:(i+.2+Math.random()*.6)/20,
        start:null, period:.85+Math.random()*.7, size:.034+Math.random()*.028});
    }
    function tearSeam(u) {
      const at=clamp(u)*64, i=Math.min(63,Math.floor(at));
      return mix(naturalEdge[i]+handEdge[i],naturalEdge[i+1]+handEdge[i+1],at-i);
    }
    function steerUnopened(seamProgress, dx, dy) {
      const pivot = Math.ceil((1-seamProgress)*64);
      const slope = Math.max(-1,Math.min(1,-dy/Math.max(3,Math.abs(dx))));
      steer += (slope-steer)*.4;
      for (let i=pivot-1;i>=0;i--)
        handEdge[i]=Math.max(-.18,Math.min(.14,handEdge[pivot]+steer*(pivot-i)/64*1.44));
    }
    function emitTipFlecks(start, advance) {
      fleckCarry += advance*46;
      const count = Math.min(8,Math.floor(fleckCarry));
      fleckCarry -= count;
      for(let i=0;i<count;i++) {
        const u=1-start-advance*(i+.5)/count;
        flecks.push({x:(u-.5)*1.44,y:.87+tearSeam(u),born:clock,
          vx:(Math.random()-.55)*.9,vy:.35+Math.random()*.72,life:.18+Math.random()*.25});
      }
    }
    const heartStamp=document.createElement('canvas');
    heartStamp.width=heartStamp.height=96;
    const heartPen=heartStamp.getContext('2d');
    heartPen.shadowColor='#ff78b9';heartPen.shadowBlur=8;heartPen.fillStyle='#fff1fa';
    heartPen.beginPath();heartPen.moveTo(48,81);
    heartPen.bezierCurveTo(38,69,10,53,10,32);heartPen.bezierCurveTo(10,10,38,8,48,26);
    heartPen.bezierCurveTo(60,7,86,11,86,32);heartPen.bezierCurveTo(86,51,60,68,48,81);heartPen.fill();
    const heartTexture=texture(heartStamp);
    function drawHearts(progress,model,vp,eye) {
      const batches=[[],[],[]];
      heartSites.forEach((site,i)=>{
        if(site.u < 1-progress) return;
        if(site.start===null) site.start=clock;
        const age=(clock-site.start)/site.period,t=age%1;
        const size=site.size*Math.sin(Math.PI*t)**.6;
        const x=(site.u-.5)*1.44 + .025*Math.sin(t*4+i)*t;
        const y=edge((site.u-.5)*1.44)+tearSeam(site.u)-.032+t*(.26+.08*(i%3));
        // Start just behind the front foil so its actual rim masks each rising heart.
        batches[i%3].push(...quad([x-size,y-size,.025],[x+size,y-size,.025],
          [x+size,y+size,.025],[x-size,y+size,.025]));
      });
      const tints=[[1,.52,.72,.92],[1,.81,.65,.88],[.87,.68,1,.90]];
      batches.forEach((batch,i)=>{if(batch.length)mesh(batch,model,vp,heartTexture,tints[i],0,1,eye);});
    }
    function stripGeometry(progress) {
      const vertices = [], tip = 1 - progress;
      const point = (u, v) => {
        const free = Math.max(0, u - tip);
        const bend = smooth(free / .23);
        const fold = bend * (1.68 + .32 * flex + pullLift);
        const x = (u - .5) * 1.44 - free * (1 - Math.cos(fold)) * 1.44;
        const y = edge((u - .5) * 1.44) + tearSeam(u) * (progress ? smooth((u-tip+.045)/.045) : 0) * (1 - v)
          + v * .19 + free * Math.sin(fold) * .58 + bend * .048 * Math.sin(u * 19);
        return [x, y, .06 + free * Math.sin(fold) * .45 + v * .035 * bend];
      };
      for (let i = 0; i < 64; i++) {
        const u = i / 64, next = (i + 1) / 64;
        vertices.push(...quad(point(u,0), point(next,0), point(next,1), point(u,1),
          [[u,0],[next,0],[next,1],[u,1]]));
      }
      return vertices;
    }

    // The light follows the same 3D seam as the silver strip, including camera motion.
    function drawTearLight(progress, elapsed, opened, model, base, vp, eye) {
      if (!progress || quietTear.matches || (opened && elapsed > .85)) return;
      const tip = .72 - 1.44 * progress;
      const light = [], sparks = [];
      const fade = opened ? Math.max(0, 1 - elapsed / .85) : 1;
      const color = [.84,.84,.83,fade * .67];
      if (!opened) {
        for (let i = 0; i < 64; i++) {
          const a = Math.max(tip, i / 64 * 1.44 - .72), b = (i+1)/64*1.44-.72;
          if (a >= b) continue;
          const ya = edge(a)+tearSeam(a/1.44+.5), yb = edge(b)+tearSeam(b/1.44+.5);
          light.push(...quad([a,ya-.006,.066],[b,yb-.006,.066],[b,yb+.004,.066],[a,ya+.004,.066]));
        }
      }
      if (!opened) for (const flake of flecks) {
        const age=clock-flake.born;
        if(age>=flake.life) continue;
        const x=flake.x+flake.vx*age,y=flake.y+flake.vy*age-1.6*age*age;
        const r=.014*(1-age/flake.life);
        sparks.push(...quad([x-r,y,.16],[x,y-r*1.7,.16],[x+r,y,.16],[x,y+r*1.7,.16]));
      }
      const count = opened ? 42 : 0;
      for (let i=0; i<count; i++) {
        const angle = i * 2.39996, seed = (i * .618034) % 1;
        const t = opened ? elapsed : (clock * 2.3 + seed) % 1;
        const radius = opened ? t * (1.2 + seed * 2.6) : t * (.07 + .19 * flex);
        const x = (opened ? 0 : tip) + Math.cos(angle) * radius;
        const y = .875 + Math.sin(angle)*radius + (opened ? -.98*t*t : t*.10);
        const size = (opened ? .012 + seed*.012 : .012*flex) * (1-t);
        sparks.push(...quad([x-size,y,.14],[x,y-size*2,.14],[x+size,y,.14],[x,y+size*2,.14]));
      }
      gl.depthMask(false);
      if (!opened) drawHearts(progress,model,vp,eye);
      if (light.length) mesh(light,model,vp,white,color,0,1,eye);
      mesh(sparks,opened ? base : model,vp,white,[1,.88,.73,fade],0,1,eye);
      if (opened) for (let n=0; n<2; n++) {
        const t=(elapsed-n*.05)/.52;
        if (t<=0 || t>=1) continue;
        const ring=[], r=.12+(1-Math.pow(1-t,3))*(1.2+n*.25);
        const point=(a,w)=>[Math.cos(a)*w,.86+Math.sin(a)*w*.55,.12];
        for(let i=0;i<60;i++){
          const a=i*Math.PI/30,b=(i+1)*Math.PI/30;
          ring.push(...quad(point(a,r),point(b,r),point(b,r+.012),point(a,r+.012)));
        }
        mesh(ring,base,vp,white,[.76+n*.24,.88-n*.16,1,.64*(1-t)*(1-t)],0,1,eye);
      }
      gl.depthMask(true);
    }
    function project(p,model,vp){const mat=M.multiply(vp,model),v=[...p,1],out=[0,0,0,0];for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[r]+=mat[k*4+r]*v[k];if(out[3]<=0)return null;return [(out[0]/out[3]*.5+.5)*canvas.clientWidth,(.5-out[1]/out[3]*.5)*canvas.clientHeight];}
    function positionTear(){if(!lastVP||!lastModel||!['ready','tearing'].includes(session.state)||focus<.9)return;
      const points=[[-.78,.79,.2],[.78,1.14,.2]].map(p=>project(p,lastModel,lastVP));if(points.some(p=>!p))return;
      const [a,b]=points,left=Math.min(a[0],b[0]),top=Math.min(a[1],b[1]);tearRect={left,top,width:Math.abs(a[0]-b[0]),height:Math.max(48,Math.abs(a[1]-b[1]))};
      Object.assign($('tear-zone').style,{left:left+'px',top:top+'px',width:tearRect.width+'px',height:tearRect.height+'px'});
    }
    function announce(text){$('announcement').textContent=text;}
    function near(){return Math.hypot(host.person.x-CONFIG.anchor[0],host.person.z-CONFIG.anchor[2])<=CONFIG.reach;}
    function locked(){return session.active||returning;}
    let fireworks=[];
    const meteors=[];
    let meteorWait=1+Math.random()*2;
    const quietSky=matchMedia('(prefers-reduced-motion: reduce)');
    function updateMeteor(dt){
      if(phase!=='idle'||finale||quietSky.matches){
        if(meteors.length){meteors.length=0;meteorWait=1+Math.random()*2;}
        return;
      }
      if(meteors.length){
        const current=meteors[0];
        current.age+=dt;
        if(current.age>=current.life){
          meteors.pop();
          meteorWait=1+Math.random()*2;
        }
        return;
      }
      meteorWait-=dt;
      if(meteorWait>0)return;
      const heading=Math.random()*Math.PI*2;
      const tilt=.32+Math.random()*1.22;
      meteors.push({age:0,life:7+Math.random()*2,origin:[...host.camera.eye],
        dx:Math.sin(heading),dz:Math.cos(heading),rise:Math.sin(tilt),
        bend:Math.cos(tilt)*(Math.random()<.5?-1:1),radius:65+Math.random()*15});
    }
    function meteorPosition(m,t){
      const angle=Math.PI*t/m.life;
      const along=m.radius*Math.cos(angle),across=m.radius*Math.sin(angle);
      return [m.origin[0]+m.dx*along+m.dz*m.bend*across,m.origin[1]+m.rise*across,
        m.origin[2]+m.dz*along-m.dx*m.bend*across];
    }
    function drawMeteor(data){
      for(const m of meteors){
        const glow=Math.min(1,m.age*4,(m.life-m.age)*4);
        for(let i=0;i<88;i++){
          const t=m.age-i*.008;
          if(t<0)break;
          const strength=1-i/88;
          data.push(...meteorPosition(m,t),.72,.85,1,glow*strength*strength,i===0?.62:.10+.27*strength);
        }
      }
    }
    const dustProgram=gl.createProgram();
    gl.attachShader(dustProgram,shader(gl.VERTEX_SHADER,`#version 300 es
      layout(location=0) in vec3 pos; layout(location=1) in vec4 tint;
      layout(location=2) in float size;
      uniform mat4 vp; uniform vec3 origin; uniform float pixelScale;
      uniform int trailCount;
      uniform vec3 heads[8], tails[8];
      out vec4 ink;
      void main(){gl_Position=vp*vec4(origin+pos,1.);gl_PointSize=max(1.,size*pixelScale/gl_Position.w);ink=tint;
        vec3 dir=normalize(pos);
        for(int i=0;i<trailCount;i++){
          vec3 a=normalize(heads[i]-origin),b=normalize(tails[i]-origin);
          vec3 ab=b-a;
          float t=clamp(dot(dir-a,ab)/max(dot(ab,ab),.000001),0.,1.);
          float d=distance(dir,normalize(a+t*ab));
          ink.a*=mix(1.,.3+.7*smoothstep(.015,.085,d),1.-smoothstep(.55,1.,t));
        }
      }`));
    gl.attachShader(dustProgram,shader(gl.FRAGMENT_SHADER,`#version 300 es
      precision mediump float; in vec4 ink; out vec4 frag;
      void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;
        float core=exp(-18.*r);frag=vec4(mix(ink.rgb,vec3(1.),core*.7),ink.a*(core+.55*exp(-4.*r)));}
    `));
    gl.linkProgram(dustProgram);
    if(!gl.getProgramParameter(dustProgram,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(dustProgram));
    const dustUniform=Object.fromEntries(['vp','origin','pixelScale','trailCount','heads[0]','tails[0]'].map(n=>[n,gl.getUniformLocation(dustProgram,n)]));
    function pointCloud(){
      const vao=gl.createVertexArray(),buffer=gl.createBuffer();
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [i,width,offset] of [[0,3,0],[1,4,12],[2,1,28]]){
        gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,width,gl.FLOAT,false,32,offset);
      }
      gl.bindVertexArray(null);return {vao,buffer};
    }
    const stars=pointCloud(),embers=pointCloud(),sky=[];
    for(let i=0;i<18000;i++){
      const angle=Math.random()*2*Math.PI,y=Math.random(),radius=Math.sqrt(1-y*y);
      const bright=Math.random()**3;
      sky.push(90*radius*Math.cos(angle),90*y,90*radius*Math.sin(angle),
        .65+bright*.35,.77+bright*.18,1,.4+.55*bright,.18+.65*bright);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,stars.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(sky),gl.STATIC_DRAW);
    const sparkColors=[[1,.2,.48],[1,.74,.18],[.18,.7,1],[.68,.34,1],[.22,1,.69],[1,.44,.18]];
    // Sample ink coverage once; only actual WebGL particles render the greeting.
    const stencil=artCanvas(1040,110),pen=stencil.getContext('2d');
    pen.font='bold 74px Georgia, serif';pen.textAlign='center';pen.textBaseline='middle';
    const greeting='❤Happy Birthday Sweetie~';
    pen.fillText(greeting,520,54);
    const left=520-pen.measureText(greeting).width/2;
    const ends=Array.from(greeting,(_,i)=>left+pen.measureText(greeting.slice(0,i+1)).width);
    const ink=pen.getImageData(0,0,1040,110).data,glyph=[];
    for(let y=2;y<110;y+=3)for(let x=2;x<1040;x+=3){
      if(ink[(1040*y+x)*4+3]<=120)continue;
      const letter=ends.findIndex(end=>x<end);
      if(letter<0)continue;
      const origin=((ends[letter]+(ends[letter-1]??left))/2-520)/1040;
      glyph.push([(x-520)/1040,(54-y)/1040,Math.random(),origin,letter]);
    }
    let finale=null, fireworksUnlocked=false;
    const sample=window.fireworkSample;
    if(sample){
      const preload=()=>{enablePackAudio();sample.prepare(audio);};
      for(const type of ['pointerdown','keydown'])window.addEventListener(type,preload,{once:true,capture:true});
    }
    const shellFlightTime=1;
    function launchFireworks(revealAfter=false){
      if((!revealAfter&&!fireworksUnlocked)||locked()||!host.ready()||finale)return;
      enablePackAudio();
      window.sceneMusic?.stopBirthday();
      sample?.prepare(audio);
      const {eye,target}=host.camera;
      const heading=Math.atan2(target[0]-eye[0],target[2]-eye[2]);
      host.camera.pitch=-1.04;
      const tilt=1.17,dist=58,forward=[Math.sin(heading),Math.cos(heading)];
      finale={revealCake:revealAfter && compactPack && !cakeVisible,time:0,forward,tilt,center:[eye[0]+dist*Math.cos(tilt)*forward[0],
        1.45+dist*Math.sin(tilt),eye[2]+dist*Math.cos(tilt)*forward[1]]};
      document.body.classList.add('sky-show');
      // Two interleaved waves, each filling the hemisphere from horizon to zenith.
      fireworks=Array.from({length:80},(_,i)=>{
        const slot=i%40,wave=Math.floor(i/40);
        const elevation=Math.asin((slot+.65)/40);
        const angle=heading+slot*2.399963+wave*.8;
        const depth=30+Math.random()*7,range=depth*Math.cos(elevation);
        const x=eye[0]+Math.sin(angle)*range,z=eye[2]+Math.cos(angle)*range;
        const scale=[1.75,.72,1.35,.87][(slot+wave)%4];
        const sparks=Array.from({length:Math.round(180*scale)},()=>{
          const h=Math.random()*2-1,a=Math.random()*Math.PI*2,s=(6+Math.random()*6)*scale,r=s*Math.sqrt(1-h*h);
          const color=sparkColors[Math.floor(Math.random()*sparkColors.length)];
          return {vx:r*Math.cos(a),vy:s*h,vz:r*Math.sin(a),color,life:1.3+Math.random()*1.15};
        });
        return {x,z,height:eye[1]+3+depth*Math.sin(elevation),age:-wave*2.1-(slot%7)*.17,sparks,
          soundCue:slot%7%3===0,finalCue:wave===1 && slot%7===6};
      });
      announce('');
    }
    $('fireworks').onclick=()=>launchFireworks();
    function drawFireworks(vp){
      gl.useProgram(dustProgram);gl.uniformMatrix4fv(dustUniform.vp,false,vp);
      gl.uniform1f(dustUniform.pixelScale,canvas.height*(finale ? .55 : 1));
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
      gl.uniform3fv(dustUniform.origin,host.camera.eye);
      const active=meteors.slice(-8);
      gl.uniform1i(dustUniform.trailCount,active.length);
      if(active.length){
        gl.uniform3fv(dustUniform['heads[0]'],active.flatMap(m=>meteorPosition(m,m.age)));
        gl.uniform3fv(dustUniform['tails[0]'],active.flatMap(m=>meteorPosition(m,Math.max(0,m.age-1.05))));
      }
      gl.bindVertexArray(stars.vao);gl.drawArrays(gl.POINTS,0,sky.length/8);
      gl.uniform1i(dustUniform.trailCount,0);
      gl.uniform1f(dustUniform.pixelScale,canvas.height*1.55);
      const data=[];
      drawMeteor(data);
      for(const {age,x,z,height,sparks} of fireworks){
        if(age<0)continue;
        const t=age-shellFlightTime;
        // Skip particle expansion for shells wholly outside the current view.
        const cy=t<0?.2+height*(1-(1-age)**1.5):height;
        const clipW=vp[3]*x+vp[7]*cy+vp[11]*z+vp[15];
        const clipX=vp[0]*x+vp[4]*cy+vp[8]*z+vp[12];
        const clipY=vp[1]*x+vp[5]*cy+vp[9]*z+vp[13];
        const radius=t<0?height*.42+1:28;
        if(clipW < -radius || Math.abs(clipX)>clipW+radius*(1+Math.hypot(vp[0],vp[4],vp[8])) ||
           Math.abs(clipY)>clipW+radius*(1+Math.hypot(vp[1],vp[5],vp[9])))continue;
        if(t<0){
          for(let k=0;k<24;k++){
            const a=age-k*.012;if(a<0)break;
            data.push(x,.2+height*(1-(1-a)**1.5),z,1,.72,.35,1-k/24,.22-k*.005);
          }
        }else{
          if(t<.16)data.push(x,height+.2,z,1,.88,.67,1-t/.16,2.4);
          for(const p of sparks){
            for(let k=0;k<6;k++){
              const u=t-k*.037;if(u<0||u>p.life)continue;
              const d=1.15*(1-Math.exp(-u/1.15));
              data.push(x+p.vx*d,.2+height+p.vy*d-1.25*u*u,z+p.vz*d,...p.color,
                (1-smooth(u/p.life))*(1-k/6),.25-k*.024);
            }
          }
        }
      }
      if(finale){
        const {time,center,tilt,forward:[fx,fz]}=finale;
        const width=50*canvas.clientWidth/canvas.clientHeight;
        const fade=1-smooth((time-6.7)/1.1);
        // Each letter blooms outwards from its own ignition point.
        for(const [u,v,seed,origin,letter] of glyph){
          const age=time-1.15-letter*.065;
          if(age<=0)continue;
          const spread=1-Math.exp(-age*4.3);
          const fall=Math.max(0,age-3.4);
          const dx=width*(origin+(u-origin)*spread+.0003*seed*fall);
          const dy=width*(v*spread-.00055*fall*fall*(.8+seed*.4));
          data.push(center[0]-fz*dx-fx*Math.sin(tilt)*dy,
            center[1]+Math.cos(tilt)*dy,center[2]+fx*dx-fz*Math.sin(tilt)*dy,
            1,letter===0?.12:.65+seed*.3,letter===0?.36:.36+.4*seed,
            fade*Math.min(1,age*6)*(.8+.2*Math.sin(time*4+seed*6)),width*.0055);
        }
      }
      if(data.length){
        gl.uniform3f(dustUniform.origin,0,0,0);gl.bindVertexArray(embers.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER,embers.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STREAM_DRAW);
        gl.drawArrays(gl.POINTS,0,data.length/8);
      }
      gl.bindVertexArray(null);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(true);
    }
    function floatingPackYaw(){
      const sway=Math.sin(clock*.7);
      if(!compactPack || !cakeVisible)return sway*.12;
      const [x,,z]=CONFIG.anchor;
      return Math.atan2(host.camera.eye[0]-x,host.camera.eye[2]-z)+sway*.035;
    }
    function flightPose(t){
      const eye=host.camera.eye,target=host.camera.target;
      const back=eye.map((x,i)=>x-target[i]);const length=Math.hypot(...back)||1;for(let i=0;i<3;i++)back[i]/=length;
      const horizontal=Math.hypot(back[0],back[2])||1;
      const right=[back[2]/horizontal,0,-back[0]/horizontal];
      const up=[back[1]*right[2],back[2]*right[0]-back[0]*right[2],-back[1]*right[0]];
      const distance=Math.max(4.6,2.8/(canvas.clientWidth/canvas.clientHeight));
      const destination=eye.map((x,i)=>x-back[i]*distance-up[i]*.20);
      const s=smooth(t),arc=Math.sin(Math.PI*t)*.32;
      const p=sourcePose.position.map((x,i)=>mix(x,destination[i],s)+up[i]*arc);
      const yaw=Math.atan2(back[0],back[2]);const delta=Math.atan2(Math.sin(yaw-sourcePose.yaw),Math.cos(yaw-sourcePose.yaw));
      const pitch=-Math.atan2(back[1],horizontal)*s;
      const pulse=mix(worldPackScale,1.18,s)*(1+Math.sin(Math.PI*t)*.045);
      return M.compose(M.translation(...p),M.rotationY(sourcePose.yaw+delta*s),M.rotationX(pitch),M.rotationZ(Math.sin(Math.PI*t)*-.065),M.scaling(pulse,pulse,pulse));
    }
    function open(){if(finale||!artReady||locked()||!host.ready()||!near())return false;
      resetTear();
      window.sceneMusic?.fadeBackground();
      fireworks=[];finale=null;document.body.classList.remove('sky-show');
      entryFocus=document.activeElement;saved={eye:[...host.camera.eye],target:[...host.camera.target],yaw:host.camera.yaw,pitch:host.camera.pitch,distance:host.camera.distance};sourcePose={position:[CONFIG.anchor[0],CONFIG.anchor[1]+Math.sin(clock*1.3)*.035,CONFIG.anchor[2]],yaw:floatingPackYaw()};host.pause();mode='B';phase='transition';flightTime=0;focus=0;session.open();stats.opens++;lastState='';lastPercent=-1;
      if(collected){
        session.state='result';session.elapsed=2;session.progress=1;phase='unwrap';focus=1;
        document.body.classList.add('in-session','session-b');$('session').hidden=false;
        syncUI();flipRemaining();$('done').focus();return true;
      }
      document.body.classList.add('in-session','session-b','transferring');$('session').hidden=false;$('close').focus();announce('');syncUI();return true;}
    function close(){if(!session.active||(session.state==='result'&&!allRevealed()))return;revealSound.call('setRip',0);session.close();host.pause();stats.closes++;returning=false;focus=0;phase='idle';mode='A';
      if(!returning&&saved)restore();document.body.classList.remove('in-session','session-a','session-b','transferring');$('session').hidden=true;
      if(entryFocus&&typeof entryFocus.focus==='function')entryFocus.focus();announce('');syncUI();}
    function revealCake(){
      const {person,camera}=host;
      const dx=Math.sin(person.heading), dz=Math.cos(person.heading);
      pedestalPosition[0]=person.x+dx*2.15;
      pedestalPosition[2]=person.z+dz*2.15;
      pedestalModel.set(M.compose(M.translation(...pedestalPosition),M.scaling(1,displayHeight/1.04,1)));
      // The photographed cream-left, pink-right seam lies about 15° left of local +Z.
      const cakeFrontYaw=-Math.PI/12;
      const towardPerson=Math.atan2(person.x-pedestalPosition[0],person.z-pedestalPosition[2]);
      cakeModel.set(M.compose(M.translation(...pedestalPosition),M.translation(0,displayHeight,0),
        M.rotationY(towardPerson-cakeFrontYaw),M.scaling(1.36,1.36,1.36)));
      CONFIG.anchor[0]=pedestalPosition[0]+dx*1.55;
      CONFIG.anchor[2]=pedestalPosition[2]+dz*1.55;
      CONFIG.anchor[1]=2.82;
      CONFIG.obstacles.push(tableObstacle);
      cakeVisible=true;
      Object.assign(candle,{lit:true,level:1,ember:0});
      camera.pitch=.24;
      camera.yaw=person.heading-2.65;
      camera.distance=7.2;
    }
    function restore(){if(!saved)return;Object.assign(host.camera,{yaw:saved.yaw,pitch:saved.pitch,distance:saved.distance});host.camera.eye=[...saved.eye];host.camera.target=[...saved.target];saved=null;returning=false;}
    function replay(){if(session.replay()){stats.replays++;lastState='';lastPercent=-1;syncUI();$('close').focus();}}
    function setMode(){return false;}
    function syncUI(){
      $('world-controls').hidden=!host.ready();
      $('mode-a').disabled=$('mode-b').disabled=locked();
      const result=session.state==='result',opening=session.state==='opening';$('close').hidden=result;$('replay').hidden=true;$('done').hidden=!result||!allRevealed();
      document.querySelector('header .brand').inert=result;
      $('tear-zone').hidden=!session.active||opening||result||focus<1; // No tearing until the complete transfer has settled.
      if((phase+' / '+session.state)!==lastState){
        deck.hidden=!result;
        document.body.classList.toggle('dealt',result);
        if(!result)resetCards();
        const title=$('session-title');
        if(result||opening) title.textContent=result?'四份祝福，等你翻开':'惊喜，正在靠近';
        else {
          const heart=document.createElement('span');
          heart.className='title-heart';
          heart.textContent='❤';
          title.replaceChildren('猜猜里面是什么么，开开叭',heart);
        }
        $('instruction').textContent=result?'点一张卡背，看看里面的祝福':opening?'留一点时间，给即将出现的心意':'慢慢一点撕开喔';
        if(result)announce('四张卡已发出，点选卡背翻开。');
        lastState=phase+' / '+session.state;
      }
      const percent=Math.round(session.progress*100);if(percent!==lastPercent||result||opening){$('progress-fill').style.width=percent+'%';$('tear-zone').setAttribute('aria-valuenow',String(percent));$('progress-copy').textContent=result?('已翻开 '+cards.filter(b=>b.classList.contains('flipped')).length+' / 4'):opening?'已拆开 · 正在揭晓':percent?'已撕开 '+percent+'% · 松手后可继续':'封口完好 · 0%';lastPercent=percent;}
    }
    function onKey(e){if(session.state==='result'){
        if(collected && e.code==='Escape')close();
        e.preventDefault();return true;
      }
      if(e.code==='Tab'&&session.active){const targets=[$('close'),...(deck.hidden?[]:cards),$('tear-zone'),$('replay'),$('done')].filter(el=>!el.hidden&&!el.disabled);const index=targets.indexOf(document.activeElement);targets[(index+(e.shiftKey?-1:1)+targets.length)%targets.length].focus();e.preventDefault();return true;}
      if(e.code==='KeyF'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){if(!e.repeat)launchFireworks();e.preventDefault();return true;}
      if(e.code==='Escape'&&session.active){e.preventDefault();close();return true;}
      if(e.code==='KeyE'&&!e.repeat&&!locked()){e.preventDefault();interact();return true;}
      if(e.code==='Space'&&document.activeElement?.matches('button')&&session.active)return false;
      if(locked()&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyR','KeyE'].includes(e.code)){
        if(phase==='unwrap'&&document.activeElement===$('tear-zone')&&['ArrowLeft','ArrowRight'].includes(e.code))session.setProgress(session.progress+.08);
        e.preventDefault();return true;}return false;}
    $('pack-prompt').addEventListener('click',interact);$('close').addEventListener('click',close);$('done').addEventListener('click',accept);$('replay').addEventListener('click',replay);$('mode-a').addEventListener('click',()=>setMode('A'));$('mode-b').addEventListener('click',()=>setMode('B'));
    for (const event of ['pointerdown', 'keydown', 'click']) {
      document.addEventListener(event, e => {
        if (e.isTrusted && (phase === 'unwrap' || e.target === $('pack-prompt'))) enablePackAudio();
      }, true);
    }
    const zone=$('tear-zone');zone.addEventListener('pointerdown',e=>{if(e.button!==0||!tearRect||phase!=='unwrap'||focus<1)return;const r=zone.getBoundingClientRect();const start=r.left+r.width*(1-session.progress)-Math.min(55,r.width*.35);if(e.clientX<start)return;
      if(session.start(e.pointerId,e.clientX,r.width*.85)){revealSound.call('grab');previousX=e.clientX;previousY=grabY=e.clientY;pullLift=steer=0;zone.setPointerCapture(e.pointerId);zone.classList.add('dragging');e.preventDefault();}});
    zone.addEventListener('pointermove',e=>{
      if (session.drag?.id!==e.pointerId) return;
      const before=session.progress;
      session.move(e.pointerId,e.clientX);
      if (session.progress>before) {
        steerUnopened(before,e.clientX-previousX,e.clientY-previousY);
        previousX=e.clientX;previousY=e.clientY;
      }
      pullLift=Math.max(-.35,Math.min(.55,(grabY-e.clientY)/Math.max(80,tearRect.height*2)));
      syncUI();
    });
    function release(e){session.release(e.pointerId);zone.classList.remove('dragging');if(zone.hasPointerCapture(e.pointerId))zone.releasePointerCapture(e.pointerId);}
    zone.addEventListener('pointerup',release);zone.addEventListener('pointercancel',release);zone.addEventListener('lostpointercapture',()=>{session.drag=null;zone.classList.remove('dragging');});
    function pauseDrag(){const id=session.drag?.id;session.drag=null;zone.classList.remove('dragging');if(id!==undefined&&zone.hasPointerCapture(id))zone.releasePointerCapture(id);}
    window.addEventListener('blur',pauseDrag);document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseDrag();});
    for(const button of document.querySelectorAll('[data-move]')){const code=button.dataset.move;const fire=type=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));button.addEventListener('pointerdown',e=>{if(locked())return;button.setPointerCapture(e.pointerId);fire('keydown');});for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>fire('keyup'));}
    function update(dt,now){clock=now/1000;
      candle.level=clamp(candle.level+(candle.lit?dt/.52:-dt/.32));
      candle.ember=Math.max(0,candle.ember-dt/.85);
      updateMeteor(dt);
      const fireworkDt=dt*(sample?.tempo ?? 1);
      if(finale){finale.time+=fireworkDt;if(finale.time>=7.8){if(finale.revealCake)revealCake();fireworksUnlocked=true;finale=null;document.body.classList.remove('sky-show');}}
      if(fireworks.length){
        let launches=0,detonations=0,finalCue=false;
        for(const burst of fireworks){
          const previous=burst.age;
          burst.age+=fireworkDt;
          if(sample?.syncGroups && !burst.soundCue)continue;
          if(previous<=0 && burst.age>0 && burst.age<.16)launches++;
          if(previous<shellFlightTime && burst.age>=shellFlightTime && burst.age<shellFlightTime+.16){detonations++;finalCue ||= burst.finalCue;}
        }
        if(sample){
          if(launches)sample.play(audio,0);
          if(detonations){
            const end=sample.play(audio,1,finalCue);
            if(finalCue && Number.isFinite(end))window.sceneMusic?.playBirthday(end+1);
          }
        }else if(detonations)playFireworkBurst(detonations);
        fireworks=fireworks.filter(burst=>burst.age<3.7);
      }
      $('fireworks').hidden=!fireworksUnlocked;
      $('fireworks').disabled=!fireworksUnlocked||!host.ready()||locked()||!!finale;
      if(phase==='transition'){
        flightTime=Math.min(1.25,flightTime+dt);focus=clamp(flightTime/1.25);
        if(focus===1){phase='unwrap';document.body.classList.remove('transferring');announce('');}
      }else session.update(dt);
      updateSeal(dt);
      syncUI();positionTear();
    }
    function draw(worldVP){stats.draws++;const overlay=mode==='B'&&session.active;
      gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
      let vp=worldVP,base=M.translation(...CONFIG.anchor),eye=host.camera.eye;
      if(!overlay){drawFireworks(worldVP);if(cakeVisible)for(const drawPart of cakeDisplay)drawPart(worldVP);}
      if(overlay){
        const dim=.83*smooth((focus-.08)/.82);
        gl.disable(gl.DEPTH_TEST);mesh(quad([-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]),M.identity(),M.identity(),white,[.022,.039,.067,dim],0,1);
        gl.clear(gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);
        // Move one continuous object from its world position to the camera-facing B stage.
        // Same world projection throughout: no cut, duplicate pack, or projection discontinuity.
        base=flightPose(focus);
      }
      const elapsed=session.elapsed,reveal=smooth((elapsed-.2)/1.4),isOpen=['opening','result'].includes(session.state);
      const idle=session.active?0:Math.sin(clock*1.3)*.035;
      const bodyModel=M.compose(base,M.translation(0,idle-(isOpen?smooth(elapsed/1.2)*2.6:0),0),M.rotationY(session.active?0:floatingPackYaw()),overlay?M.identity():M.scaling(worldPackScale,worldPackScale,worldPackScale));
      lastVP=vp;lastModel=bodyModel;
      const prompt=$('pack-prompt');
      const cakeTarget=atCandle();
      prompt.textContent=cakeTarget?(candle.lit?'按 E 吹灭蜡烛':'按 E 重新点亮'):'按E解锁';
      const label=cakeTarget?project([0,.80,0],cakeModel,vp):phase==='idle' && !finale && near() && artReady && host.ready() && project([0,1.36,0],bodyModel,vp);
      prompt.hidden=!label;
      if(label){prompt.style.left=label[0]+'px';prompt.style.top=label[1]+'px';}
      if(!isOpen||elapsed<1.8){
        // Silver inner lining remains below the torn rim; front/back are separated in depth.
        mesh(quad([-.7,.60,-.04],[.7,.60,-.04],[.7,.855,-.04],[-.7,.855,-.04]),bodyModel,vp,sealTex,[.75,.83,.92,1],.2,0,eye);
        mesh(packageGeometry(session.progress),bodyModel,vp,packTex,[1,1,1,1],.35,0,eye);
        mesh(quad([-.72,-1.04,-.055],[-.72,-1.04,.055],[-.72,.86,.055],[-.72,.86,-.055]),bodyModel,vp,white,[.13,.20,.31,1],.1,0,eye);
        mesh(quad([.72,-1.04,.055],[.72,-1.04,-.055],[.72,.86,-.055],[.72,.86,.055]),bodyModel,vp,white,[.25,.35,.47,1],.1,0,eye);
        mesh(quad([-.72,-1.04,.06],[.72,-1.04,.06],[.72,-.91,.06],[-.72,-.91,.06]),bodyModel,vp,sealTex,[.6,.74,.9,1],.2,0,eye);
      }
      if (!isOpen || elapsed < .85) {
        const fly = isOpen && !quietTear.matches;
        const stripModel = fly ? M.compose(base,M.translation(-elapsed*1.9,elapsed*(3.6-elapsed*3),elapsed*.65),
          M.translation(-.72,.86,0),M.rotationZ(elapsed*6.2),M.rotationX(-elapsed*4),M.translation(.72,-.86,0)) : bodyModel;
        if (!isOpen || fly) mesh(stripGeometry(session.progress),stripModel,vp,sealTex,[1,1,1,1],.4,0,eye);
      }
      if (overlay) drawTearLight(session.progress,elapsed,isOpen,bodyModel,base,vp,eye);
      // Modest deterministic star fragments, drawn in the same coordinate system as the pack.
      const starData=[];for(let i=0;i<45;i++){const a=i*2.39996+clock*.08,r=.95+(i%7)*.11;let x=Math.cos(a)*r,y=Math.sin(a)*r*.95,z=-.15+Math.sin(i*7)*.12;
        if(isOpen){const burst=smooth(elapsed/.7);x*=1+burst*.6;y=y*(1+burst*.45)-elapsed*.15;}
        const size=(i%5===0?.017:.007)*(isOpen?1.3:1);starData.push(...quad([x-size,y,z],[x,y-size*1.8,z],[x+size,y,z],[x,y+size*1.8,z]));}
      gl.depthMask(false);mesh(starData,base,vp,white,[.66,.8,.99,isOpen?Math.max(.12,1-elapsed*.3):.38],0,1,eye);gl.depthMask(true);
      gl.activeTexture(gl.TEXTURE0);gl.bindVertexArray(null);
    }
    syncUI();
    return {open,close,replay,setMode,onKey,update,draw,get locked(){return locked();},get snapshot(){return {cakeVisible,candle:{...candle},mode,phase,transferProgress:focus,state:phase==='transition'?'transition':session.state,progress:session.progress,elapsed:session.elapsed,focus,returning,near:near(),ready:host.ready(),artReady,stats:{...stats},tearRect:tearRect&&{...tearRect},camera:{eye:[...host.camera.eye],target:[...host.camera.target],yaw:host.camera.yaw,pitch:host.camera.pitch,distance:host.camera.distance},person:{x:host.person.x,y:host.person.y,z:host.person.z}};},config:CONFIG};
  }
  window.GachaMVP={create};
})();
