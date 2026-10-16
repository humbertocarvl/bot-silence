const axios = require('axios');
const https = require('https');

// Reutiliza a conexão TLS com o Habbo. Em runtimes Node 18 isso evita um novo
// handshake HTTPS a cada leitura/atualização.
const wiredHttp = axios.create({
  timeout: 10_000,
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
});

class WiredServiceError extends Error {
  constructor(message, status = 502, details = null) {
    super(message);
    this.name = 'WiredServiceError';
    this.status = status;
    this.details = details;
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new WiredServiceError(`A variável ${name} não está configurada.`, 503);
  }
  return value;
}

function getWiredBaseUrl() {
  return (process.env.HABBO_WIRED_BASE_URL || 'https://www.habbo.com.br/api/public').replace(
    /\/$/,
    '',
  );
}

function getRoomId() {
  const roomId = requireEnv('HABBO_WIRED_ROOM_ID');
  if (!/^\d+$/.test(roomId)) {
    throw new WiredServiceError('HABBO_WIRED_ROOM_ID precisa ser um ID numérico.', 503);
  }
  return roomId;
}

function getGlobalVariableUrl(variableName) {
  return (
    `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables/global/` +
    encodeURIComponent(variableName)
  );
}

function translateAxiosError(error, action) {
  const status = error.response?.status;
  const wiredCode = error.response?.data?.error;

  if (status === 429) {
    return new WiredServiceError('O limite de requisições Wired foi atingido.', 429, wiredCode);
  }
  if (status === 403 && wiredCode === 'wired.variables.user_not_participating') {
    return new WiredServiceError(
      'O usuário não está participando do quarto do evento. Entre no quarto e tente novamente.',
      403,
      wiredCode,
    );
  }
  if (status === 401 || status === 403) {
    return new WiredServiceError(
      'A API Wired recusou a operação. Verifique as chaves e se a API está habilitada.',
      502,
      wiredCode,
    );
  }
  if (status === 404) {
    if (wiredCode === 'wired.variables.not_found') {
      return new WiredServiceError(
        `A variável Wired não está configurada no quarto durante a ${action}.`,
        404,
        wiredCode,
      );
    }
    if (wiredCode === 'wired.variables.entity_not_found') {
      return new WiredServiceError(
        `O alvo Wired não foi encontrado no quarto durante a ${action}.`,
        404,
        wiredCode,
      );
    }
    if (wiredCode === 'room.not_found') {
      return new WiredServiceError(
        `O quarto configurado não foi encontrado durante a ${action}.`,
        404,
        wiredCode,
      );
    }
    return new WiredServiceError(
      `O quarto, a variável ou o alvo não foi encontrado durante a ${action}.`,
      404,
      wiredCode,
    );
  }
  if (status) {
    const suffix = wiredCode ? `: ${wiredCode}` : '';
    return new WiredServiceError(
      `A API Wired recusou a ${action} (HTTP ${status}${suffix}).`,
      status >= 500 ? 502 : status,
      error.response?.data || wiredCode,
    );
  }
  if (error.code === 'ECONNABORTED') {
    return new WiredServiceError('A API Wired excedeu o tempo limite da requisição.', 504);
  }
  const networkCode = error.code ? ` (${error.code})` : '';
  return new WiredServiceError(
    `Não foi possível comunicar com a API Wired${networkCode}.`,
    502,
    error.code || null,
  );
}

async function getGlobalVariable(variableName) {
  const readKey = requireEnv('HABBO_WIRED_READ_KEY');
  try {
    const response = await wiredHttp.get(getGlobalVariableUrl(variableName), {
      headers: { 'X-Wired-Read-Key': readKey },
    });
    return response.data;
  } catch (error) {
    throw translateAxiosError(error, 'leitura');
  }
}

async function listRoomVariables() {
  const readKey = requireEnv('HABBO_WIRED_READ_KEY');
  const url = `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables`;
  try {
    const response = await wiredHttp.get(url, {
      headers: { 'X-Wired-Read-Key': readKey },
    });
    return {
      users: Array.isArray(response.data?.users) ? response.data.users : [],
      furni: Array.isArray(response.data?.furni) ? response.data.furni : [],
      global: Array.isArray(response.data?.global) ? response.data.global : [],
    };
  } catch (error) {
    throw translateAxiosError(error, 'listagem');
  }
}

