const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  objective: document.getElementById("objective"),
  statusLine: document.getElementById("statusLine"),
  cashLine: document.getElementById("cashLine"),
  wantedLine: document.getElementById("wantedLine"),
  healthLine: document.getElementById("healthLine"),
};

const keys = new Set();
const world = {
  width: 2400,
  height: 2400,
  block: 420,
  road: 120,
  sidewalk: 24,
};

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleWrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

const roadCenters = [];
for (let n = world.block / 2; n < world.width; n += world.block) {
  roadCenters.push(n);
}

const colors = ["#f97316", "#38bdf8", "#22c55e", "#eab308", "#ef4444", "#a78bfa"];

const player = {
  x: world.width / 2 + 10,
  y: world.height / 2 + 10,
  angle: 0,
  radius: 12,
  speed: 0,
  maxSpeed: 220,
  health: 100,
  cash: 0,
  wanted: 0,
  wantedCooldown: 0,
  vehicle: null,
  invuln: 0,
};

const camera = { x: player.x, y: player.y, zoom: 1 };
const pedestrians = [];
const cars = [];
const policeCars = [];
const pickups = [];
const debris = [];

function createPedestrian(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 9,
    tone: `hsl(${Math.floor(rand(10, 360))} 70% 72%)`,
    shirt: `hsl(${Math.floor(rand(0, 360))} 70% 55%)`,
    heading: rand(-Math.PI, Math.PI),
    timer: rand(0.2, 2.8),
    panic: 0,
    alive: true,
  };
}

function createCar(x, y, angle, opts = {}) {
  return {
    x,
    y,
    angle,
    speed: opts.speed || 0,
    width: 26,
    height: 46,
    color: opts.color || colors[Math.floor(rand(0, colors.length))],
    ai: opts.ai || false,
    police: opts.police || false,
    occupied: opts.occupied || false,
    targetRoad: opts.targetRoad || null,
    routeAxis: opts.routeAxis || "x",
    turnCooldown: rand(0.8, 2),
    sirenPhase: 0,
    health: 100,
    disabled: false,
  };
}

function createPickup(x, y, value) {
  return { x, y, value, radius: 12, bob: rand(0, Math.PI * 2) };
}

function nearestRoadCenter(value) {
  let best = roadCenters[0];
  let bestDist = Infinity;
  for (const center of roadCenters) {
    const delta = Math.abs(center - value);
    if (delta < bestDist) {
      bestDist = delta;
      best = center;
    }
  }
  return best;
}

function isOnRoad(x, y) {
  return (
    roadCenters.some((center) => Math.abs(x - center) < world.road / 2) ||
    roadCenters.some((center) => Math.abs(y - center) < world.road / 2)
  );
}

function randomStreetSpot() {
  const center = roadCenters[Math.floor(rand(0, roadCenters.length))];
  const vertical = Math.random() > 0.5;
  return vertical
    ? { x: center + rand(-world.road / 2 + 18, world.road / 2 - 18), y: rand(80, world.height - 80) }
    : { x: rand(80, world.width - 80), y: center + rand(-world.road / 2 + 18, world.road / 2 - 18) };
}

function randomSidewalkSpot() {
  const center = roadCenters[Math.floor(rand(0, roadCenters.length))];
  const vertical = Math.random() > 0.5;
  const offset = world.road / 2 + world.sidewalk / 2 + rand(-10, 10);
  return vertical
    ? { x: center + (Math.random() > 0.5 ? offset : -offset), y: rand(80, world.height - 80) }
    : { x: rand(80, world.width - 80), y: center + (Math.random() > 0.5 ? offset : -offset) };
}

