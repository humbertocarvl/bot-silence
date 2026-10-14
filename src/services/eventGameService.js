const { EventAccessError } = require('./eventAccessService');
const { setGlobalVariable } = require('./wiredService');

const GAMES = Object.freeze([
  'fechar',
  'fuja',
  'massacre',
  'danger',
  'cruzamento',
  'cruza danger',
  'cruzamento 2.0',
  'pegue o drink',
  'fuja com assentos',
  'fuja 2.0',
  'fuja 3.0',
  'fujamento',
  'fujamento 3.0',
  'corra',
  'fuja roller',
  'coletivo',
  'queimada',
]);

async function changeGame(gameValue) {
  if (!Number.isInteger(gameValue) || gameValue < 0 || gameValue >= GAMES.length) {
    throw new EventAccessError('invalid_game', 'Jogo inválido.', 400);
  }

  const variableName = process.env.WIRED_GAME_VARIABLE?.trim() || 'jogo';
  const startedAt = Date.now();
  await setGlobalVariable(variableName, String(gameValue));
  return {
    game: GAMES[gameValue],
    game_value: gameValue,
    duration_ms: Date.now() - startedAt,
  };
}

async function setGameStatus(running) {
  if (typeof running !== 'boolean') {
    throw new EventAccessError('invalid_game_status', 'Status do jogo inválido.', 400);
  }

  const variableName = process.env.WIRED_GAME_STATUS_VARIABLE?.trim() || 'status_jogo';
  const value = running ? 1 : 0;
  const startedAt = Date.now();
  await setGlobalVariable(variableName, String(value));
  return {
    running,
    status_value: value,
    duration_ms: Date.now() - startedAt,
  };
}

module.exports = { GAMES, changeGame, setGameStatus };
