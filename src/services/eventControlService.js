const { EventAccessError } = require('./eventAccessService');
const {
  findUserVariableHolder,
  listRoomVariables,
  patchFurniVariablesProfile,
  setGlobalVariable,
  setUserVariable,
  WiredServiceError,
} = require('./wiredService');

let furniVariablesCache = { expiresAt: 0, names: [] };
let userVariablesCache = { expiresAt: 0, names: [] };

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

async function setMarathon(value) {
  validateIntegerOption(value, 1, 'invalid_marathon', 'Estado da Maratona inválido.');
  return setGlobalControl('maratona', value);
}

async function setTeleportGame(value) {
  validateIntegerOption(
    value,
    2,
    'invalid_teleport_game',
    'Opção de teletransporte inválida.',
  );
  return setGlobalControl('tj', value);
}

async function setMoveUser(habboUniqueId, habboUsername, value) {
  validateIntegerOption(
    value,
    3,
    'invalid_move_user',
    'Destino do usuário inválido.',
  );
  if (typeof habboUniqueId !== 'string' || !/^hh/i.test(habboUniqueId.trim())) {
    throw new EventAccessError(
      'invalid_habbo_user',
      'ID único do Habbo da sessão inválido.',
      400,
    );
  }

  const variableName = process.env.WIRED_MOVE_USER_VARIABLE?.trim() || 'mover_usuario';
  const roomUserVariable =
    process.env.WIRED_ROOM_USER_VARIABLE?.trim() || 'usuario_no_quarto';
  const startedAt = Date.now();
  await ensureUserVariableConfigured(variableName);
  const holder = await findUserVariableHolder(
    roomUserVariable,
    habboUniqueId,
    habboUsername,
  );
  const userId = holder?.id;
  if (!Number.isInteger(userId) || userId < 0) {
    throw new WiredServiceError(
      `A API Wired não retornou o ID interno de ${habboUniqueId}.`,
      502,
      'wired.variables.invalid_user_profile',
    );
  }
  await setUserVariable(variableName, userId, value);
  return {
    value,
    user_unique_id: habboUniqueId,
    user_id: userId,
    duration_ms: Date.now() - startedAt,
  };
}

async function ensureUserVariableConfigured(variableName) {
  if (Date.now() >= userVariablesCache.expiresAt) {
    const variables = await listRoomVariables();
    userVariablesCache = {
      expiresAt: Date.now() + 60_000,
      names: variables.users,
    };
  }
  if (!userVariablesCache.names.includes(variableName)) {
    throw new WiredServiceError(
      `A variável de usuário "${variableName}" não está disponível na API Wired. ` +
        'Configure-a no complemento Web API do quarto e tente novamente.',
      404,
      'wired.variables.not_found',
    );
  }
}

async function setGlobalControl(variableName, value) {
  const startedAt = Date.now();
  await setGlobalVariable(variableName, String(value));
  return { value, duration_ms: Date.now() - startedAt };
}

function validateIntegerOption(value, maximum, code, message) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new EventAccessError(code, message, 400);
  }
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

module.exports = {
  TEAM_FURNI,
  setLivesForAll,
  setMarathon,
  setMoveUser,
  setOneWay,
  setRestaOne,
  setTeamLives,
  setTeleportGame,
};
