
const $ = (id) => document.getElementById(id);
const socket = typeof io === "function" ? io() : null;

const screens = ["menu", "customize", "lobby", "tutorial", "settings", "race"];

function showScreen(name) {
  screens.forEach(id => $(id).classList.toggle("hidden", id !== name));
}

let carName = "Lightning";
let carColor = "#00e5ff";
let multiplayer = false;
let inRoom = false;
let running = false;
let paused = false;
let accelerating = false;
let lane = 1;
let speed = 0;
let distance = 0;
let stars = 0;
let lives = 3;
let elapsed = 0;
let lastTime = 0;
let lastReport = 0;
let obstacles = [];
let collectibles = [];
let roadOffset = 0;
let opponentData = [];
let finished = false;

const FINISH_DISTANCE = 2500;
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");
const laneX = [140, 240, 340];

function prepareCar() {
  carName = $("carName").value.trim().slice(0, 20) || "Lightning";
  carColor = $("carColor").value;
  $("carPreview").style.color = carColor;
}

function resetRace() {
  lane = 1;
  speed = 0;
  distance = 0;
  stars = 0;
  lives = 3;
  elapsed = 0;
  lastReport = 0;
  roadOffset = 0;
  obstacles = [];
  collectibles = [];
  finished = false;
  paused = false;
  accelerating = false;
  updateHUD();
}

function startRace() {
  resetRace();
  running = true;
  showScreen("race");
  $("raceMessage").textContent = "GO! DODGE AND COLLECT!";
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function updateHUD() {
  $("speed").textContent = Math.round(speed);
  $("time").textContent = elapsed.toFixed(1) + "s";
  $("lives").textContent = lives;
  $("stars").textContent = stars;
}

function drawCar(x, y, color) {
  ctx.save();
  ctx.translate(x, y);

  // Car body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-19, -29, 38, 58, 8);
  ctx.fill();

  // Windshield
  ctx.fillStyle = "#c8f5ff";
  ctx.fillRect(-12, -16, 24, 12);

  // Rear window
  ctx.fillStyle = "#263648";
  ctx.fillRect(-12, 8, 24, 9);

  // Wheels
  ctx.fillStyle = "#080b12";
  ctx.fillRect(-23, -19, 5, 13);
  ctx.fillRect(18, -19, 5, 13);
  ctx.fillRect(-23, 9, 5, 13);
  ctx.fillRect(18, 9, 5, 13);

  ctx.restore();
}

function drawTrack() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "#163526";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#343b46";
  ctx.fillRect(55, 0, 370, h);

  ctx.fillStyle = "#ecf0f3";
  for (let y = -40 + roadOffset % 80; y < h; y += 80) {
    ctx.fillRect(61, y, 7, 40);
    ctx.fillRect(412, y, 7, 40);
  }

  ctx.strokeStyle = "#a7b1bd";
  ctx.lineWidth = 3;
  ctx.setLineDash([28, 25]);
  ctx.lineDashOffset = -roadOffset;
  ctx.beginPath();
  ctx.moveTo(190, 0);
  ctx.lineTo(190, h);
  ctx.moveTo(290, 0);
  ctx.lineTo(290, h);
  ctx.stroke();
  ctx.setLineDash([]);

  // Finish line
  if (distance > FINISH_DISTANCE - 400) {
    const y = 80 + (FINISH_DISTANCE - distance) * 0.6;
    if (y > -30 && y < h) {
      for (let x = 65; x < 415; x += 22) {
        for (let row = 0; row < 2; row++) {
          ctx.fillStyle = (Math.floor(x / 22) + row) % 2
            ? "#fff" : "#101010";
          ctx.fillRect(x, y + row * 12, 22, 12);
        }
      }
    }
  }
}

function drawItems(items, color, symbol) {
  items.forEach(item => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.font = "bold 17px Arial";
    ctx.textAlign = "center";
    ctx.fillText(symbol, item.x, item.y + 6);
  });
}

function render() {
  drawTrack();

  drawItems(obstacles, "#ff4057", "!");
  drawItems(collectibles, "#ffd84d", "★");

  // Your car
  drawCar(laneX[lane], 520, carColor);

  // Opponent status
  if (multiplayer && opponentData.length) {
    const other = opponentData.find(p => p.id !== socket?.id);
    if (other) {
      $("opponent").textContent =
        `${other.carName}: ${Math.floor(other.distance || 0)}m · ${other.stars} stars`;
    }
  }

  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`${carName} · ${Math.floor(distance)} / ${FINISH_DISTANCE}m`,
    12, 24);
}

function endRace(message) {
  if (!running) return;
  running = false;
  finished = true;
  accelerating = false;
  $("raceMessage").textContent = message;
  $("accelerate").textContent = "RACE ENDED";

  if (multiplayer && socket && inRoom) {
    socket.emit("race-progress", {
      stars,
      distance,
      finished: true
    });
  }

  render();
}

