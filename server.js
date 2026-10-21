
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomName, carName, color }) => {
    if (typeof roomName !== "string" ||
        typeof carName !== "string" ||
        typeof color !== "string") return;

    const room = roomName.trim().slice(0, 24);
    const name = carName.trim().slice(0, 20);

    if (!room || !name ||
        !/^#[0-9a-fA-F]{6}$/.test(color)) {
      socket.emit("room-error", "Enter a valid room and car name.");
      return;
    }

    let gameRoom = rooms.get(room);

    if (!gameRoom) {
      gameRoom = { players: new Map(), started: false };
      rooms.set(room, gameRoom);
    }

    if (gameRoom.started || gameRoom.players.size >= 2) {
      socket.emit("room-error", "That room is full or already racing.");
      return;
    }

    if (gameRoom.players.has(socket.id)) return;

    socket.join(room);
    socket.data.room = room;

    gameRoom.players.set(socket.id, {
      id: socket.id,
      carName: name,
      color,
      stars: 0,
      finished: false
    });

    io.to(room).emit("room-update", {
      roomName: room,
      players: [...gameRoom.players.values()]
    });

    if (gameRoom.players.size === 2) {
      gameRoom.started = true;
      io.to(room).emit("race-start");
    }
  });

  socket.on("race-progress", (progress) => {
    const room = socket.data.room;
    const gameRoom = rooms.get(room);

    if (!gameRoom || !gameRoom.started) return;

    const player = gameRoom.players.get(socket.id);
    if (!player || player.finished) return;

    if (!progress || !Number.isFinite(progress.stars) ||
        !Number.isFinite(progress.distance)) return;

    player.stars = Math.max(0, Math.min(999, progress.stars));
    player.distance = Math.max(
      player.distance || 0,
      Math.min(100000, progress.distance)
    );

    if (progress.finished === true) {
      player.finished = true;
    }

    io.to(room).emit("progress-update", {
      players: [...gameRoom.players.values()]
    });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    const gameRoom = rooms.get(room);

    if (!gameRoom) return;

    gameRoom.players.delete(socket.id);
    socket.to(room).emit("opponent-left");

    if (gameRoom.players.size === 0) {
      rooms.delete(room);
    } else {
      gameRoom.started = false;
      io.to(room).emit("room-update", {
        roomName: room,
        players: [...gameRoom.players.values()]
      });
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Racing Car Inc running on port ${PORT}`);
});