function spawnWorld() {
  for (let i = 0; i < 42; i++) {
    const spot = randomSidewalkSpot();
    pedestrians.push(createPedestrian(spot.x, spot.y));
  }

  for (let i = 0; i < 16; i++) {
    const vertical = Math.random() > 0.5;
    const center = roadCenters[Math.floor(rand(0, roadCenters.length))];
    const x = vertical ? center - 24 : rand(180, world.width - 180);
    const y = vertical ? rand(180, world.height - 180) : center + 24;
    const angle = vertical ? (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : (Math.random() > 0.5 ? 0 : Math.PI);
    cars.push(
      createCar(x, y, angle, {
        speed: rand(35, 80),
        ai: true,
        occupied: true,
        routeAxis: vertical ? "y" : "x",
        targetRoad: center,
      }),
    );
  }

  for (let i = 0; i < 10; i++) {
    const center = roadCenters[Math.floor(rand(0, roadCenters.length))];
    const x = center + rand(-48, 48);
    const y = rand(120, world.height - 120);
    const angle = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    cars.push(createCar(x, y, angle, { speed: 0, ai: false, occupied: false }));
  }

  for (let i = 0; i < 12; i++) {
    const spot = randomSidewalkSpot();
    pickups.push(createPickup(spot.x, spot.y, Math.floor(rand(80, 250))));
  }
}

function spawnPoliceCar() {
  const edge = Math.floor(rand(0, 4));
  let x = player.x;
  let y = player.y;
  if (edge === 0) {
    x = clamp(player.x + rand(-260, 260), 80, world.width - 80);
    y = clamp(player.y - 460, 80, world.height - 80);
  } else if (edge === 1) {
    x = clamp(player.x + 460, 80, world.width - 80);
    y = clamp(player.y + rand(-260, 260), 80, world.height - 80);
  } else if (edge === 2) {
    x = clamp(player.x + rand(-260, 260), 80, world.width - 80);
    y = clamp(player.y + 460, 80, world.height - 80);
  } else {
    x = clamp(player.x - 460, 80, world.width - 80);
    y = clamp(player.y + rand(-260, 260), 80, world.height - 80);
  }
  const roadX = nearestRoadCenter(x);
  const roadY = nearestRoadCenter(y);
  if (Math.abs(x - roadX) < Math.abs(y - roadY)) {
    x = roadX + (x > roadX ? 20 : -20);
  } else {
    y = roadY + (y > roadY ? 20 : -20);
  }
  const target = { x: player.vehicle ? player.vehicle.x : player.x, y: player.vehicle ? player.vehicle.y : player.y };
  const angle = Math.atan2(target.y - y, target.x - x);
  policeCars.push(
    createCar(x, y, angle, {
      speed: 110,
      ai: true,
      occupied: true,
      police: true,
      routeAxis: Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? "x" : "y",
      targetRoad: Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) ? nearestRoadCenter(y) : nearestRoadCenter(x),
      color: "#ffffff",
    }),
  );
}

function getPlayerPosition() {
  return player.vehicle || player;
}