function loop(now) {
  if (!running) return;

  requestAnimationFrame(loop);

  if (paused) {
    render();
    return;
  }

  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;

  const targetSpeed = accelerating ? 240 : 125;
  speed += (targetSpeed - speed) * Math.min(dt * 2, 1);
  distance += speed * dt / 3.6;
  roadOffset += speed * dt * 0.65;

  if (Math.random() < dt * 0.8) {
    obstacles.push({
      x: laneX[Math.floor(Math.random() * 3)],
      y: -25,
      r: 19
    });
  }

  if (Math.random() < dt * 0.65) {
    collectibles.push({
      x: laneX[Math.floor(Math.random() * 3)],
      y: -20,
      r: 12
    });
  }

  obstacles.forEach(o => o.y += speed * dt * 0.75);
  collectibles.forEach(s => s.y += speed * dt * 0.75);

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];

    if (o.y > 480 && o.y < 555 && Math.abs(o.x - laneX[lane]) < 35) {
      lives--;
      speed = 45;
      obstacles.splice(i, 1);

      if (lives <= 0) {
        updateHUD();
        endRace("CRASHED! NO LIVES LEFT.");
        return;
      }
    } else if (o.y > 670) {
      obstacles.splice(i, 1);
    }
  }

  for (let i = collectibles.length - 1; i >= 0; i--) {
    const s = collectibles[i];

    if (s.y > 480 && s.y < 555 && Math.abs(s.x - laneX[lane]) < 35) {
      stars++;
      collectibles.splice(i, 1);
    } else if (s.y > 670) {
      collectibles.splice(i, 1);
    }
  }

  updateHUD();

  if (multiplayer && socket && now - lastReport > 500) {
    lastReport = now;
    socket.emit("race-progress", { stars, distance });
  }

  if (distance >= FINISH_DISTANCE) {
    endRace("FINISH LINE! RACE COMPLETED!");
    return;
  }

  render();
}

// Navigation
$("startBtn").onclick = () => {
  multiplayer = false;
  inRoom = false;
  $("lobbyContinue").classList.add("hidden");
  prepareCar();
  showScreen("customize");
};

$("lobbyBtn").onclick = () => {
  multiplayer = true;
  inRoom = false;
  $("lobbyContinue").classList.remove("hidden");
  prepareCar();
  showScreen("customize");
};

$("soloBtn").onclick = () => {
  multiplayer = false;
  inRoom = false;
  startRace();
};

$("lobbyContinue").onclick = () => {
  prepareCar();
  showScreen("lobby");
  $("roomStatus").textContent =
    "Enter a room name to create or join a race.";
};
$("customBack").onclick = () => showScreen("menu");
$("tutorialBtn").onclick = () => showScreen("tutorial");
$("settingsBtn").onclick = () => showScreen("settings");
$("tutorialBack").onclick = () => showScreen("menu");
$("settingsBack").onclick = () => showScreen("menu");

$("carName").oninput = prepareCar;
$("carColor").oninput = prepareCar;

$("createBtn").onclick = () => {
  if (!socket) {
    $("roomStatus").textContent = "Multiplayer server unavailable.";
    return;
  }

  prepareCar();
  const roomName = $("roomName").value.trim();

  if (!roomName) {
    $("roomStatus").textContent = "Please enter a room name.";
    return;
  }

  $("roomStatus").textContent = "Connecting to room...";
  socket.emit("join-room", { roomName, carName, color: carColor });
};

$("lobbyBack").onclick = () => {
  if (socket && inRoom) socket.disconnect();
  inRoom = false;
  if (socket) socket.connect();
  showScreen("menu");
};

// Multiplayer events
if (socket) {
  socket.on("connect", () => {
    $("connection").textContent = "SERVER CONNECTED";
  });

  socket.on("disconnect", () => {
    $("connection").textContent = "RECONNECTING...";
  });

  socket.on("room-error", message => {
    $("roomStatus").textContent = message;
  });

  socket.on("room-update", data => {
    inRoom = true;
    $("roomStatus").textContent =
      `Room: ${data.roomName} · ${data.players.length}/2 players`;

    $("players").innerHTML = "";
    data.players.forEach(player => {
      const li = document.createElement("li");
      li.textContent = `${player.carName} — ${player.id === socket.id ? "YOU" : "OPPONENT"}`;
      $("players").appendChild(li);
    });

    showScreen("lobby");
  });

  socket.on("race-start", () => {
    multiplayer = true;
    inRoom = true;
    startRace();
  });

  socket.on("progress-update", data => {
    opponentData = data.players;
  });

  socket.on("opponent-left", () => {
    $("raceMessage").textContent = "OPPONENT LEFT THE GAME.";
  });
}

// Controls
function moveLeft() {
  if (running && !paused) lane = Math.max(0, lane - 1);
}
function moveRight() {
  if (running && !paused) lane = Math.min(2, lane + 1);
}

$("leftBtn").onclick = moveLeft;
$("rightBtn").onclick = moveRight;

document.addEventListener("keydown", e => {
  if (["ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  if (e.repeat) return;

  if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") moveLeft();
  if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") moveRight();
  if (e.key === " ") accelerating = true;
});

document.addEventListener("keyup", e => {
  if (e.key === " ") accelerating = false;
});

const accel = $("accelerate");
accel.addEventListener("pointerdown", e => {
  e.preventDefault();
  if (running && !paused) accelerating = true;
});
["pointerup", "pointercancel", "lostpointercapture"].forEach(event => {
  accel.addEventListener(event, () => accelerating = false);
});

$("pauseBtn").onclick = () => {
  if (!running) return;

  paused = !paused;
  accelerating = false;

  $("pauseBtn").textContent = paused ? "RESUME" : "PAUSE";

  if (!paused) {
    lastTime = performance.now();
  }
};

$("restartBtn").onclick = () => {
  if (multiplayer && inRoom) {
    $("raceMessage").textContent = "Return home and join a new room to race again.";
    return;
  }
  startRace();
};

$("homeBtn").onclick = () => {
  running = false;
  accelerating = false;
  multiplayer = false;
  if (socket && inRoom) socket.disconnect();
  inRoom = false;
  if (socket) socket.connect();
  $("accelerate").textContent = "HOLD TO ACCELERATE";
  showScreen("menu");
};

// Initial preview
prepareCar();
$("lobbyContinue").classList.add("hidden");
render();
