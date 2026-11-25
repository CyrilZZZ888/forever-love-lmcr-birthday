(function(root){
  'use strict';
  const clamp=x=>Math.max(0,Math.min(1,x));
  class Session {
    constructor(){this.state='idle';this.progress=0;this.elapsed=0;this.automatic=false;this.drag=null;}
    get active(){return this.state!=='idle';}
    open(){if(this.active)return false;this.state='ready';this.progress=0;this.elapsed=0;this.automatic=false;this.drag=null;return true;}
    start(id,x,width){if(!['ready','tearing'].includes(this.state)||this.drag)return false;this.drag={id,x,width:Math.max(80,width),base:this.progress};this.state='tearing';return true;}
    move(id,x){if(!this.drag||this.drag.id!==id)return;this.setProgress(this.drag.base+(this.drag.x-x)/this.drag.width);}
    release(id){if(this.drag&&this.drag.id===id)this.drag=null;}
    setProgress(value){if(!['ready','tearing'].includes(this.state))return;this.progress=Math.max(this.progress,clamp(value));if(this.progress>=.9){this.progress=1;this.state='opening';this.elapsed=0;this.drag=null;}}
    auto(){if(['ready','tearing'].includes(this.state)){this.automatic=true;this.drag=null;}}
    update(dt){if(!Number.isFinite(dt)||dt<0)return;if(this.automatic&&['ready','tearing'].includes(this.state))this.setProgress(this.progress+dt*.65);if(this.state==='opening'){this.elapsed+=dt;if(this.elapsed>=2){this.elapsed=2;this.state='result';this.automatic=false;}}}
    close(){this.state='idle';this.progress=0;this.elapsed=0;this.drag=null;this.automatic=false;}
    replay(){if(this.state!=='result')return false;this.close();return this.open();}
  }
  const api={Session,clamp};root.GachaCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
