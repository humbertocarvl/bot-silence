const { EventAccessError } = require('./eventAccessService');
const { getGlobalVariable, patchGlobalVariables } = require('./wiredService');

const MODALITIES = Object.freeze({
  quarteto: 0,
  trio: 1,
  dupla: 2,
  normal: 3,
});

async function startNewEdition(modalityName) {
  if (!Object.hasOwn(MODALITIES, modalityName)) {
    throw new EventAccessError('invalid_modality', 'Modalidade inválida.', 400);
  }

  const modality = MODALITIES[modalityName];
  const editionVariable = process.env.WIRED_EDITION_VARIABLE?.trim() || 'edicao';
  const modalityVariable = process.env.WIRED_MODALITY_VARIABLE?.trim() || 'modalidade';
  const startedAt = Date.now();
  const current = await getGlobalVariable(editionVariable);
  if (!/^-?\d+$/.test(String(current?.value))) {
    throw new EventAccessError(
      'invalid_edition_value',
      'A variável edicao não contém um número inteiro válido.',
      502,
    );
  }

  const nextEdition = BigInt(current.value) + 1n;
  if (nextEdition > 9_223_372_036_854_775_807n) {
    throw new EventAccessError('edition_overflow', 'O contador de edições atingiu o limite.', 409);
  }

  await patchGlobalVariables({
    [editionVariable]: nextEdition.toString(),
    [modalityVariable]: String(modality),
  });

  return {
    edition: nextEdition.toString(),
    modality: modalityName,
    modality_value: modality,
    duration_ms: Date.now() - startedAt,
  };
}

module.exports = { MODALITIES, startNewEdition };
