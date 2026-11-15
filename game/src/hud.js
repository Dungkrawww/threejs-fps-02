// The DOM HUD: crosshair, hit marker, ammo, health, armour, money, round timer, round
// score, kill feed, bomb status, the buy menu and the banners. It never touches the
// simulation; main.js pushes numbers in and reads the play and buy callbacks out.
const COPY = {
  start: {
    title: 'Dustline',
    copy: 'One attacker against five defenders. Plant the bomb at A or B, or clear the site. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Dustline',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const scoreValue = document.getElementById('score-value');
  const hitmarker = document.getElementById('hitmarker');
  const healthFill = document.getElementById('health-fill');
  const healthValue = document.getElementById('health-value');
  const armorValue = document.getElementById('armor-value');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const roundsPlayer = document.getElementById('rounds-player');
  const roundsBots = document.getElementById('rounds-bots');
  const weaponName = document.getElementById('weapon-name');
  const grenadesValue = document.getElementById('grenades-value');
  const killfeed = document.getElementById('killfeed');
  const banner = document.getElementById('banner');
  const bannerTitle = document.getElementById('banner-title');
  const bannerCopy = document.getElementById('banner-copy');
  const bombStatus = document.getElementById('bomb-status');
  const bombText = document.getElementById('bomb-text');
  const bombFill = document.getElementById('bomb-fill');
  const buyMenu = document.getElementById('buy-menu');
  const buyItems = document.getElementById('buy-items');
  const buyMoney = document.getElementById('buy-money');
  let hitTimer = 0;
  let bannerTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastScore = -1;
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastRounds = '';
  let lastWeapon = '';
  let lastGrenades = -1;

  function formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setScore(value) {
      if (value === lastScore) return;
      lastScore = value;
      scoreValue.textContent = String(value);
    },
    setHealth(health, armor) {
      if (health === lastHealth && armor === lastArmor) return;
      lastHealth = health;
      lastArmor = armor;
      healthFill.style.width = `${Math.max(0, health)}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthValue.textContent = String(Math.ceil(health));
      armorValue.textContent = String(Math.ceil(armor));
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${formatTime(seconds)}` : formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerValue.classList.toggle('urgent', phase === 'live' && seconds <= 15);
    },
    setRounds(playerWins, botWins) {
      const text = `${playerWins}–${botWins}`;
      if (text === lastRounds) return;
      lastRounds = text;
      roundsPlayer.textContent = String(playerWins);
      roundsBots.textContent = String(botWins);
    },
    setWeapon(name, grenades) {
      const text = `${name}|${grenades}`;
      if (text === lastWeapon) return;
      lastWeapon = text;
      weaponName.textContent = name;
      grenadesValue.textContent = `◉ ${grenades}`;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      killfeed.appendChild(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.firstChild);
      setTimeout(() => {
        if (line.parentNode) line.parentNode.removeChild(line);
      }, 5000);
    },
    banner(titleText, copyText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerCopy.textContent = copyText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      banner.hidden = true;
    },
    showBomb(kind, progress, seconds) {
      if (!kind) {
        bombStatus.hidden = true;
        return;
      }
      bombStatus.hidden = false;
      if (kind === 'planting') {
        bombText.textContent = `Planting… ${Math.round(progress * 100)}%`;
        bombFill.style.width = `${progress * 100}%`;
      } else if (kind === 'fuse') {
        bombText.textContent = `Bomb live — ${formatTime(seconds)}`;
        bombFill.style.width = `${Math.max(0, (seconds / 40) * 100)}%`;
      } else if (kind === 'defusing') {
        bombText.textContent = `They are defusing… ${Math.round(progress * 100)}%`;
        bombFill.style.width = `${progress * 100}%`;
      }
    },
    showBuy(items, onBuy) {
      buyItems.innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-label">${item.label}</span><span class="buy-price">$${item.price}</span>`;
        button.addEventListener('click', () => onBuy(item.id));
        buyItems.appendChild(button);
      }
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'end' || mode === 'match') {
        copy.textContent = detail || text.copy;
      } else {
        copy.textContent = text.copy;
      }
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
