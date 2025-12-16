const game = {
  particle: 0,
  production: 1
};

setInterval(() => {
  game.particle += game.production / 100;

  document.getElementById("text").textContent = Math.floor(game.particle);
}, 10);