async function setGlobalVariable(variableName, value) {
  const writeKey = requireEnv('HABBO_WIRED_WRITE_KEY');

  if (!/^-?\d+$/.test(String(value))) {
    throw new WiredServiceError('O valor Wired precisa ser um número inteiro.', 400);
  }

  try {
    const response = await wiredHttp.patch(
      getGlobalVariableUrl(variableName),
      { value: String(value) },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Wired-Write-Key': writeKey,
        },
      },
    );
    return response.data;
  } catch (error) {
    throw translateAxiosError(error, 'atualização');
  }
}

async function patchGlobalVariables(variables) {
  const writeKey = requireEnv('HABBO_WIRED_WRITE_KEY');
  const normalized = {};
  for (const [name, value] of Object.entries(variables || {})) {
    if (!name || !/^-?\d+$/.test(String(value))) {
      throw new WiredServiceError('Uma variável Wired possui valor inválido.', 400);
    }
    normalized[name] = String(value);
  }
  if (Object.keys(normalized).length === 0) {
    throw new WiredServiceError('Nenhuma variável Wired foi informada.', 400);
  }

  const url = `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables_profile/global`;
  try {
    const response = await wiredHttp.patch(
      url,
      { variables: normalized },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Wired-Write-Key': writeKey,
        },
      },
    );
    return response.data;
  } catch (error) {
    throw translateAxiosError(error, 'atualização do perfil global');
  }
}

async function patchFurniVariablesProfile(targetKind, furniId, variables) {
  const writeKey = requireEnv('HABBO_WIRED_WRITE_KEY');
  if (!['furni', 'furni-bc'].includes(targetKind) || !/^\d+$/.test(String(furniId))) {
    throw new WiredServiceError('O tipo ou ID do mobi Wired é inválido.', 400);
  }

  const normalized = {};
  for (const [name, value] of Object.entries(variables || {})) {
    if (!name || !/^-?\d+$/.test(String(value))) {
      throw new WiredServiceError('Uma variável de mobi possui valor inválido.', 400);
    }
    normalized[name] = String(value);
  }
  if (Object.keys(normalized).length === 0) {
    throw new WiredServiceError('Nenhuma variável de mobi foi informada.', 400);
  }

  const url =
    `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables_profile/furni/` +
    `${encodeURIComponent(targetKind)}/${encodeURIComponent(String(furniId))}`;
  try {
    const response = await wiredHttp.patch(
      url,
      { variables: normalized },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Wired-Write-Key': writeKey,
        },
      },
    );
    return response.data;
  } catch (error) {
    throw translateAxiosError(error, `atualização do mobi ${furniId}`);
  }
}

async function findUserVariableHolder(variableName, uniqueId, username) {
  const readKey = requireEnv('HABBO_WIRED_READ_KEY');
  if (typeof variableName !== 'string' || !variableName.trim()) {
    throw new WiredServiceError('O nome da variável de usuário é inválido.', 400);
  }
  if (typeof uniqueId !== 'string' || !/^hh/i.test(uniqueId.trim())) {
    throw new WiredServiceError('O ID único do usuário Wired é inválido.', 400);
  }

  const url =
    `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables_profile/user/users`;
  const lookups = [{ unique_id: uniqueId.trim() }];
  if (typeof username === 'string' && username.trim()) {
    lookups.push({ name: username.trim() });
  }

  for (let lookupIndex = 0; lookupIndex < lookups.length; lookupIndex += 1) {
    const params = lookups[lookupIndex];
    let response;
    try {
      response = await wiredHttp.get(url, {
        params,
        headers: { 'X-Wired-Read-Key': readKey },
      });
    } catch (error) {
      // O nome serve como segunda forma de localizar o mesmo perfil quando o
      // unique_id salvo na vinculação estiver desatualizado ou for rejeitado.
      const canTryName =
        lookupIndex < lookups.length - 1 &&
        [400, 404].includes(error.response?.status);
      if (canTryName || error.response?.status === 404) continue;
      throw translateAxiosError(error, `leitura do perfil de ${username || uniqueId}`);
    }

    const holder = normalizeUserVariableHolder(response.data?.user);
    if (!holder) {
      throw new WiredServiceError(
        'A API Wired retornou um perfil sem o ID interno do usuário.',
        502,
        'wired.variables.invalid_user_profile',
      );
    }

    const variables = response.data?.variables;
    const isInRoomVariable =
      variables &&
      typeof variables === 'object' &&
      Object.prototype.hasOwnProperty.call(variables, variableName.trim());
    if (isInRoomVariable) return holder;

    break;
  }

  throw new WiredServiceError(
    `O usuário ${username || uniqueId} não consta na variável ` +
      `"${variableName}" do quarto.`,
    404,
    'wired.variables.entity_not_found',
  );
}

