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

Na primeira tela, informe somente o código de uso único recebido por DM do bot.
A URL da API já está configurada no aplicativo como
`https://bot-silence-production.up.railway.app`.

Após autenticar, escolha entre **Nova edição** e **Continuar edição atual**.

Ao criar uma nova edição, o painel lê a variável global `edicao`, soma `1` e
atualiza `edicao` e `modalidade` juntas. As modalidades usam estes valores:

- Quarteto: `0`
- Trio: `1`
- Dupla: `2`
- Normal: `3`

Continuar a edição atual não altera nenhuma variável.

Dentro da edição, **Trocar de jogo** abre a lista de jogos e define diretamente
o valor da variável global `jogo`. Essa operação usa apenas uma chamada Wired.

O botão **Iniciar jogo** define `status_jogo = 1` e então muda para **Parar
jogo**, que define `status_jogo = 0`. Ao trocar de jogo, o botão retorna ao
estado **Iniciar jogo**.

## Personalização

As cores, fontes, bordas e botões ficam em `theme.qss`. Alterar esse arquivo não
exige mudanças na lógica do aplicativo.
