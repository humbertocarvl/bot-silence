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

Os três ícones compactos abaixo dos controles de jogo oferecem:

- **Sentido único:** define a variável global `sentido único` como `0`
  (fechado), `1` (aberto) ou `2` (abrir para uma pessoa).
- **Vidas:** altera a variável de mobi `vidas`. É possível definir `3` ou `0`
  para os nove times de uma vez, ou escolher um time e informar de `0` a `9`
  vidas pelos botões de menos/mais.
- **Resta 1:** define a variável global `resta_1` como `0` (resetar), `1`
  (3 fileiras), `2` (2 fileiras) ou `3` (1 fileira).

Os botões de texto adicionais oferecem:

- **Maratona:** define a variável global `maratona` como `1` (começar) ou `0`
  (encerrar).
- **Teleportar para o jogo:** define a variável global `tj` como `0` (pisos
  para o Resta 1), `1` (teleportar ao jogo) ou `2` (teleportar ao Resta 1).

O ícone **Mover usuário** usa o ID único `hh...` do Habbo vinculado à sessão
ativa para localizar seu ID numérico interno no quarto. Em seguida, define a
variável de usuário `mover_usuario` como `0` (prova), `1` (Resta 1), `2` (fora)
ou `3` (hall do elenco). Esse nome pode ser personalizado no Railway com
`WIRED_MOVE_USER_VARIABLE`.

Os nomes podem ser personalizados no Railway com `WIRED_ONE_WAY_VARIABLE` e
`WIRED_LIVES_VARIABLE`. As vidas usam diretamente perfis de floor furni do
Clube do Arquiteto (`furni-bc`). Os nove perfis são atualizados em paralelo pela
rota de perfil de variáveis da API Wired.

Para mobis BC, a API recebe o **BC ID** mostrado pelo Visualizador de Variáveis,
e não o **In-Game ID**. Os IDs configurados são: preto `136`, branco `137`,
vermelho `138`, azul `139`, rosa `142`, verde `143`, amarelo `34`, bege `33` e
roxo `35`.

## Personalização

As cores, fontes, bordas e botões ficam em `theme.qss`. Alterar esse arquivo não
exige mudanças na lógica do aplicativo.