function updateOnFoot(dt) {
  const moveX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const moveY = (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - (keys.has("w") || keys.has("arrowup") ? 1 : 0);
  const moving = moveX !== 0 || moveY !== 0;
  const sprint = keys.has("shift");
  const targetSpeed = sprint ? 220 : 140;

  if (moving) {
    const length = Math.hypot(moveX, moveY) || 1;
    player.speed = lerp(player.speed, targetSpeed, dt * 7);
    player.x += (moveX / length) * player.speed * dt;
    player.y += (moveY / length) * player.speed * dt;
    player.angle = Math.atan2(moveY, moveX);
  } else {
    player.speed = lerp(player.speed, 0, dt * 8);
  }

  player.x = clamp(player.x, 30, world.width - 30);
  player.y = clamp(player.y, 30, world.height - 30);
}

function updatePlayerCar(dt) {
  const car = player.vehicle;
  if (!car) return;

  const throttle = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const steer = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const friction = keys.has(" ") ? 2.8 : 1.1;
  const accel = throttle * 250;

  car.speed += accel * dt;
  car.speed = clamp(car.speed, -90, 300);
  car.speed = lerp(car.speed, 0, dt * friction);
  car.angle += steer * dt * clamp(car.speed / 90, -2.2, 2.2);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  if (!isOnRoad(car.x, car.y)) {
    car.speed *= 0.985;
  }

  car.x = clamp(car.x, 35, world.width - 35);
  car.y = clamp(car.y, 35, world.height - 35);
}

function updateAICar(car, dt, pursuitTarget) {
  if (car.disabled) {
    car.speed = lerp(car.speed, 0, dt * 3);
    return;
  }

  if (car.police && pursuitTarget) {
    const desiredAngle = Math.atan2(pursuitTarget.y - car.y, pursuitTarget.x - car.x);
    const delta = angleWrap(desiredAngle - car.angle);
    car.angle += clamp(delta, -1.8, 1.8) * dt;
    car.speed = lerp(car.speed, 170 + player.wanted * 14, dt * 1.4);
  } else {
    car.turnCooldown -= dt;
    if (car.turnCooldown <= 0) {
      car.turnCooldown = rand(1.2, 4.5);
      if (Math.random() > 0.6) {
        const turns = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
        const newAngle = turns[Math.floor(rand(0, turns.length))];
        car.angle = lerp(car.angle, newAngle, 0.8);
      }
    }
    car.speed = lerp(car.speed, clamp(car.speed || rand(40, 70), 40, 90), dt * 0.8);
  }

  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  if (car.x < 60 || car.x > world.width - 60 || car.y < 60 || car.y > world.height - 60) {
    car.angle += Math.PI;
  }

  const roadX = nearestRoadCenter(car.x);
  const roadY = nearestRoadCenter(car.y);
  if (Math.abs(car.x - roadX) < Math.abs(car.y - roadY)) {
    car.x = lerp(car.x, roadX + (car.police ? 0 : Math.sign(Math.sin(car.angle) || 1) * 22), dt * 1.4);
  } else {
    car.y = lerp(car.y, roadY + (car.police ? 0 : Math.sign(Math.cos(car.angle) || 1) * 22), dt * 1.4);
  }
}

function updatePedestrians(dt) {
  for (const ped of pedestrians) {
    if (!ped.alive) continue;

    const closeThreat = [...cars, ...policeCars, ...(player.vehicle ? [] : [player])]
      .filter(Boolean)
      .find((entity) => dist(ped, entity) < 70 && (entity.speed || player.speed) > 30);

    if (closeThreat) {
      ped.panic = 1.4;
      ped.heading = Math.atan2(ped.y - closeThreat.y, ped.x - closeThreat.x);
    }

    ped.timer -= dt;
    ped.panic = Math.max(0, ped.panic - dt);
    if (ped.timer <= 0) {
      ped.timer = rand(0.7, 2.8);
      ped.heading += rand(-1.2, 1.2);
    }

    const moveSpeed = ped.panic > 0 ? 95 : 42;
    ped.vx = Math.cos(ped.heading) * moveSpeed;
    ped.vy = Math.sin(ped.heading) * moveSpeed;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;

    ped.x = clamp(ped.x, 40, world.width - 40);
    ped.y = clamp(ped.y, 40, world.height - 40);

    if (!isOnRoad(ped.x, ped.y)) {
      ped.heading += rand(-0.7, 0.7);
    }
  }
}

function collectPickups(dt) {
  const target = getPlayerPosition();
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.bob += dt * 3;
    if (dist(target, pickup) < 24) {
      player.cash += pickup.value;
      pickups.splice(i, 1);
      ui.objective.textContent = "Masz łup. Teraz zgub policję albo zbierz więcej gotówki.";
    }
  }

  while (pickups.length < 12) {
    const spot = randomSidewalkSpot();
    pickups.push(createPickup(spot.x, spot.y, Math.floor(rand(80, 250))));
  }
}

function handleCollisions(dt) {
  const activeCars = [...cars, ...policeCars];

  for (const car of activeCars) {
    if (player.vehicle === car) continue;

    const hitDistance = dist(car, player.vehicle || player);
    const threshold = player.vehicle ? 32 : 22;

    if (!player.vehicle && hitDistance < threshold && Math.abs(car.speed) > 70 && player.invuln <= 0) {
      player.health -= 18 * dt * 10;
      player.invuln = 0.8;
    }
  }

  if (player.vehicle) {
    for (const ped of pedestrians) {
      if (!ped.alive) continue;
      const impact = dist(player.vehicle, ped) < 18;
      const speed = Math.abs(player.vehicle.speed);
      if (impact && speed > 55) {
        ped.alive = false;
        player.wanted = clamp(player.wanted + 1, 0, 5);
        player.wantedCooldown = 18;
        player.cash += 50;
        debris.push({ x: ped.x, y: ped.y, life: 1.2 });
      }
    }
  }

  for (let i = 0; i < activeCars.length; i++) {
    for (let j = i + 1; j < activeCars.length; j++) {
      const a = activeCars[i];
      const b = activeCars[j];
      if (dist(a, b) < 26) {
        const exchange = (a.speed - b.speed) * 0.4;
        a.speed = -exchange;
        b.speed = exchange;
      }
    }
  }

  if (player.vehicle) {
    for (const police of policeCars) {
      if (dist(player.vehicle, police) < 30) {
        player.health -= 14 * dt * 10;
        player.wantedCooldown = 15;
      }
    }
  }

  player.health = clamp(player.health, 0, 100);
  player.invuln = Math.max(0, player.invuln - dt);
}

