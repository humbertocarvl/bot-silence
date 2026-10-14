# Silence — Painel de Eventos

Aplicativo desktop estreito e sempre visível que autentica pela API do Silence.
A chave Wired do Habbo nunca é enviada ao aplicativo.

## Executar em desenvolvimento

```powershell
cd desktop
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Na primeira tela, informe a URL pública HTTPS do serviço Railway e o código de
uso único recebido por DM do bot.

## Personalização

As cores, fontes, bordas e botões ficam em `theme.qss`. Alterar esse arquivo não
exige mudanças na lógica do aplicativo.
