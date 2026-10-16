const { EventAccessError } = require('./eventAccessService');
const {
  listRoomVariables,
  patchFurniVariablesProfile,
  setGlobalVariable,
  WiredServiceError,
} = require('./wiredService');

let furniVariablesCache = { expiresAt: 0, names: [] };

const TEAM_FURNI = Object.freeze({
  // A API usa o BC ID exibido pelo visualizador, não o In-Game ID.
  // BC ID = In-Game ID - 2147418112.
  preto: '136',
  branco: '137',
  vermelho: '138',
  azul: '139',
  rosa: '142',
  verde: '143',
  amarelo: '34',
  bege: '33',
  roxo: '35',
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

async function setRestaOne(value) {
  if (!Number.isInteger(value) || value < 0 || value > 3) {
    throw new EventAccessError('invalid_resta_one', 'Opção do Resta 1 inválida.', 400);
  }

  const startedAt = Date.now();
  await setGlobalVariable('resta_1', String(value));
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
  await ensureFurniVariableConfigured(variableName);
  const teamByFurniId = Object.fromEntries(
    Object.entries(TEAM_FURNI).map(([team, furniId]) => [furniId, team]),
  );
  const entries = Object.entries(furniValues);
  const results = await Promise.allSettled(
    entries.map(([furniId, value]) =>
      patchFurniVariablesProfile('furni-bc', furniId, {
        [variableName]: value,
      }),
    ),
  );
  const failures = results
    .map((result, index) => ({ result, furniId: entries[index][0] }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ result, furniId }) => ({
      team: teamByFurniId[furniId] || 'desconhecido',
      furni_id: furniId,
      error: result.reason?.details || result.reason?.message || 'unknown_error',
    }));

  if (failures.length > 0) {
    const failedTargets = failures
      .map(({ team, furni_id: furniId, error }) => `${team} (${furniId}: ${error})`)
      .join(', ');
    throw new WiredServiceError(
      `A API Wired recusou: ${failedTargets}.`,
      502,
      failures,
    );
  }
  return {
    value: Object.values(furniValues)[0],
    updated_count: Object.keys(furniValues).length,
    duration_ms: Date.now() - startedAt,
  };
}

async function ensureFurniVariableConfigured(variableName) {
  if (Date.now() >= furniVariablesCache.expiresAt) {
    const variables = await listRoomVariables();
    furniVariablesCache = {
      expiresAt: Date.now() + 60_000,
      names: variables.furni,
    };
  }
  if (!furniVariablesCache.names.includes(variableName)) {
    const available = furniVariablesCache.names.length
      ? furniVariablesCache.names.join(', ')
      : 'nenhuma';
    throw new WiredServiceError(
      `A variável de mobi "${variableName}" não está disponível na API Wired. ` +
        `Variáveis de mobi disponíveis: ${available}.`,
      404,
      'wired.variables.not_found',
    );
  }
}

function validateLives(value) {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new EventAccessError('invalid_lives', 'O número de vidas deve estar entre 0 e 9.', 400);
  }
}

module.exports = { TEAM_FURNI, setLivesForAll, setOneWay, setRestaOne, setTeamLives };