function updateWanted(dt) {
  if (player.wanted > 0) {
    player.wantedCooldown -= dt;
    if (player.wantedCooldown <= 0) {
      player.wanted -= 1;
      player.wantedCooldown = 12;
    }
  }

  const desiredPolice = player.wanted === 0 ? 0 : Math.min(1 + player.wanted, 5);
  while (policeCars.length < desiredPolice) {
    spawnPoliceCar();
  }
  while (policeCars.length > desiredPolice) {
    policeCars.pop();
  }
}

function tryEnterExitCar() {
  if (player.vehicle) {
    const car = player.vehicle;
    player.vehicle = null;
    player.x = clamp(car.x + Math.cos(car.angle + Math.PI / 2) * 28, 30, world.width - 30);
    player.y = clamp(car.y + Math.sin(car.angle + Math.PI / 2) * 28, 30, world.height - 30);
    player.angle = car.angle;
    ui.objective.textContent = "Na piechotę jesteś wolniejszy, ale łatwiej schować się między blokami.";
    return;
  }

  let candidate = null;
  let bestDist = Infinity;
  for (const car of cars) {
    if (car.police || car.disabled) continue;
    const d = dist(player, car);
    if (d < 44 && Math.abs(car.speed) < 20 && d < bestDist) {
      bestDist = d;
      candidate = car;
    }
  }
  if (candidate) {
    player.vehicle = candidate;
    candidate.occupied = true;
    ui.objective.textContent = "Auto przejęte. Rozbij pęd, zgarniaj paczki i pilnuj pościgu.";
  }
}

function update(dt) {
  if (player.health <= 0) return;

  if (player.vehicle) {
    updatePlayerCar(dt);
  } else {
    updateOnFoot(dt);
  }

  const pursuitTarget = getPlayerPosition();
  for (const car of cars) {
    if (car !== player.vehicle && car.ai) updateAICar(car, dt);
  }
  for (const police of policeCars) {
    if (police !== player.vehicle) updateAICar(police, dt, pursuitTarget);
    police.sirenPhase += dt * 10;
  }

  updatePedestrians(dt);
  collectPickups(dt);
  handleCollisions(dt);
  updateWanted(dt);

  for (let i = debris.length - 1; i >= 0; i--) {
    debris[i].life -= dt;
    if (debris[i].life <= 0) debris.splice(i, 1);
  }

  const target = getPlayerPosition();
  camera.x = lerp(camera.x, target.x, dt * 4);
  camera.y = lerp(camera.y, target.y, dt * 4);
}

