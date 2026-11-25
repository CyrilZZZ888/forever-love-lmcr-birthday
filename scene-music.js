(() => {
  const Engine = window.AudioContext || window.webkitAudioContext;
  if (!Engine) return;
  const context = new Engine();
  const tracks = Promise.all(window.sceneMusicClips.map(encoded =>
    context.decodeAudioData(Uint8Array.from(atob(encoded), char => char.charCodeAt(0)).buffer)
  ));
  let background, birthday, buffers;
  const backgroundGain = context.createGain();
  backgroundGain.connect(context.destination);

  async function startEntrance() {
    buffers = await tracks;
    if (context.state !== 'running') {
      const button = document.createElement('button');
      button.textContent = '进入生日空间 ♪';
      button.className = 'music-entry';
      document.body.append(button);
      await new Promise(resolve => {
        function ready() {
          if (context.state !== 'running') return;
          context.removeEventListener('statechange', ready);
          button.remove();
          resolve();
        }
        context.addEventListener('statechange', ready);
        button.onclick = () => context.resume().then(ready);
        context.resume().then(ready).catch(() => {});
      });
    }
    background = context.createBufferSource();
    background.buffer = buffers[0];
    background.loop = true;
    background.connect(backgroundGain);
    background.start();
  }

  function fadeBackground() {
    if (!background) return;
    const now = context.currentTime;
    backgroundGain.gain.setValueAtTime(1, now);
    backgroundGain.gain.linearRampToValueAtTime(0, now + 1.5);
    background.stop(now + 1.5);
    background = null;
  }

  function stopBirthday() {
    if (birthday) birthday.stop();
    birthday = null;
  }

  function playBirthday(when) {
    stopBirthday();
    birthday = context.createBufferSource();
    birthday.buffer = buffers[1];
    birthday.connect(context.destination);
    birthday.start(when);
  }

  window.sceneMusic = {context, startEntrance, fadeBackground, playBirthday, stopBirthday};
})();
