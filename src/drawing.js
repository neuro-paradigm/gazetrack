const CAT_COLS = [
  { body: '#F8D7E3', stripe: '#E8A0B8' }, { body: '#D7EAF8', stripe: '#90BDE0' },
  { body: '#E8D7F8', stripe: '#C090E0' }, { body: '#D7F8E3', stripe: '#80D4A0' },
  { body: '#F8F0D7', stripe: '#E0C878' }, { body: '#F8D7D7', stripe: '#E09090' },
];

export let buddyColorIndex = Math.floor(Math.random() * CAT_COLS.length);
export function rotateBuddyColor() { buddyColorIndex = Math.floor(Math.random() * CAT_COLS.length); }

export function drawCat(ctx, x, y, t, happy) {
  const r = 36, bob = Math.sin(t * 0.7) * 2, cy = y + bob;
  const { body, stripe } = CAT_COLS[buddyColorIndex];
  ctx.save(); ctx.globalAlpha = 0.13;
  ctx.beginPath(); ctx.ellipse(x, cy + r + 4, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
  [[-r * 0.42, -r * 1.1], [r * 0.42, -r * 1.1]].forEach(([dx]) => {
    const ex = x + dx, ey = cy - r;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(dx < 0 ? -0.12 : 0.12);
    ctx.beginPath(); ctx.ellipse(0, -r * 0.72, 10, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -r * 0.72, 6, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = stripe; ctx.fill(); ctx.restore();
  });
  ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, cy + r * 0.15, r * 0.6, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
  if (happy) {
    ctx.beginPath(); ctx.arc(x - r * 0.28, cy - r * 0.15, 3, 0, Math.PI * 2); ctx.fillStyle = '#1a1a2e'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.28, cy - r * 0.15, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy + r * 0.1, r * 0.2, 0, Math.PI); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x - r * 0.28, cy - r * 0.1, 3, 0, Math.PI * 2); ctx.fillStyle = '#1a1a2e'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.28, cy - r * 0.1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy + r * 0.25, r * 0.18, Math.PI, 0); ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x - r * 0.35, cy + r * 0.05); ctx.lineTo(x - r * 0.75, cy - r * 0.1);
  ctx.moveTo(x - r * 0.35, cy + r * 0.15); ctx.lineTo(x - r * 0.75, cy + r * 0.15);
  ctx.moveTo(x + r * 0.35, cy + r * 0.05); ctx.lineTo(x + r * 0.75, cy - r * 0.1);
  ctx.moveTo(x + r * 0.35, cy + r * 0.15); ctx.lineTo(x + r * 0.75, cy + r * 0.15);
  ctx.strokeStyle = stripe; ctx.lineWidth = 1.5; ctx.stroke();
}

export function drawDog(ctx, x, y, t, happy) {
  const r = 36, bob = Math.sin(t * 0.7) * 2, cy = y + bob;
  const body = '#D2B48C', spot = '#8B4513';
  ctx.save(); ctx.globalAlpha = 0.13;
  ctx.beginPath(); ctx.ellipse(x, cy + r + 4, r * 0.85, r * 0.22, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
  [[-r * 0.6, -r * 0.2], [r * 0.6, -r * 0.2]].forEach(([dx, dy]) => {
    ctx.save(); ctx.translate(x + dx, cy + dy); ctx.rotate(dx < 0 ? 0.3 : -0.3);
    ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.3, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = spot; ctx.fill(); ctx.restore();
  });
  ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, cy + r * 0.25, r * 0.5, r * 0.35, 0, 0, Math.PI * 2); ctx.fillStyle = '#eee'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, cy + r * 0.05, r * 0.15, r * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
  if (happy) {
    ctx.beginPath(); ctx.arc(x - r * 0.3, cy - r * 0.2, 3, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.3, cy - r * 0.2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy + r * 0.25, r * 0.15, 0, Math.PI); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x - r * 0.3, cy - r * 0.15, 3, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.3, cy - r * 0.15, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, cy + r * 0.35, r * 0.15, Math.PI, 0); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
  }
}