function drawRoads() {
  ctx.fillStyle = "#56764a";
  ctx.fillRect(0, 0, world.width, world.height);

  for (let ix = 0; ix < roadCenters.length - 1; ix++) {
    for (let iy = 0; iy < roadCenters.length - 1; iy++) {
      const left = roadCenters[ix] + world.road / 2 + world.sidewalk;
      const right = roadCenters[ix + 1] - world.road / 2 - world.sidewalk;
      const top = roadCenters[iy] + world.road / 2 + world.sidewalk;
      const bottom = roadCenters[iy + 1] - world.road / 2 - world.sidewalk;
      const width = right - left;
      const height = bottom - top;

      ctx.fillStyle = (ix + iy) % 2 === 0 ? "#6b4e3f" : "#7b5a49";
      ctx.fillRect(left + 16, top + 16, width - 32, height - 32);
      ctx.fillStyle = "#93c47d";
      ctx.fillRect(left + 34, top + 30, 44, 44);
      ctx.fillRect(right - 74, bottom - 78, 34, 34);
    }
  }

  ctx.fillStyle = "#2d3238";
  for (const center of roadCenters) {
    ctx.fillRect(center - world.road / 2, 0, world.road, world.height);
    ctx.fillRect(0, center - world.road / 2, world.width, world.road);
  }

  ctx.fillStyle = "#bcb7a1";
  for (const center of roadCenters) {
    ctx.fillRect(center - world.road / 2 - world.sidewalk, 0, world.sidewalk, world.height);
    ctx.fillRect(center + world.road / 2, 0, world.sidewalk, world.height);
    ctx.fillRect(0, center - world.road / 2 - world.sidewalk, world.width, world.sidewalk);
    ctx.fillRect(0, center + world.road / 2, world.width, world.sidewalk);
  }

  ctx.fillStyle = "#f3efe0";
  ctx.strokeStyle = "#f3efe0";
  ctx.setLineDash([26, 18]);
  ctx.lineWidth = 4;
  for (const center of roadCenters) {
    ctx.beginPath();
    ctx.moveTo(center, 0);
    ctx.lineTo(center, world.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(world.width, center);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPickup(pickup) {
  const bob = Math.sin(pickup.bob) * 4;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b2117";
  ctx.font = "bold 12px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("$", 0, 4);
  ctx.restore();
}

function drawPedestrian(ped) {
  if (!ped.alive) return;
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.rotate(ped.heading);
  ctx.fillStyle = ped.shirt;
  ctx.fillRect(-7, -6, 14, 16);
  ctx.fillStyle = ped.tone;
  ctx.beginPath();
  ctx.arc(0, -10, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCar(car) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.fillRect(-car.width / 2, -car.height / 2 + 4, car.width, car.height);
  ctx.fillStyle = car.police ? "#101828" : car.color;
  ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);
  ctx.fillStyle = "#d8dee9";
  ctx.fillRect(-car.width / 2 + 4, -car.height / 2 + 6, car.width - 8, 10);
  ctx.fillRect(-car.width / 2 + 4, car.height / 2 - 16, car.width - 8, 10);
  if (car.police) {
    ctx.fillStyle = Math.sin(car.sirenPhase) > 0 ? "#3b82f6" : "#ef4444";
    ctx.fillRect(-9, -6, 18, 6);
  }
  ctx.restore();
}

function drawPlayer() {
  if (player.vehicle) return;
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);
  ctx.fillStyle = player.invuln > 0 ? "#fca5a5" : "#f5d0fe";
  ctx.fillRect(-8, -6, 16, 18);
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(0, -11, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEffects() {
  for (const chunk of debris) {
    ctx.fillStyle = `rgba(220, 38, 38, ${chunk.life})`;
    ctx.beginPath();
    ctx.arc(chunk.x, chunk.y, (1.2 - chunk.life) * 18, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHUD() {
  const mode = player.vehicle ? "W aucie" : "Na piechotę";
  ui.statusLine.textContent = player.health <= 0 ? "Koniec gry" : `${mode} | ${Math.round(getPlayerPosition().x)}, ${Math.round(getPlayerPosition().y)}`;
  ui.cashLine.textContent = `Gotówka: $${player.cash}`;
  ui.wantedLine.textContent = `Poziom pościgu: ${"★".repeat(player.wanted)}${"☆".repeat(5 - player.wanted)}`;
  ui.healthLine.textContent = `Zdrowie: ${Math.round(player.health)}`;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  drawRoads();
  pickups.forEach(drawPickup);
  pedestrians.forEach(drawPedestrian);
  cars.forEach(drawCar);
  policeCars.forEach(drawCar);
  drawPlayer();
  drawEffects();

  ctx.restore();

  if (player.health <= 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#fff7ed";
    ctx.textAlign = "center";
    ctx.font = "bold 52px Impact";
    ctx.fillText("KONIEC GRY", canvas.width / 2, canvas.height / 2 - 12);
    ctx.font = "22px Trebuchet MS";
    ctx.fillText("Odśwież stronę, aby wrócić na miasto.", canvas.width / 2, canvas.height / 2 + 30);
  }

  drawHUD();
}

let previous = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - previous) / 1000);
  previous = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "e"].includes(key) || ["w", "a", "s", "d", "shift"].includes(key)) {
    event.preventDefault();
  }
  if (!event.repeat && key === "e") {
    tryEnterExitCar();
  }
  keys.add(key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

function resizeCanvas() {
  const width = Math.min(window.innerWidth - 20, 1400);
  canvas.width = width;
  canvas.height = Math.round(width * 9 / 16);
}

window.addEventListener("resize", resizeCanvas);

spawnWorld();
resizeCanvas();
requestAnimationFrame(frame);