function normalizeUserVariableHolder(item) {
  if (!item || typeof item !== 'object') return null;

  // A listagem da API já retornou estes dados tanto diretamente no item
  // quanto dentro do objeto da entidade. O perfil deve usar o ID numérico
  // interno, nunca o unique_id (hh...).
  const nested = [item.user, item.target, item.entity, item.holder].find(
    (candidate) => candidate && typeof candidate === 'object',
  );
  const entity = nested || item;
  const rawId =
    entity.id ??
    entity.user_id ??
    entity.userId ??
    entity.entity_id ??
    entity.entityId ??
    item.id ??
    item.user_id ??
    item.userId ??
    item.target_id ??
    item.targetId;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 0) return null;

  return {
    id,
    name: String(
      entity.name ?? entity.username ?? item.name ?? item.username ?? item.target_name ?? '',
    ).trim(),
    uniqueId: String(
      entity.unique_id ??
        entity.uniqueId ??
        item.unique_id ??
        item.uniqueId ??
        item.target_unique_id ??
        '',
    ).trim(),
  };
}

async function patchUserVariablesProfile(userId, variables) {
  const writeKey = requireEnv('HABBO_WIRED_WRITE_KEY');
  if (!/^\d+$/.test(String(userId))) {
    throw new WiredServiceError('O ID interno do usuário Wired é inválido.', 400);
  }

  const normalized = {};
  for (const [name, value] of Object.entries(variables || {})) {
    if (!name || !/^-?\d+$/.test(String(value))) {
      throw new WiredServiceError('Uma variável de usuário possui valor inválido.', 400);
    }
    normalized[name] = String(value);
  }
  if (Object.keys(normalized).length === 0) {
    throw new WiredServiceError('Nenhuma variável de usuário foi informada.', 400);
  }

  const url =
    `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables_profile/user/users/` +
    encodeURIComponent(String(userId));
  try {
    const response = await wiredHttp.patch(
      url,
      { variables: normalized },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Wired-Write-Key': writeKey,
        },
      },
    );
    return response.data;
  } catch (error) {
    throw translateAxiosError(error, `atualização do usuário ${userId}`);
  }
}

async function setUserVariable(variableName, userId, value) {
  const writeKey = requireEnv('HABBO_WIRED_WRITE_KEY');
  if (typeof variableName !== 'string' || !variableName.trim()) {
    throw new WiredServiceError('O nome da variável de usuário é inválido.', 400);
  }
  if (!/^\d+$/.test(String(userId))) {
    throw new WiredServiceError('O ID interno do usuário Wired é inválido.', 400);
  }
  if (!/^-?\d+$/.test(String(value))) {
    throw new WiredServiceError('O valor da variável de usuário é inválido.', 400);
  }

  const url =
    `${getWiredBaseUrl()}/rooms/${getRoomId()}/variables/user/` +
    `${encodeURIComponent(variableName.trim())}/users/${encodeURIComponent(String(userId))}`;
  try {
    const response = await wiredHttp.put(
      url,
      { value: String(value) },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Wired-Write-Key': writeKey,
        },
      },
    );
    return response.data;
  } catch (error) {
    throw translateAxiosError(error, `atribuição da variável ${variableName}`);
  }
}

async function incrementGlobalVariable(variableName) {
  const current = await getGlobalVariable(variableName);
  if (!/^-?\d+$/.test(String(current?.value))) {
    throw new WiredServiceError('A API Wired retornou um valor numérico inválido.', 502);
  }

  const previousValue = BigInt(current.value);
  const nextValue = previousValue + 1n;
  const maxInt64 = 9_223_372_036_854_775_807n;
  if (nextValue > maxInt64) {
    throw new WiredServiceError('A variável já atingiu o limite inteiro de 64 bits.', 409);
  }

  const updated = await setGlobalVariable(variableName, nextValue.toString());
  return {
    variable: variableName,
    previous_value: previousValue.toString(),
    value: String(updated?.value ?? nextValue),
    creation_time: updated?.creation_time,
    update_time: updated?.update_time,
  };
}

module.exports = {
  WiredServiceError,
  findUserVariableHolder,
  getGlobalVariable,
  incrementGlobalVariable,
  listRoomVariables,
  patchFurniVariablesProfile,
  patchGlobalVariables,
  patchUserVariablesProfile,
  setGlobalVariable,
  setUserVariable,
};
