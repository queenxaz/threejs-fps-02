// The DOM HUD: crosshair, hit marker, health, ammo, timer, score, money, bomb
// status, kill feed, buy menu and the overlays. It never touches the simulation;
// main.js pushes numbers in and reads callbacks out.
const OVERLAY_COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'One attacker, five defenders, two sites. Plant the charge at A or B — or clear the yard. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  roundEnd: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  matchEnd: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeCount = $('grenade-count');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const armorNum = $('armor-num');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreValue = $('score-value');
  const bombValue = $('bomb-value');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damage = $('damage');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buy = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;
  let playHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp, armor) {
      healthFill.style.width = `${Math.max(0, hp)}%`;
      healthFill.classList.toggle('low', hp <= 30);
      setText(healthNum, 'hp', String(Math.ceil(hp)));
      setText(armorNum, 'armor', armor > 0 ? `+${Math.ceil(armor)}` : '');
    },
    setAmmo(mag, reserve, name, nades) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      setText(grenadeCount, 'nades', nades > 0 ? `◉ ${nades}` : '');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
    },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      $('timer').classList.toggle('planted', planted);
    },
    setScore(you, them, round) {
      setText(scoreValue, 'score', `YOU ${you} — ${them} DEF  ·  ROUND ${round}`);
    },
    setAlive(playerAlive, botsAlive) {
      setText(aliveValue, 'alive', playerAlive ? `● YOU  ·  ${'●'.repeat(botsAlive)}${'○'.repeat(5 - botsAlive)} DEF` : `✕ YOU  ·  ${'●'.repeat(botsAlive)} DEF`);
    },
    setBomb(status) {
      const text = { carried: 'BOMB — CARRIED', planting: 'PLANTING…', planted: 'BOMB PLANTED', defused: 'BOMB DEFUSED', detonated: 'BOMB DETONATED' }[status] || '';
      setText(bombValue, 'bomb', text);
      $('bomb').classList.toggle('hot', status === 'planted' || status === 'planting');
    },
    setCrosshairSpread(px) {
      crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      setTimeout(() => damage.classList.remove('on'), 180);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    banner(text, sub = '') {
      bannerTitle.textContent = text;
      bannerSub.textContent = sub;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), 2600);
    },
    setPlant(progress) {
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hidePlant() {
      plantBar.hidden = true;
    },
    showBuy(items, money) {
      buyMoney.textContent = `$${money}`;
      buyList.innerHTML = '';
      items.forEach((item, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = item.disabled;
        row.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${item.name}</span><span class="buy-note">${item.note || ''}</span><span class="buy-price">${item.price === 0 ? 'OWNED' : '$' + item.price}</span>`;
        row.addEventListener('click', () => buyHandler && buyHandler(item.id));
        buyList.appendChild(row);
      });
      buy.hidden = false;
    },
    hideBuy() {
      buy.hidden = true;
    },
    onBuy(handler) { buyHandler = handler; },
    showOverlay(mode, extra = '') {
      const text = OVERLAY_COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playHandler = handler;
      play.addEventListener('click', () => playHandler && playHandler());
    },
  };
}
