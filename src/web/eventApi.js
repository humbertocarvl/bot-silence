const express = require('express');
const {
  EventAccessError,
  authenticateSession,
  redeemAuthorizationCode,
  releaseSession,
} = require('../services/eventAccessService');
const { WiredServiceError, executeTestCommand } = require('../services/wiredService');

const router = express.Router();

router.post('/auth/redeem', async (req, res) => {
  try {
    const session = await redeemAuthorizationCode(req.body?.code);
    return res.json({
      access_token: session.accessToken,
      token_type: 'Bearer',
      expires_in: session.expiresIn,
      user: {
        discord_id: session.discordId,
        habbo_username: session.habboUsername,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/heartbeat', requireSession({ renew: true }), async (req, res) => {
  return res.json({ ok: true, expires_at: req.eventSession.expires_at });
});

router.post('/command', requireSession({ renew: true }), async (req, res) => {
  try {
    if (req.body?.command !== 'test') {
      return res.status(400).json({ error: 'unknown_command', message: 'Comando desconhecido.' });
    }

    const result = await executeTestCommand();
    return res.json({ ok: true, command: 'test', wired: result });
  } catch (error) {
    return sendError(res, error);
  }
});

router.post('/logout', async (req, res) => {
  const token = getBearerToken(req);
  if (token) await releaseSession(token).catch(() => {});
  return res.status(204).send();
});

function requireSession(options) {
  return async (req, res, next) => {
    try {
      const token = getBearerToken(req);
      if (!token) {
        throw new EventAccessError('missing_session', 'Sessão não informada.', 401);
      }
      req.eventSession = await authenticateSession(token, options);
      req.eventToken = token;
      return next();
    } catch (error) {
      return sendError(res, error);
    }
  };
}

function getBearerToken(req) {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  return authorization.slice(7).trim();
}

function sendError(res, error) {
  if (error instanceof EventAccessError || error instanceof WiredServiceError) {
    const body = { error: error.code || 'request_failed', message: error.message };
    if (error.details) body.details = error.details;
    return res.status(error.status || 400).json(body);
  }

  console.error('Erro na API do painel de eventos:', error);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Erro interno ao processar a solicitação.',
  });
}

module.exports = { eventApiRouter: router };
