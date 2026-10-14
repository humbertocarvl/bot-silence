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
  if (status === 401 || status === 403) {
    return new WiredServiceError(
      'A API Wired recusou a operação. Verifique as chaves e se a API está habilitada.',
      502,
      wiredCode,
    );
  }
  if (status === 404) {
    return new WiredServiceError(
      `O quarto ou a variável global não foi encontrado durante a ${action}.`,
      404,
      wiredCode,
    );
  }
  return new WiredServiceError('Não foi possível comunicar com a API Wired.', 502, wiredCode);
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
  getGlobalVariable,
  incrementGlobalVariable,
  listRoomVariables,
  patchGlobalVariables,
  setGlobalVariable,
};
