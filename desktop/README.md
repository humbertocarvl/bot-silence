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

Após autenticar, escolha entre **Nova edição** e **Continuar edição atual**.

Ao criar uma nova edição, o painel lê a variável global `edicao`, soma `1` e
atualiza `edicao` e `modalidade` juntas. As modalidades usam estes valores:

- Quarteto: `0`
- Trio: `1`
- Dupla: `2`
- Normal: `3`

Continuar a edição atual não altera nenhuma variável.

## Personalização

As cores, fontes, bordas e botões ficam em `theme.qss`. Alterar esse arquivo não
exige mudanças na lógica do aplicativo.
