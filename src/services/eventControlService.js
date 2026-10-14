const { EventAccessError } = require('./eventAccessService');
const { batchSetFurniVariable, setGlobalVariable } = require('./wiredService');

const TEAM_FURNI = Object.freeze({
  preto: '2147418248',
  branco: '2147418249',
  vermelho: '2147418250',
  azul: '2147418251',
  rosa: '2147418254',
  verde: '2147418255',
});

async function setOneWay(value) {
  if (!Number.isInteger(value) || value < 0 || value > 2) {
    throw new EventAccessError('invalid_one_way', 'Estado do sentido único inválido.', 400);
  }

  const variableName = process.env.WIRED_ONE_WAY_VARIABLE?.trim() || 'sentido único';
  const startedAt = Date.now();
  await setGlobalVariable(variableName, String(value));
  return { value, duration_ms: Date.now() - startedAt };
}

async function setLivesForAll(value) {
  validateLives(value);
  return updateLives(
    Object.fromEntries(Object.values(TEAM_FURNI).map((furniId) => [furniId, value])),
  );
}

async function setTeamLives(team, value) {
  validateLives(value);
  const furniId = TEAM_FURNI[team];
  if (!furniId) {
    throw new EventAccessError('invalid_team', 'Time inválido.', 400);
  }
  const result = await updateLives({ [furniId]: value });
  return { ...result, team, furni_id: furniId };
}

async function updateLives(furniValues) {
  const variableName = process.env.WIRED_LIVES_VARIABLE?.trim() || 'vidas';
  const startedAt = Date.now();
  await batchSetFurniVariable(variableName, furniValues);
  return {
    value: Object.values(furniValues)[0],
    updated_count: Object.keys(furniValues).length,
    duration_ms: Date.now() - startedAt,
  };
}

function validateLives(value) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new EventAccessError('invalid_lives', 'O número de vidas deve estar entre 0 e 9.', 400);
  }
}

module.exports = { TEAM_FURNI, setLivesForAll, setOneWay, setTeamLives };
