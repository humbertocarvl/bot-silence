const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Gera um código de verificação no formato SLNC-XXXXXX
 * (prefixo fixo + 6 caracteres alfanuméricos maiúsculos)
 */
function generateCode() {
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return `SLNC-${suffix}`;
}

module.exports = { generateCode };
