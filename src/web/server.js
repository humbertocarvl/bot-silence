const express = require('express');
const path = require('path');
const { eventApiRouter } = require('./eventApi');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use('/api/evento', eventApiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/terms', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

app.get('/privacy', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

function startWebServer() {
  app.listen(PORT, () => {
    console.log(`✅ Servidor web rodando na porta ${PORT}`);
  });
}

module.exports = { startWebServer };