export function drawSpaceship(ctx, x, y, t, happy) {
  // Ultra-simple fallback to test if the canvas drawing is crashing
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x - 20, y - 20, 40, 40);
}

export function drawBuddy(ctx, x, y, t, happy, buddy) {
  if (buddy === 'dog') drawDog(ctx, x, y, t, happy);
  else if (buddy === 'spaceship') drawSpaceship(ctx, x, y, t, happy);
  else drawCat(ctx, x, y, t, happy);
}

// Confetti particles
export function updateConfetti(ctx, particles) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.rot += p.rotS; p.life -= 0.02;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.globalAlpha = p.life; ctx.fillStyle = `hsl(${p.hue},80%,60%)`;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore();
  }
}

export function spawnConfetti(particles, x, y) {
  for (let i = 0; i < 35; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 4 + Math.random() * 6;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, size: 6 + Math.random() * 8, hue: Math.random() * 360, rot: Math.random() * Math.PI, rotS: -0.2 + Math.random() * 0.4 });
  }
}

// Star drawing
export function drawStar(ctx, x, y, radius, twinklePhase, entranceProgress) {
  const r = radius * entranceProgress;
  const innerR = r * 0.4;
  const points = 5;
  const twinkle = 1 + Math.sin(twinklePhase * 8) * 0.08 * entranceProgress;
  const rr = r * twinkle;
  const glowSize = rr * (1.8 + Math.sin(twinklePhase * 6) * 0.2);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
  grad.addColorStop(0, `rgba(255,220,50,${0.35 * entranceProgress})`);
  grad.addColorStop(1, 'rgba(255,220,50,0)');
  ctx.beginPath(); ctx.arc(x, y, glowSize, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI / points) - Math.PI / 2;
    const rad = i % 2 === 0 ? rr : innerR;
    const px = x + Math.cos(angle) * rad, py = y + Math.sin(angle) * rad;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  const sg = ctx.createRadialGradient(x, y - rr * 0.2, 0, x, y, rr);
  sg.addColorStop(0, '#fff9c4'); sg.addColorStop(0.4, '#ffd700'); sg.addColorStop(1, '#ff9f00');
  ctx.fillStyle = sg; ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 20 * entranceProgress; ctx.fill(); ctx.shadowBlur = 0;
  if (entranceProgress > 0.8) {
    ctx.beginPath(); ctx.arc(x - rr * 0.2, y - rr * 0.25, rr * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.6 * (entranceProgress - 0.8) * 5})`; ctx.fill();
  }
}

export function spawnSparkles(particles, x, y) {
  for (let i = 0; i < 14; i++) {
    const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, size: 2 + Math.random() * 4, hue: 40 + Math.random() * 30 });
  }
}

export function updateSparkles(ctx, particles) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.035;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = `hsl(${p.hue},100%,65%)`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

export function drawPreviewMesh(ctx, lm, W, H) {
  const fx = x => (1 - x) * W, fy = y => y * H;
  [[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
   [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362]].forEach(pts => {
    ctx.beginPath();
    pts.forEach((idx, i) => { const p = lm[idx]; i === 0 ? ctx.moveTo(fx(p.x), fy(p.y)) : ctx.lineTo(fx(p.x), fy(p.y)); });
    ctx.strokeStyle = '#00e5b0'; ctx.lineWidth = 0.6; ctx.globalAlpha = 0.18; ctx.stroke(); ctx.globalAlpha = 1;
  });
  [[468, 469], [473, 474]].forEach(([c, e]) => {
    if (!lm[c] || !lm[e]) return;
    const cx = fx(lm[c].x), cy = fy(lm[c].y);
    ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,229,176,0.45)'; ctx.fill();
  });
}
