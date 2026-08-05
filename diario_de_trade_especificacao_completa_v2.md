# Diário de Trade — Especificação Técnica Completa (v2)

**Versão documentada:** protótipo web (HTML/CSS/JS single-file), rodando como artifact com storage persistente por usuário, com fallback para `localStorage` quando executado como arquivo standalone no navegador.
**Propósito deste documento:** servir de blueprint completo e literal para reimplementação nativa (iOS, Android) e desktop (Windows/Mac/Linux), sem omitir nenhuma regra de negócio, campo, fórmula ou comportamento já validado no protótipo.

**Este documento substitui a v1.** As diferenças em relação à v1 estão concentradas em: identidade visual (seção 6), painel de localização/fuso horário via ícone de configuração (seção 5.9 e 4.9), cálculo de killzone por aritmética pura de UTC (seção 4.8, reescrita), e adaptador de armazenamento com fallback (seção 3). Toda a lógica financeira (fórmula R, capital por mês, migrações, impressão) é idêntica à v1 e permanece validada por 64 testes automatizados.

---

## 1. Visão geral do produto

Diário de trade para operações de **Cripto** e **Forex**, com:
- Controle de capital **por mês** (não um capital único global).
- Lançamento de operações com cálculo automático de resultado financeiro, baseado em **múltiplo de risco (R)** — não em estimativa manual.
- Filtro e navegação por **mês específico** ou **todos os meses somados**.
- Painel de resultados que alterna entre visão mensal (histórico) e visão diária (dentro do mês selecionado).
- Fita visual de operações (tape), gráfico de evolução de capital, tabela completa de operações com edição/exclusão.
- Geração de **relatório de impressão/PDF mês a mês** (nunca todos os meses juntos).
- Indicador de sessão de mercado (killzone ICT) com **régua visual de 24h**, calculado por aritmética pura de UTC a partir de um **fuso horário configurável pelo usuário** (cidade, estado, país, offset UTC), ajustável através de um ícone de engrenagem (⚙) que abre um modal — não fica exposto permanentemente na tela.
- Persistência de dados via API de armazenamento chave-valor (equivalente a um banco local por usuário), com fallback automático para `localStorage` do navegador quando essa API não está disponível.
- Instalável como **PWA** (ícone próprio, janela sem barra de navegador, uso offline) quando servido por HTTPS ou `http://localhost` — via `manifest.json` + service worker (`sw.js`). Abrindo o `index.html` direto por `file://`, o app funciona normalmente, só não fica instalável.

Idioma da interface: **Português (pt-BR)**, formatação de moeda `Intl.NumberFormat('pt-BR', {style:'currency', currency: 'BRL'|'USD'})`.

---

## 2. Modelo de dados

### 2.1 Objeto `Trade` (uma operação)

```ts
type Trade = {
  id: string;                 // gerado: timestamp base36 + string aleatória, ex: "mse1e1gux61qx"
  date: string;                // formato YYYY-MM-DD (input type="date")
  time: string;                 // formato HH:MM (input type="time"), pode ser vazio ""
  market: 'Cripto' | 'Forex';
  pair: string;                 // texto livre, ex: "BTCUSDT", "EURUSD"
  direction: 'Compra' | 'Venda';
  confluences: string[];        // subconjunto de: ["Captura de Liquidez","OB +","OB -","IDM"]
  tfMacro: string;               // um de: "", "H1", "M30", "M15", "M5"
  tfGatilho: string;              // um de: "", "M5", "M3", "M2", "M1"
  valorEntrada: string;           // valor numérico investido/arriscado na operação (string vinda do input, converter com parseFloat)
  entry: string;                  // preço de entrada (string numérica)
  stopPrice: string;               // preço de stop (string numérica)
  exit: string;                     // preço de saída (string numérica)
  resultMode: 'valor' | 'percentual'; // registros NOVOS sempre usam 'valor'; 'percentual' só existe em registros legados
  resultInput: number;                // para resultMode='valor': é o próprio ganho/perda em dinheiro (calculado por R, ver seção 4)
  notes: string;                       // observações, texto livre

  // Campos só presentes em registros migrados de versões antigas do app (compatibilidade):
  pctBasis?: 'entrada' | 'capital';     // usado apenas quando resultMode==='percentual'
  setupLegacy?: string;                  // texto livre do campo "Setup" antigo (antes de virar chips)
  stop?: string;                          // campo antigo, pré-existência do stopPrice (não usado em cálculo novo)
  pnl?: number;                            // campo antigo ainda mais primitivo (pré-existência do resultInput)
}
```

Campos **computados em tempo de leitura** (não são persistidos, são derivados sempre que os dados são carregados — ver `computeSeries()` na seção 4):
```ts
type TradeComputed = Trade & {
  pnlValor: number;        // resultado financeiro final da operação, em dinheiro
  balanceBefore: number;   // saldo de capital imediatamente antes desta operação
  balanceAfter: number;    // saldo de capital imediatamente depois desta operação
  result: 'Win' | 'Loss' | 'BE'; // derivado do sinal de pnlValor (>0, <0, ==0)
}
```

### 2.2 Objeto `CapitalConfig` (configuração de capital)

```ts
type CapitalConfig = {
  currency: 'BRL' | 'USD';         // moeda global de exibição (afeta fmtMoney em todo o app)
  defaultInitial: number;           // capital de fallback, usado apenas antes do primeiro mês configurado (compatibilidade com versões antigas)
  months: {
    // chave = "YYYY-MM"
    [monthKey: string]: { initial: number }
  }
}
```

### 2.3 Objeto `FilterConfig` (filtro persistido)

```ts
type FilterConfig = {
  market: 'Todos' | 'Cripto' | 'Forex';
  month: 'all' | string;   // 'all' = todos os meses somados; ou "YYYY-MM"
}
```

### 2.4 Objeto `LocationConfig` (localização/fuso horário de referência) — **NOVO na v2**

```ts
type LocationConfig = {
  city: string;      // ex: "Campo Grande" — texto livre, exibido no relógio do cabeçalho
  state: string;      // ex: "MS" — texto livre, opcional
  country: string;     // ex: "Brasil" — texto livre, opcional (não exibido na UI atualmente, mas persistido)
  offset: number;       // deslocamento em horas em relação a UTC, ex: -4 para Campo Grande. Aceita meias horas (ex: 5.5, -3.5)
}
```

Valor padrão (primeira execução, sem configuração salva): `{ city:'Campo Grande', state:'MS', country:'Brasil', offset:-4 }`.

Este objeto é editado **exclusivamente** através do modal aberto pelo ícone de engrenagem (⚙) no cabeçalho — nunca aparece como campos soltos na tela principal (ver seção 5.9).

---

## 3. Armazenamento (persistência)

O protótipo usa três camadas de armazenamento, verificadas **nesta ordem, a cada chamada** (não uma única vez na inicialização — checar só uma vez foi um bug real, ver seção 8, bug 3): **nuvem (Firebase)** → **`window.storage.get/set`** (ambiente artifact) → **`localStorage`** (fallback final, sempre gravado também como cache local mesmo quando a nuvem está disponível). Isso é resolvido por duas funções wrapper, `stGet(key)` e `stSet(key, value)`, em `storage.js`.

| Chave | Conteúdo | Escopo |
|---|---|---|
| `trades-data` | `JSON.stringify(Trade[])` — array completo de todas as operações | privado por usuário |
| `capital-config` | `JSON.stringify(CapitalConfig)` | privado por usuário |
| `filter-config` | `JSON.stringify(FilterConfig)` | privado por usuário |
| `location-config` | `JSON.stringify(LocationConfig)` | privado por usuário — **NOVO na v2** |

### 3.1 Sincronização entre aparelhos (Firebase Auth + Firestore) — **NOVO**

Para permitir usar o mesmo diário no computador e no celular com os mesmos dados, o protótipo ganhou uma camada de sincronização opcional em `cloud.js`:

- **Login ou cadastro obrigatório** (`js/cloud.js`): a tela é bloqueada por um overlay de e-mail/senha (`#authOverlay`) até o usuário autenticar via Firebase Authentication — com botões separados **"Entrar"** (`signInWithEmailAndPassword`) e **"Criar conta"** (`createUserWithEmailAndPassword`; cria e já autentica). Uma vez logado num aparelho, a sessão persiste (padrão do Firebase) — não precisa logar de novo a cada visita, só ao trocar de aparelho pela primeira vez ou depois de um "Sair" explícito.
- **`loadAll()` só roda depois que o estado de login resolve** (`auth.onAuthStateChanged`) — isso é crítico: se `loadAll()` rodasse antes, `stGet` ainda não saberia qual usuário está logado e cairia direto no `localStorage` local, ignorando a nuvem. Por isso a antiga chamada direta `loadAll()` em `init.js` foi removida; quem dispara `loadAll()` agora é o callback de autenticação em `cloud.js`, uma única vez por carregamento de página (guardado por uma flag `appStarted`).
- **`window.cloudGet(key)` / `window.cloudSet(key, value)`**: leem/gravam um único documento Firestore por usuário, em `users/{uid}`, com um campo por chave de armazenamento (mesmos 4 nomes da tabela acima). `stGet`/`stSet` (seção 3, `storage.js`) chamam essas funções como a primeira opção, quando existem (checagem via `typeof window.cloudGet === 'function'`, o mesmo padrão defensivo já usado para `window.storage`) — se falhar (offline, sem permissão, sem login), cai silenciosamente para as camadas seguintes.
- **Semeadura no primeiro login (`seedCloudIfEmpty`, em `cloud.js`):** no primeiro login de uma conta — quando o documento `users/{uid}` ainda não existe — o app copia para a nuvem o que já está salvo no `localStorage` **daquele aparelho**, antes de chamar `loadAll()`. Sem isso, um aparelho com dados só locais (nunca logado antes) simplesmente não aparece na nuvem até o usuário salvar alguma coisa nova — e o *outro* aparelho, ao logar na mesma conta, não vê nada. Isso só roda uma vez (quando o documento não existe); depois disso a nuvem é sempre a fonte de verdade.
- **Botão manual de reenvio** (`#forcePushBtn` no modal ⚙, ou o ícone 🔄 no cabeçalho — `#syncBtn`, seção 5.1 — mesma ação, dois pontos de acesso): sobrescreve incondicionalmente o documento na nuvem com os 4 valores atuais de `localStorage` deste aparelho, sem checar o que já está lá. É a válvula de escape manual para quando dois aparelhos ficaram com dados divergentes (ex.: um deles teve dados locais de antes da sincronização existir) — o usuário escolhe qual aparelho é "a verdade" e força o envio de lá.
- **Troca de conta limpa o `localStorage` (bug corrigido):** ao deslogar (`auth.onAuthStateChanged` resolvendo para `null`), `cloud.js` apaga as 4 chaves sincronizadas do `localStorage` deste aparelho e zera a flag `appStarted`. **Sem isso, criar ou entrar numa conta diferente continuava mostrando os dados da conta anterior** — porque `appStarted` impedia um novo `loadAll()`, e `seedCloudIfEmpty()` (item acima), ao rodar pra a conta nova, semeava a nuvem dela com o `localStorage` ainda sujo da conta antiga. Isso significa que **uma conta nova sempre começa vazia** — nunca herda dados de uma conta usada antes no mesmo aparelho/navegador.
- **Regras de segurança do Firestore (obrigatórias):** cada usuário só pode ler/escrever o próprio documento —
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- **Conflito entre aparelhos:** não há resolução de conflito nem merge campo-a-campo — é "o último a salvar vence" por chave (cada `stSet` sobrescreve o campo inteiro no Firestore). Isso é intencional e suficiente para o caso de uso (uma única pessoa, dois aparelhos, não editando ao mesmo tempo); não é uma solução multiusuário/colaborativa.
- Este é o único ponto do app que depende de rede para funcionar plenamente — sem Firestore acessível (offline, ou antes do login), o app continua funcionando normalmente só com `localStorage`, sem sincronizar.

**Para portar para mobile/desktop:** substituir por armazenamento local nativo:
- iOS: `UserDefaults` (se pequeno) ou arquivo JSON em `Documents/` (recomendado, já que o array de trades cresce) ou Core Data/SQLite se quiser queries mais robustas.
- Android: `DataStore`/`Room` (SQLite) — recomendado usar Room com uma tabela `trades`, uma tabela/registro único `capital_config`, uma tabela `filter_config` e uma tabela/registro `location_config`.
- Desktop (Electron/Tauri/.NET/Qt): arquivo JSON local (`%APPDATA%`/`~/.config`) ou SQLite embutido.

**Regra de migração obrigatória (replicar exatamente):**
1. Ao carregar `trades-data`, para cada trade:
   - Se `resultInput === undefined`: migrar de formato ainda mais antigo — `resultMode='valor'`, `resultInput = parseFloat(trade.pnl) || 0`.
   - Se `confluences === undefined`: setar `confluences=[]`, `tfMacro = tfMacro||''`, `tfGatilho = tfGatilho||''`, `setupLegacy = trade.setup||''` (preserva texto livre antigo do campo Setup).
   - Se `valorEntrada === undefined`: setar `valorEntrada=''`, e `pctBasis = (resultMode==='percentual') ? 'capital' : 'entrada'`. **Isso é crítico**: registros antigos com `resultMode:'percentual'` usavam "% sobre o capital corrente da conta" — ao mudar a lógica para "% sobre o valor de entrada da operação", os registros antigos DEVEM continuar calculando pela regra antiga (`pctBasis:'capital'`), senão o saldo histórico muda retroativamente.
2. Ao carregar `capital-config`:
   - Se o objeto já tem `months`: usar como está (formato atual).
   - Se tem `initial` mas não `months` (formato ainda mais antigo, capital único global): migrar para `{ currency, defaultInitial: initial, months: {} }`.
   - Se não existir nada: `{ currency:'USD', defaultInitial:0, months:{} }`.
3. Ao carregar `location-config`:
   - Se existir, mesclar com o padrão (`{...padrao, ...salvo}`) para tolerar versões futuras com campos adicionais.
   - Se não existir: usar o padrão `{ city:'Campo Grande', state:'MS', country:'Brasil', offset:-4 }`.

**Não há mais seed automático de operação de exemplo.** Uma instalação nova começa com a tabela de operações vazia (o seed pontual de uma operação NZDUSD existia apenas em uma sessão específica de desenvolvimento e foi removido da v2 — não deve ser reintroduzido em uma nova instalação nativa).

---

## 4. Lógica de negócio (fórmulas exatas)

### 4.1 Cálculo do resultado de uma operação (múltiplo de risco — R)

Esta é a fórmula central do app, usada no formulário de nova operação para **calcular automaticamente** o campo "Valor de ganho". **Inalterada desde a v1.**

```
risco    = |preço_entrada − preço_stop|
movimento = (preço_saída − preço_entrada)          se direção == "Compra"
movimento = (preço_entrada − preço_saída)          se direção == "Venda"
R         = movimento / risco
valor_de_ganho = valor_de_entrada × R
```

Regras de validação:
- Se `risco == 0` (entrada == stop): cálculo inválido, exibir aviso "Preço de entrada e de stop não podem ser iguais (risco ficaria zero)." e não calcular.
- Se qualquer um dos 4 inputs (entrada, stop, saída, valor de entrada) não for número válido: exibir "Preencha entrada, stop, saída e valor de entrada para calcular automaticamente." e não calcular.
- O campo "Valor de ganho" é **recalculado automaticamente a cada input** nos campos entrada/stop/saída/valor-de-entrada/direção, mas **permanece editável manualmente** (o usuário pode sobrescrever, por exemplo para descontar comissões de corretora).

Casos de referência (validados por teste automatizado):
| Entrada | Stop | Saída | Direção | Valor investido | R | Valor de ganho |
|---|---|---|---|---|---|---|
| 1,30000 | 1,29500 | 1,29500 (= stop, stop cheio) | Compra | US$ 1.000 | **-1,00** | **-US$ 1.000,00** (perda total do valor investido) |
| 1,30000 | 1,29500 | 1,31000 | Compra | US$ 1.000 | **+2,00** | **+US$ 2.000,00** |
| 100 | 105 | 90 | Venda | US$ 1.000 | **+2,00** | **+US$ 2.000,00** (movimento invertido corretamente) |
| 100 | 105 | 105 (= stop) | Venda | US$ 1.000 | **-1,00** | **-US$ 1.000,00** |

`resultMode` é sempre gravado como `'valor'` para operações novas, e `resultInput` recebe o `valor_de_ganho` (já calculado ou manualmente ajustado).

### 4.2 Compatibilidade com registros legados (`resultMode === 'percentual'`)

Só se aplica a operações **antigas**, migradas de versões anteriores do app. Nunca gerado por operações novas. **Inalterado desde a v1.**

```
pct = resultInput / 100

se pctBasis == 'entrada' E valorEntrada é número válido > 0:
    pnlValor = valorEntrada × pct        // % sobre o valor investido nesta operação específica

senão (pctBasis == 'capital', ou ausente):
    pnlValor = saldo_antes_da_operação × pct    // % sobre o capital corrente da conta naquele momento
```

### 4.3 Cálculo do saldo de capital (compounding cronológico, com override por mês)

Esta é a lógica mais importante para a consistência de todo o app — chamada `computeSeries()`. **Inalterada desde a v1.**

```
1. Ordenar TODAS as operações por (data + hora) crescente.
2. balance = capitalConfig.defaultInitial (ou 0 se não definido)
3. appliedMonths = conjunto vazio
4. Para cada operação, em ordem cronológica:
     mesChave = operação.data.slice(0,7)   // "YYYY-MM"
     seConfigCapitalDoMes[mesChave] existe E mesChave NÃO está em appliedMonths:
         balance = configCapitalDoMes[mesChave].initial   // RESET do saldo para o valor configurado nesse mês
         adicionar mesChave a appliedMonths
     saldoAntes = balance
     pnlValor = (ver seção 4.1/4.2 conforme resultMode)
     balance = saldoAntes + pnlValor
     resultado = 'Win' se pnlValor>0, 'Loss' se pnlValor<0, senão 'BE'
     guardar {pnlValor, balanceBefore: saldoAntes, balanceAfter: balance, result}
```

**Ponto crítico de design:** o "reset" de saldo por mês só acontece **uma vez**, na primeira operação daquele mês (controlado pelo `Set appliedMonths`). Operações seguintes do mesmo mês continuam compondo normalmente a partir do saldo resultante. **Se um mês não tiver capital configurado, o saldo simplesmente continua de onde o mês anterior parou** (não há reset, não quebra a cadeia de composição).

### 4.4 Variação percentual (usada em vários lugares: readout global, tabela mensal, tabela diária)

```
variação% = ((saldo_final − saldo_inicial) / saldo_inicial) × 100
```
Se `saldo_inicial == 0`, retornar `0` (evitar divisão por zero).

### 4.5 Estatísticas agregadas (usadas em cards e relatório)

```
total_operações = tamanho da lista filtrada
wins   = contagem onde result == 'Win'
losses = contagem onde result == 'Loss'
taxa_de_acerto% = (wins / total_operações) × 100     (0 se total==0)
resultado_total = soma de pnlValor de todas as operações da lista
```

### 4.6 Agrupamento mensal vs. diário (painel "Resultados")

Regra de alternância (função `renderResults` → `renderMonthly`/`renderDaily`):
- Se o filtro de Mês estiver em `"all"` (Todos os meses): mostrar tabela **agrupada por mês** (uma linha por mês, ordenada do mais recente para o mais antigo), cabeçalho do painel = "Resultados mensais". Cada linha é clicável e, ao clicar, define o filtro de Mês para aquele mês específico.
- Se o filtro de Mês tiver um mês específico selecionado: mostrar tabela **agrupada por dia** (uma linha por dia daquele mês, ordenada do dia 1 ao último), cabeçalho do painel = `"Resultados — {Mês}/{Ano}"`.

Cada linha (mensal ou diária) contém: Operações (contagem), Acerto (%), Resultado (soma financeira), Variação (%), Saldo final.

O agrupamento **mensal** usa a lista filtrada apenas por **Mercado** (ignora o filtro de mês, propositalmente, para servir de índice geral). O agrupamento **diário** usa a lista filtrada por **Mercado + Mês** (a mesma lista mostrada na tabela de operações).

### 4.7 Fita de operações (tape)

Barra visual por operação, altura proporcional ao tamanho do ganho/perda relativo ao saldo antes da operação. **Inalterado desde a v1.**
```
altura_px = clamp(14, 56, |pnlValor| / saldoAntes × 400 + 14)   // se pnlValor==0, altura fixa = 20px
cor: verde-água (win) / coral (loss) / âmbar (BE)
```

### 4.8 Indicador de sessão / killzone — **REESCRITO na v2**, **tabela de sessões atualizada**

Na v1, o horário atual era obtido via `Intl.DateTimeFormat` com um fuso horário fixo (`America/Campo_Grande`), dependendo do banco de dados de fusos horários (IANA/tz) do navegador. Isso se mostrou **não confiável**: se o navegador/ambiente não resolvesse corretamente esse fuso, ou se o dispositivo estivesse configurado com outro fuso, o horário calculado saía incorreto — o que quebrava o indicador de killzone.

**A v2 elimina essa dependência**, usando **aritmética pura de UTC**, que todo motor JavaScript conhece nativamente (via `Date.prototype.getTimezoneOffset()`) sem depender de bases de dados de fuso horário nomeadas:

```
agora = new Date()
utc_ms = agora.getTime() + agora.getTimezoneOffset() * 60000   // hora UTC verdadeira, sempre correta
offset_configurado = locationConfig.offset   // em horas, ex: -4; suporta meias horas
ref_ms = utc_ms + offset_configurado * 3600000
hora_local_referencia = new Date(ref_ms)   // usar getUTCHours()/getUTCMinutes() para extrair hh/mm
```

As killzones são **sessões reais de mercado, fixas em horário UTC absoluto** — não são apenas blocos arbitrários de horas. **A tabela abaixo substitui a tabela original da v1/v2** (a nomenclatura antiga, com "Fechamento Londres", foi considerada confusa e substituída por uma tabela nova, sem lacunas — todo período do dia agora tem um nome, incluindo os antigos intervalos "fora de killzone", agora chamados "Pausa").

A tabela foi fornecida em **horário local de Campo Grande (UTC−4)** e convertida aqui para UTC puro (somando 4h a cada faixa), o que permite recalcular corretamente a killzone para **qualquer fuso horário de referência** que o usuário configure:

| Horário local (Campo Grande, UTC−4) | Faixa de horário (UTC) | Killzone |
|---|---|---|
| 00:00 – 02:59 | 04:00 – 06:59 | Pausa |
| 03:00 – 04:59 | 07:00 – 08:59 | Londres |
| 05:00 – 07:59 | 09:00 – 11:59 | Pausa |
| 08:00 – 11:59 | 12:00 – 15:59 | Londres/NY |
| 12:00 – 16:59 | 16:00 – 20:59 | NY |
| 17:00 – 18:59 | 21:00 – 22:59 | Pausa |
| 19:00 – 21:59 | 23:00 – 01:59 | Ásia/Tóquio |
| 22:00 – 23:59 | 02:00 – 03:59 | Pré Sydney |

**Sobreposição intencional:** a faixa local `17:00–19:00 Pausa` foi fornecida se sobrepondo ao fim de `12:00–18:00 NY` (a hora 17 local pertence às duas, conforme especificado). A regra de resolução é **a entrada listada por último vence** — por isso a hora local 17 (UTC 21) é `Pausa`, não `NY`. Isso é refletido literalmente na cadeia de `if/else` de `kzForUtcHour()` (seção 12, `killzone.js`): cada `if` é checado em ordem, e a primeira faixa (em ordem UTC crescente) que bate com a hora vence — não há tentativa de "consertar" a sobreposição.

Para obter a killzone na hora **local de referência** (a que o usuário configurou), converte-se primeiro para UTC:
```
utcHour = ((horaLocalReferencia − offset_configurado) % 24 + 24) % 24
killzone = tabela_utc[utcHour]
```

**Validação:** com `offset = -4` (Campo Grande, padrão), a função deve devolver exatamente os nomes da coluna "Killzone" acima para cada hora local 0–23 — foi conferido hora a hora nesta revisão (ver seção 12, `killzone.js`, para o código exato). Diferente das tabelas anteriores, esta não tem mais lacunas: todas as 24 horas têm um nome de sessão.

**Régua visual de 24h:** a régua é construída dinamicamente — para cada uma das 24 horas do dia (no fuso de referência configurado), calcula-se a killzone correspondente e agrupam-se horas consecutivas com o mesmo nome em um único bloco visual. Isso significa que a régua se redesenha automaticamente sempre que o usuário muda a localização/fuso configurado. Um marcador vertical luminoso ("agulha") indica a posição do horário atual dentro da régua de 24h, atualizado a cada 30 segundos (mesmo intervalo de atualização do relógio do cabeçalho).

### 4.9 Localização de referência (cidade, estado, país, fuso UTC) — **NOVO na v2**

- O usuário configura, através do modal de configuração (ícone ⚙ no cabeçalho — ver seção 5.9), os campos: Cidade, Estado, País (texto livre, usados apenas para exibição) e Fuso horário (offset numérico em relação a UTC, selecionável em incrementos de 30 minutos, de UTC−12:00 a UTC+14:00).
- Não há tratamento automático de horário de verão. Se o local do usuário observar horário de verão, o próprio usuário precisa ajustar manualmente o offset duas vezes por ano.
- Este objeto **não afeta nenhum cálculo financeiro** (capital, R, saldo) — impacta **apenas** a exibição do relógio e o cálculo/exibição da killzone.
- Padrão de fábrica: `{ city:'Campo Grande', state:'MS', country:'Brasil', offset:-4 }`.
- **Não usar `Intl.DateTimeFormat`/timezone nomeado (IANA) como mecanismo** de conversão — é exatamente o bug que a seção 4.8 já corrigiu uma vez (seção 8, bug 5). O offset numérico configurado aqui alimenta a aritmética pura de UTC usada pelo cálculo de killzone (seção 4.8).

---

## 5. Estrutura de telas / componentes

### 5.1 Cabeçalho
- Bloco de logo: ícone quadrado com gradiente (letra "R") + título "Diário de Trade" (com "de" em peso mais leve) + subtítulo "Cripto & Forex · capital, operações e performance".
- **Relógio de sessão** (`id="sessionBadge"`), à direita: mostra **horário atual + localização configurada (cidade, estado) + nome da killzone atual**, no formato `HH:MM · Cidade, Estado · NomeDaKillzone`, atualizado a cada 30 segundos. Este é o único lugar da tela principal (fora do modal de configuração) onde a localização aparece.
- **Botão "Sair"** (`id="signOutBtn"`) — encerra a sessão do Firebase (ver seção 3.1); ao deslogar, o `localStorage` local é limpo e a tela de login volta a aparecer.
- **Ícone de sincronização (🔄)** (`id="syncBtn"`) — atalho de acesso rápido para a mesma ação de "Enviar dados deste aparelho para a nuvem" que existe dentro do modal ⚙ (ver seção 5.9); mostra o resultado num `alert()` (sucesso ou erro), em vez da linha de status usada dentro do modal.
- **Ícone de engrenagem (⚙)** (`id="openSettingsBtn"`), ao lado do relógio: abre o modal de configuração de horário/localização (ver seção 5.9). Não exibe nenhum campo de formulário diretamente na tela — só o ícone, sempre visível e discreto.

### 5.2 Painel "Sessões de mercado" (régua de killzone)
- Título fixo: **"Sessões de mercado"** (sem cidade/estado/UTC — essa informação foi deliberadamente removida deste painel a pedido do usuário; só aparece no relógio do cabeçalho, seção 5.1).
- Régua horizontal de 24h com blocos coloridos por sessão (ver fórmula 4.8), marcador do horário atual, e régua de horas de referência (00h/04h/08h/12h/16h/20h/24h) abaixo.
- Rótulo `"agora · HH:MM"` no canto superior direito do painel.

### 5.3 Painel "Capital" (por mês)
Campos, nesta ordem:
1. **Mês** — `<input type="month">`, id `capMonth`. Ao mudar, recarrega os campos abaixo com a config salva daquele mês (se existir) ou limpa (se não existir). Inicializado com o mês atual do sistema.
2. **Capital inicial** — number, id `capitalInicial`, placeholder "Ex: 10000".
3. **Moeda** — select, id `moeda`, opções: `R$ (BRL)` / `US$ (USD)`. É uma configuração **global** (não por mês).
4. Botão **"Salvar capital"** / **"Editar"** (mesmo botão, texto e comportamento mudam de estado):
   - Estado "sem config salva para o mês selecionado": campos habilitados, botão diz "Salvar capital". Ao clicar: grava `capitalConfig.months[mesSelecionado] = {initial}`, grava `capitalConfig.currency`, desabilita os campos, muda botão para "Editar".
   - Estado "com config salva": campos **desabilitados** (travados), botão diz "Editar". Ao clicar: apenas destrava os campos (não salva ainda), muda botão de volta para "Salvar capital".
5. Readout (lado direito, sempre visível): **Capital atual** (saldo global, calculado sobre TODAS as operações, sem filtro) e **Variação total** (%, com cor verde se positivo/coral se negativo/âmbar se zero).

### 5.4 Painel "Filtro" (Mercado + Mês)
1. **Mercado** — select, id `filterMarket`: `Todos os mercados` / `Cripto` / `Forex`.
2. **Mês** — select, id `filterMonth`: primeira opção fixa `"Todos os meses (somado)"` (value=`all`), seguida de uma opção para cada mês distinto presente nas operações cadastradas (formato "Ago/2026", mais recente primeiro). **Esta lista é reconstruída automaticamente** toda vez que uma operação é criada, editada ou excluída.

Este filtro (Mercado + Mês) é persistido (`filter-config`) e restaurado automaticamente ao reabrir o app.

### 5.5 Cards de estatística (linha de 3 cards)
"Operações", "Taxa de acerto", "Wins / Losses" — sempre refletindo a lista já filtrada por Mercado + Mês. Visual com "cantos HUD" (bordas em L nos cantos superior-esquerdo e inferior-direito).

### 5.6 Fita de operações (tape)
Faixa horizontal com rolagem, uma barra colorida por operação (ver fórmula 4.7). Tooltip ao passar o mouse mostra par, data, resultado e valor.

### 5.7 Painel "Resultados" / "Resultados mensais" (dual-mode, ver 4.6)
Tabela + botão **"🖨️ Imprimir relatório do mês"** no cabeçalho do painel.

### 5.8 Botão de impressão — regras
- Ao clicar: **exige que um mês específico esteja selecionado** no filtro de Mês (não pode ser "Todos os meses"). Se estiver em "Todos os meses", exibe alerta bloqueando a ação: *"Selecione um mês específico no filtro 'Mês' acima para gerar o relatório. Não é possível imprimir todos os meses de uma vez."*
- Se não houver operações no mês/mercado filtrado, exibe alerta: *"Não há operações registradas em {mês} para o mercado selecionado."*
- Gera um relatório HTML (fundo branco, texto preto, específico para impressão) contendo:
  - Cabeçalho: "Relatório de Trade — {Mês}/{Ano}", subtítulo com mercado filtrado e data de geração.
  - Cards de resumo: Operações, Taxa de acerto, Wins/Losses, Resultado do mês, Variação no mês, Saldo final.
  - Tabela completa das operações do mês: Data, Mercado, Par, Direção, Valor investido, Entrada/Stop/Saída, P&L, Saldo após.
- Aciona a caixa de impressão nativa do navegador (equivalente nativo: gerar PDF via API do sistema operacional).

### 5.9 Modal de configuração de horário/localização (ícone ⚙) — **NOVO na v2**

Acionado pelo botão de engrenagem no cabeçalho (`id="openSettingsBtn"`). Fica **fechado por padrão** — não aparece a menos que o usuário clique no ícone.

Estrutura do modal (`id="settingsOverlay"` → `.modal-box`):
- Título: "Horário e localização".
- Botão de fechar (✕) no canto superior direito.
- Texto explicativo: "Usado para calcular corretamente as killzones de mercado no seu fuso horário."
- Grid de 4 campos (2 colunas em telas largas, 1 coluna em telas estreitas):
  1. **Cidade** — texto livre, placeholder "Ex: Campo Grande".
  2. **Estado** — texto livre, placeholder "Ex: MS".
  3. **País** — texto livre, placeholder "Ex: Brasil".
  4. **Fuso horário** — select com todas as opções de UTC−12:00 a UTC+14:00 em passos de 30 minutos, rotulado como `UTC±HH:MM`.
- Botões: **Cancelar** (fecha sem salvar, descartando qualquer edição feita) / **Salvar** (persiste em `location-config`, recalcula o relógio e a régua imediatamente, e fecha o modal).
- Abaixo dos botões, separado por uma linha divisória, uma seção **"Sincronização"** (ver seção 3.1): texto de aviso + botão **"Enviar dados deste aparelho para a nuvem"** (`id="forcePushBtn"`), que sobrescreve o documento Firestore do usuário logado com os 4 valores atuais de `localStorage` deste aparelho, e uma linha de status abaixo (`id="forcePushStatus"`) mostrando "Enviando...", sucesso ou erro.

Comportamentos obrigatórios:
- Ao **abrir**, os campos são sempre repopulados com o valor **atualmente salvo** (nunca com uma edição anterior descartada).
- **Cancelar** não persiste nada — reabrir o modal depois de cancelar mostra o valor salvo antigo, não o texto digitado e descartado.
- **Clicar fora da caixa** (na área escurecida ao redor) fecha o modal, com o mesmo efeito de "Cancelar".
- Tecla **Esc** também fecha o modal.
- **Salvar** fecha o modal automaticamente e atualiza o relógio do cabeçalho e a régua de killzone no mesmo instante (sem precisar recarregar a página).

### 5.10 Formulário "Nova operação" (colapsável)
Botão "+ Nova operação" abre/fecha o formulário. Campos, **nesta ordem exata**:

| # | Campo | Tipo | Obrigatório | Opções / observações |
|---|---|---|---|---|
| 1 | Data | date | sim | padrão = data atual ao abrir para nova operação |
| 2 | Hora | time | não | |
| 3 | Mercado | select | sim | `Cripto` / `Forex` |
| 4 | Par / Ativo | texto | sim | placeholder "BTCUSDT, EURUSD..." |
| 5 | Direção | select | sim | `Compra` / `Venda` |
| 6 | Setup (confluências) | chips multi-seleção (clique para ativar/desativar) | não | `Captura de Liquidez`, `OB +`, `OB -`, `IDM` |
| 7 | Time frame macro | select | não | vazio, `H1`, `M30`, `M15`, `M5` |
| 8 | Time frame micro (gatilho) | select | não | vazio, `M5`, `M3`, `M2`, `M1` |
| 9 | Preço de entrada | number | sim | |
| 10 | Preço de stop | number | sim | |
| 11 | Preço de saída | number | sim | |
| 12 | Valor de entrada (R$/US$ investido) | number | sim | placeholder "Ex: 500" |
| 13 | Valor de ganho — calculado automaticamente | number | sim | auto-preenchido pela fórmula da seção 4.1; editável |
| 14 | Observações | textarea (2 linhas) | não | |
| — | Linha de prévia (texto informativo, não é input) | — | — | mostra `R = X.XX → +/-valor sobre o valor de entrada`, ou mensagem de campo faltando |

Botões: **Cancelar** (reseta e fecha) / **Salvar operação** (texto muda para **Salvar edição** quando em modo de edição).

Banner amarelo "Editando operação existente — salve para atualizar ou cancele para descartar as alterações." aparece apenas durante edição — implementado como bloco HTML isolado (`.edit-banner`), sem compartilhar seletor CSS com os campos do formulário (ver bug de especificidade CSS corrigido na seção 8).

### 5.11 Tabela de operações
Colunas, nesta ordem: Data (+hora se houver), Mercado (badge colorido), Par, Direção, Setup (chips + linha "TFmacro → TFmicro"), Valor investido, "Entrada / Stop / Saída" (os 3 preços concatenados), P&L (colorido pelo resultado), Saldo após, Observações, Ações (botões Editar / Excluir).

Ordenação: mais recente primeiro (lista invertida cronologicamente).
Container com **rolagem horizontal própria** (`overflow-x:auto`) e largura mínima de 920px na tabela — não estoura o layout do card.

Estado vazio: mensagem convidando a clicar em "+ Nova operação".

### 5.12 Botões Editar / Excluir (por linha)
- **Editar:** popula todos os campos do formulário com os dados da operação, marca os chips de confluência correspondentes, abre o formulário, recalcula "Valor de ganho", rola a tela até o formulário.
- **Excluir:** remove a operação do array, salva, atualiza lista de meses disponíveis, re-renderiza tudo. Se a operação excluída era a que estava sendo editada, cancela a edição automaticamente.

### 5.13 Gráfico "Evolução do capital"
Gráfico de linha (Chart.js no protótipo web; usar biblioteca de gráfico nativa equivalente no app nativo — ex: Swift Charts no iOS, MPAndroidChart/Compose Charts no Android). Eixo X = datas das operações (mais um ponto inicial "Início"); eixo Y = saldo de capital em dinheiro. Usa a lista **filtrada** (Mercado+Mês) se houver operações nela; senão usa a série completa. **Importante:** o gráfico é isolado com tratamento de erro — se falhar ao renderizar, o resto da tela (estatísticas, tabela) continua funcionando normalmente (ver seção 8, bug corrigido e validado por teste automatizado simulando Chart.js indisponível).

---

## 6. Design system (tokens visuais) — **REESCRITO na v2 (identidade "cockpit noturno")**, **paleta atualizada (identidade "touro/urso")**

### Cores

Paleta derivada da identidade visual "IR Sem Medo" (pôster touro verde vs. urso vermelho sobre fundo preto): preto quase puro, verde neon (alta/touro) e vermelho neon (baixa/urso), texto branco/prata.

```css
--void:   #050505   /* fundo geral da página — preto quase puro */
--panel:  #0E0E10   /* fundo dos cards/painéis */
--raised: #18191B   /* fundo de inputs, hover de linhas de tabela */
--line:   #2B2D2F   /* bordas em geral */
--text:   #F2F3F0
--dim:    #8A8F8A
--pos:    #22E065   /* cor de destaque positivo (ganho/win) — verde touro */
--neg:    #FF3B4E   /* cor de destaque negativo (perda/loss) — vermelho urso */
--neu:    #C9CCC7   /* cor neutra/breakeven — prata, combina com o texto do logo */
--brand:  #22E065   /* verde touro, cor primária de marca */
--brand2: #FF3B4E   /* vermelho urso, cor secundária de marca */
```
Gradiente de marca: `linear-gradient(110deg, var(--brand), var(--brand2))` — usado no ícone de logo, botão primário e linhas divisórias sutis no topo de cada painel. O fundo da página reforça o mesmo tema com um brilho radial verde do lado esquerdo e vermelho do lado direito (ver seção "Layout" abaixo) — eco direto da composição touro-à-esquerda/urso-à-direita do pôster de referência.

**Nota de design:** `--brand`/`--brand2` (verde/vermelho) fazem dupla função como identidade visual *e* como semântica de dados (`--pos`/`--neg`), propositalmente — é a mesma dualidade touro/urso do pôster. Para não colidir com o vermelho de "perda/exclusão" em elementos que não são positivos nem negativos, dois ajustes deliberados em relação a um mapeamento 1:1 ingênuo dos tokens antigos: o botão "Editar" de cada linha da tabela e a tag de mercado "Cripto" usam `--brand` (verde) em vez de `--brand2` (vermelho), para não ficarem visualmente idênticos ao botão "Excluir"/badge de perda.

### Tipografia
- Display/headers: **Unbounded** (peso 500/700) — usado no logo, título do app, título do modal.
- Corpo/UI: **Sora** (pesos 400/500/600) — usado em todo o texto de interface, labels, inputs.
- Dados/números/monoespaçado: **JetBrains Mono** (pesos 400/500/600) — usado em valores monetários, datas, horários, chips de confluência.

### Layout e textura de fundo
- Largura máxima do conteúdo: 1140px, centralizado, padding 26px topo/20px laterais/90px base.
- Fundo da página com textura sutil: brilho radial verde (`--brand`) no canto superior esquerdo + brilho radial vermelho (`--brand2`) no canto superior direito, mais grade pontilhada de linhas finas repetidas a cada 44px (efeito "grid técnico").
- Cards (`.panel`, `.cp`) com `border-radius: 14px`, borda 1px sólida em `--line`, e uma linha de gradiente sutil de 1px no topo de cada card (efeito de "borda de circuito").
- Cards de estatística (`.stat-card`) têm decoração de "cantos HUD": bordas em L nos cantos superior-esquerdo (cor `--brand`) e inferior-direito (cor `--brand2`).
- Botão primário: fundo em gradiente de marca, texto quase-preto `#050810`, `border-radius:8px`.
- Botão secundário: transparente, borda `--line`.
- Tags de mercado: pílula colorida translúcida (verde para Cripto, prata para Forex).
- Ícone de engrenagem (⚙): botão circular discreto de 40×40px, gira levemente (efeito `rotate(35deg)`) e muda de cor no hover.
- Modal: overlay escurecido com leve desfoque (`backdrop-filter: blur(3px)`), caixa central com a mesma linguagem visual dos painéis (borda + linha de gradiente no topo).

### Impressão (relatório)
Tema completamente diferente (claro, não o tema escuro do app): fundo branco `#fff`, texto `#111`, positivo `#0a7a5f`, negativo `#b3261e`, tabelas com bordas finas cinza-claro `#ddd`, cabeçalhos com borda inferior grossa preta.

---

## 7. Fluxos de usuário (passo a passo)

### 7.1 Configurar capital de um mês novo
1. No painel "Capital", selecionar o Mês desejado.
2. Preencher Capital inicial e Moeda.
3. Clicar "Salvar capital" → campos travam, botão vira "Editar".

### 7.2 Registrar uma operação
1. Clicar "+ Nova operação".
2. Preencher Mercado, Par, Direção.
3. (Opcional) marcar confluências e time frames.
4. Preencher Entrada, Stop, Saída, Valor de entrada.
5. Conferir "Valor de ganho" calculado automaticamente (ajustar manualmente se necessário).
6. Preencher Observações (opcional).
7. Clicar "Salvar operação".

### 7.3 Editar uma operação existente
1. Na tabela, clicar "Editar" na linha desejada.
2. Formulário abre populado; banner de edição aparece.
3. Ajustar campos.
4. Clicar "Salvar edição" (substitui o registro original mantendo o mesmo `id`).

### 7.4 Consultar um mês específico
1. No filtro "Mês", selecionar o mês desejado (ou clicar numa linha da tabela "Resultados mensais").
2. Painel "Resultados" muda para visão diária daquele mês; estatísticas, fita, tabela e gráfico filtram para esse mês.
3. Selecionar "Todos os meses (somado)" para voltar à visão agregada.

### 7.5 Imprimir relatório de um mês
1. Selecionar o mês específico no filtro.
2. Clicar "🖨️ Imprimir relatório do mês".
3. Usar a caixa de diálogo de impressão do sistema para imprimir ou salvar como PDF.

### 7.6 Ajustar o fuso horário de referência (killzone) — **NOVO na v2**
1. Clicar no ícone de engrenagem (⚙) ao lado do relógio, no cabeçalho.
2. No modal, preencher Cidade, Estado, País (opcional/informativo) e selecionar o Fuso horário (UTC).
3. Clicar "Salvar" — o modal fecha e o relógio/régua de killzone já refletem a nova configuração imediatamente.
4. Para desistir de uma alteração, clicar em "Cancelar", no "✕", clicar fora da caixa, ou apertar Esc — nenhuma dessas ações persiste a mudança.

---

## 8. Bugs conhecidos já corrigidos (não reintroduzir)

1. **Ordem de renderização quebrava a tabela:** o gráfico (Chart.js) era renderizado *antes* da tabela de operações no pipeline de atualização da tela. Se a biblioteca do gráfico falhasse ao carregar (rede, bloqueio, sandbox), a função de renderização inteira abortava e a tabela nunca era atualizada — a operação ficava salva, mas não aparecia na tela. **Correção aplicada:** o gráfico é a **última** coisa renderizada, dentro de um `try/catch` isolado; falha no gráfico nunca impede a atualização de estatísticas/tabela/painéis. **Validado por teste automatizado que simula Chart.js ausente.**
2. **Referência a função removida:** ao remover o antigo seletor "% vs valor manual", um clique no botão "+ Nova operação" ainda chamava a função antiga `updatePreview()` (removida), quebrando a abertura do formulário. Corrigido para chamar a função de cálculo vigente.
3. **Storage com timing de inicialização incorreto (introduzido e corrigido na v2):** uma primeira tentativa de suportar `localStorage` como fallback verificava a disponibilidade de `window.storage` **uma única vez**, em um IIFE executado no momento do parse do script. Em certos ambientes, `window.storage` é injetado pelo host **depois** desse momento, fazendo a checagem falhar silenciosamente e o app cair em um armazenamento em memória que não persistia entre execuções — o sintoma percebido era "a operação não salva". **Correção aplicada:** as funções `stGet`/`stSet` verificam a disponibilidade de `window.storage` **a cada chamada**, nunca uma única vez na inicialização.
4. **Conflito de especificidade CSS no banner de edição (introduzido e corrigido na v2):** o banner "Editando operação existente" usava a mesma classe de layout dos campos do formulário (`.ff`), e um seletor mais específico (`form .ff`) sobrescrevia seu `display:none`, fazendo o banner aparecer **sempre**, mesmo ao criar uma operação nova. **Correção aplicada:** o banner tem uma classe própria (`.edit-banner`), sem overlap de seletor com `.ff`.
5. **Cálculo de killzone dependente do banco de fusos horários do navegador (introduzido e corrigido na v2):** a primeira versão do cálculo de killzone usava `Intl.DateTimeFormat` com timezone nomeado fixo (`America/Campo_Grande`). Isso podia falhar dependendo do navegador/ambiente. **Correção aplicada:** substituído por aritmética pura de UTC (seção 4.8), sem dependência de bases de dados de fuso horário nomeadas.

---

## 9. Considerações para portar para iOS / Android / Desktop

1. **Substituir `window.storage`/`localStorage`** por persistência nativa (SQLite/Room/CoreData/arquivo JSON local), mantendo exatamente o mesmo formato de dados (seção 2) e a mesma lógica de migração (seção 3), incluindo a nova chave `location-config`.
2. **Substituir Chart.js** por biblioteca de gráfico nativa (Swift Charts, MPAndroidChart/Vico, ou uma lib de canvas no desktop) — manter o mesmo eixo Y (saldo em dinheiro) e X (data). Manter o isolamento de falha (bug 1 da seção 8): uma falha no componente de gráfico nunca pode impedir a atualização do resto da tela.
3. **Substituir `window.print()`** pela API nativa de exportação/impressão de PDF de cada plataforma (ex: `UIPrintInteractionController` no iOS, `PrintManager` no Android, diálogo de impressão nativo no desktop). Manter a mesma regra: só permite gerar relatório com um mês específico selecionado.
4. **Cálculo de killzone:** implementar a aritmética de UTC pura descrita na seção 4.8 (não usar bibliotecas de fuso horário nomeadas como fonte única de verdade) — isso garante o mesmo comportamento correto em qualquer dispositivo/SO, independentemente da base de dados de timezone instalada.
5. **Modal de configuração:** implementar como uma tela modal nativa (sheet no iOS, `BottomSheetDialog`/`AlertDialog` no Android, janela modal no desktop), reaproveitando os mesmos 4 campos e o mesmo comportamento de cancelar/salvar/fechar-por-fora descritos na seção 5.9.
6. **Formatação monetária:** reproduzir `Intl.NumberFormat('pt-BR', {style:'currency', currency})` com as APIs de formatação de moeda nativas (`NumberFormatter` no iOS, `NumberFormat` no Android/ICU).
7. **Sincronização entre plataformas:** o protótipo web já sincroniza via Firebase Auth + Firestore (ver seção 3.1) — uma versão nativa deve replicar o mesmo modelo (login por e-mail/senha, um documento por usuário com um campo por chave de armazenamento, "último a salvar vence") usando os SDKs nativos do Firebase (iOS/Android têm SDK oficial; desktop pode usar a REST API do Firestore ou um backend próprio equivalente).

---

## 10. Resumo executivo dos campos do formulário (referência rápida)

```
Data* | Hora | Mercado*(Cripto/Forex) | Par*
Direção*(Compra/Venda)
Setup: [Captura de Liquidez] [OB +] [OB -] [IDM]  (multi-seleção)
Time frame macro (H1/M30/M15/M5) | Time frame micro (M5/M3/M2/M1)
Preço de entrada* | Preço de stop* | Preço de saída*
Valor de entrada (investido)* | Valor de ganho (auto-calculado)*
Observações

* = obrigatório
Fórmula: R = movimento/risco; ganho = valor_de_entrada × R
```

Campos do modal de configuração (⚙):
```
Cidade | Estado | País | Fuso horário (UTC-12:00 a UTC+14:00, passo 30min)
Padrão: Campo Grande / MS / Brasil / UTC-4:00
```

---

## 11. Cobertura de testes automatizados (referência de qualidade)

O protótipo possui uma suíte de **64 verificações automatizadas** (executadas via jsdom simulando o DOM real, incluindo submissão de formulário, cliques em botões, e leitura de `localStorage`), cobrindo:

1. **Fórmula R** — 4 casos de referência (Compra vencedora/perdedora, Venda vencedora/perdedora) + bloqueio de risco zero.
2. **Fluxo CRUD completo** — adicionar, editar, excluir operação, com verificação de persistência e de que o gráfico indisponível não impede a atualização da tabela.
3. **Capital por mês** — reset único por mês, composição quando o mês não tem capital configurado, e não-repetição do reset em operações subsequentes do mesmo mês.
4. **Migração de registros legados** — os 3 níveis de migração (`pnl`→`resultInput`, `setup`→`confluences`, `percentual` com `pctBasis`), incluindo a regra crítica de preservação do cálculo histórico.
5. **Regras de relatório/impressão** — bloqueio com "Todos os meses" selecionado, geração correta com mês específico, conteúdo do relatório.
6. **Killzones** — equivalência exata com a tabela original quando offset=-4, recálculo correto ao mudar para outro fuso (testado com Tóquio, UTC+9), e consistência da régua (soma 100% de largura).
7. **Modal de configuração** — não aparece por padrão, abre pelo ícone, fecha por Cancelar/✕/clique fora, Cancelar não persiste, Salvar persiste e atualiza a tela imediatamente.

Qualquer reimplementação nativa deve buscar cobertura equivalente antes de ser considerada pronta para produção, com atenção especial aos itens 3 (capital por mês) e 4 (migração), que envolvem dinheiro e dados históricos.

---

*Documento gerado a partir do código-fonte real e testado do protótipo (HTML/CSS/JS), sem omissões. Qualquer dúvida sobre comportamento específico deve ser resolvida consultando este documento antes de tomar decisões de design na versão nativa — e, em última instância, consultando o código-fonte literal no Apêndice (seção 12).*

---

## 12. Apêndice — Código-fonte completo e literal do protótipo (HTML/CSS/JS)

Este é o código-fonte **exato**, sem cortes, do protótipo web funcional em que este documento se baseia — na versão atual (v2), já com o design futurista, o adaptador de storage com fallback, o modal de configuração de horário/localização, e o cálculo de killzone por aritmética de UTC. Use como referência de última instância para qualquer dúvida sobre comportamento, nome de campo, id de elemento ou fórmula — tudo o que está descrito nas seções anteriores foi extraído diretamente deste código, e este código passa integralmente pela suíte de 64 testes automatizados referenciada na seção 11.

**O protótipo vive extraído em arquivos separados no diretório `prototype/`** (HTML + CSS + 13 módulos JS por responsabilidade), em vez de um único bloco monolítico. Os blocos abaixo são cópia literal, arquivo por arquivo, do conteúdo em `prototype/` — continuam sendo a fonte de última instância, só que organizados. A ordem das tags `<script>` de lógica de app no `index.html` é a mesma ordem de execução que o script único tinha antes da divisão, com `cloud.js` inserido logo após `storage.js` (ver seção 3.1); não reordene os módulos ao portar isso para outra plataforma sem reler a seção 4.8 (a chamada imediata de `updateSession()` dentro de `killzone.js` depende de rodar antes de `loadAll()`) e a seção 3.1 (`loadAll()` só é chamado pelo callback de autenticação em `cloud.js`, não mais diretamente em `init.js`).

**PWA (instalável):** `manifest.json`, `icon.svg` e `sw.js` (service worker, cache-first com atualização em segundo plano) tornam o protótipo instalável como app (ícone, janela própria, uso offline) quando servido por **HTTPS ou `http://localhost`**. `js/register-sw.js` registra o service worker e é a última tag `<script>` do `index.html`. **Em `file://` o navegador não expõe `navigator.serviceWorker`, então o registro vira um no-op silencioso.** No iOS, a instalação é manual via Safari → Compartilhar → "Adicionar à Tela de Início".

**Sincronização entre aparelhos (Firebase):** ver seção 3.1 para o modelo completo — login/cadastro por e-mail e senha, semeadura da nuvem no primeiro login de cada conta, troca de conta limpando o `localStorage` local, e dois pontos de acesso (modal ⚙ e ícone 🔄 no cabeçalho) para o reenvio manual forçado.

**Paleta (identidade "touro/urso"):** os tokens de cor em `styles.css` seguem a tabela da seção 6 — verde para alta/touro, vermelho para baixa/urso. Não reintroduza os valores antigos (violeta `#7B6CFF`/ciano `#35D6FF`).

**Tabela de killzone atualizada:** ver seção 4.8 para a tabela completa (Pausa/Londres/Londres-NY/NY/Ásia-Tóquio/Pré Sydney) — substitui a tabela antiga (Ásia/Londres/NY AM/Fechamento Londres/NY PM), que não deve ser reintroduzida.

### `prototype/index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Diário de Trade</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Sora:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.17.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore-compat.js"></script>
<link rel="stylesheet" href="styles.css">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icon.svg">
<meta name="theme-color" content="#050505">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Diário de Trade">
</head>
<body>
<div class="wrap">

  <header>
    <div class="logo-block">
      <div class="logo-mark">R</div>
      <div>
        <h1>Diário <span class="thin">de</span> Trade</h1>
        <p class="sub">Cripto &amp; Forex · capital, operações e performance</p>
      </div>
    </div>
    <div class="header-right">
      <div class="session-badge mono" id="sessionBadge">Carregando...</div>
      <button class="btn sec" id="signOutBtn" style="padding:8px 12px;font-size:12px;">Sair</button>
      <button class="gear-btn" id="syncBtn" title="Enviar dados deste aparelho para a nuvem" aria-label="Sincronizar">🔄</button>
      <button class="gear-btn" id="openSettingsBtn" title="Ajustar horário e localização" aria-label="Ajustar horário e localização">⚙</button>
    </div>
  </header>

  <!-- Login (Firebase) — bloqueia o app até autenticar, sincroniza dados entre aparelhos -->
  <div class="modal-overlay open" id="authOverlay" style="z-index:100;">
    <div class="modal-box">
      <div class="modal-head">
        <h3>Entrar</h3>
      </div>
      <p class="modal-desc">Entre com sua conta para sincronizar suas operações entre o computador e o celular.</p>
      <div class="modal-grid" style="grid-template-columns:1fr;">
        <div class="f">
          <label>E-mail</label>
          <input type="email" id="authEmail" autocomplete="username">
        </div>
        <div class="f">
          <label>Senha</label>
          <input type="password" id="authPassword" autocomplete="current-password">
        </div>
      </div>
      <p class="hint" id="authError" style="color:var(--neg);min-height:16px;"></p>
      <div class="modal-actions">
        <button class="btn sec" id="authSignupBtn">Criar conta</button>
        <button class="btn" id="authLoginBtn">Entrar</button>
      </div>
    </div>
  </div>

  <!-- Modal de configuração de horário/localização (fechado por padrão) -->
  <div class="modal-overlay" id="settingsOverlay">
    <div class="modal-box">
      <div class="modal-head">
        <h3>Horário e localização</h3>
        <button class="modal-close" id="closeSettingsBtn" aria-label="Fechar">✕</button>
      </div>
      <p class="modal-desc">Usado para calcular corretamente as killzones de mercado no seu fuso horário.</p>
      <div class="modal-grid">
        <div class="f">
          <label>Cidade</label>
          <input type="text" id="locCity" placeholder="Ex: Campo Grande">
        </div>
        <div class="f">
          <label>Estado</label>
          <input type="text" id="locState" placeholder="Ex: MS">
        </div>
        <div class="f">
          <label>País</label>
          <input type="text" id="locCountry" placeholder="Ex: Brasil">
        </div>
        <div class="f">
          <label>Fuso horário</label>
          <select id="locOffset"></select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn sec" id="cancelSettingsBtn">Cancelar</button>
        <button class="btn" id="saveLocationBtn">Salvar</button>
      </div>
      <hr style="border:none;border-top:1px solid var(--line);margin:18px 0 14px;">
      <p class="modal-desc" style="margin-bottom:8px;">
        <b style="color:var(--text);">Sincronização:</b> use isto só se os dados deste aparelho e da nuvem estiverem divergentes — sobrescreve a nuvem com o que está salvo aqui, e some ao próximo login em outros aparelhos.
      </p>
      <div class="modal-actions" style="justify-content:flex-start;">
        <button class="btn sec" id="forcePushBtn">Enviar dados deste aparelho para a nuvem</button>
      </div>
      <p class="hint" id="forcePushStatus" style="min-height:16px;"></p>
    </div>
  </div>

  <!-- Régua de killzones ICT — baseada na localização configurada no ícone ⚙ -->
  <div class="kz-panel">
    <div class="kz-top">
      <span class="kz-top-label" id="kzTopLabel">Sessões de mercado</span>
      <span class="kz-now-label" id="kzNowLabel"></span>
    </div>
    <div class="kz-rail">
      <div class="kz-track" id="kzTrack"></div>
      <div class="kz-needle" id="kzNeedle" style="left:0%"></div>
    </div>
    <div class="kz-hours">
      <span>00h</span><span>04h</span><span>08h</span><span>12h</span><span>16h</span><span>20h</span><span>24h</span>
    </div>
  </div>

  <!-- Painel de capital -->
  <div class="cp">
    <div class="f" style="max-width:160px;">
      <label>Mês</label>
      <input type="month" id="capMonth">
    </div>
    <div class="f">
      <label>Capital inicial</label>
      <input type="number" step="any" id="capitalInicial" placeholder="Ex: 10000">
    </div>
    <div class="f" style="max-width:110px;">
      <label>Moeda</label>
      <select id="moeda"><option value="BRL">R$</option><option value="USD">US$</option></select>
    </div>
    <button class="btn sec" id="saveCapitalBtn" style="height:38px;align-self:flex-end;">Salvar capital</button>
    <div class="readout">
      <div class="ri"><div class="rl">Capital atual</div><div class="rv mono" id="capitalAtual">—</div></div>
      <div class="ri"><div class="rl">Variação total</div><div class="rv mono" id="variacaoTotal">—</div></div>
    </div>
  </div>

  <!-- Filtros -->
  <div class="cp">
    <div class="f" style="max-width:180px;">
      <label>Mercado</label>
      <select id="filterMarket">
        <option value="Todos">Todos os mercados</option>
        <option value="Cripto">Cripto</option>
        <option value="Forex">Forex</option>
      </select>
    </div>
    <div class="f" style="max-width:220px;">
      <label>Mês</label>
      <select id="filterMonth">
        <option value="all">Todos os meses (somado)</option>
      </select>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-grid" id="statsGrid"></div>

  <!-- Fita de operações -->
  <div class="tape" id="tape"></div>

  <!-- Resultados -->
  <div class="panel">
    <div class="toolbar">
      <h2 class="panel-h" id="resultsHeading" style="margin:0;">Resultados mensais</h2>
      <button class="btn sec" id="printReportBtn">🖨️ Imprimir relatório do mês</button>
    </div>
    <div id="monthlyWrap"></div>
  </div>

  <div id="printReport"></div>

  <!-- Gráfico -->
  <div class="panel">
    <h2 class="panel-h">Evolução do capital</h2>
    <div class="chart-wrap"><canvas id="equityChart"></canvas></div>
  </div>

  <!-- Operações + formulário -->
  <div class="panel">
    <div class="toolbar">
      <h2 class="panel-h" style="margin:0;">Operações</h2>
      <button class="btn" id="toggleFormBtn">+ Nova operação</button>
    </div>

    <!-- Formulário colapsável -->
    <form class="trade-form" id="tradeForm" autocomplete="off">

      <!-- Banner de edição (CSS próprio, sem conflito com .ff) -->
      <div class="edit-banner" id="editBanner">
        <span>Editando operação existente — salve para atualizar ou cancele para descartar.</span>
      </div>

      <div class="ff"><label>Data</label><input type="date" id="f_date" required></div>
      <div class="ff"><label>Hora</label><input type="time" id="f_time"></div>
      <div class="ff"><label>Mercado</label>
        <select id="f_market"><option value="Cripto">Cripto</option><option value="Forex">Forex</option></select>
      </div>
      <div class="ff"><label>Par / Ativo</label><input type="text" id="f_pair" placeholder="BTCUSDT, EURUSD..." required></div>

      <div class="ff"><label>Direção</label>
        <select id="f_direction"><option value="Compra">Compra</option><option value="Venda">Venda</option></select>
      </div>

      <div class="ff s2">
        <label>Setup (confluências)</label>
        <div class="chip-group" id="setupChips">
          <span class="chip" data-v="Captura de Liquidez">Captura de Liquidez</span>
          <span class="chip" data-v="OB +">OB +</span>
          <span class="chip" data-v="OB -">OB -</span>
          <span class="chip" data-v="IDM">IDM</span>
        </div>
      </div>

      <div class="ff"><label>Time frame macro</label>
        <select id="f_tf_macro">
          <option value="">Selecione</option>
          <option value="H1">H1</option><option value="M30">M30</option>
          <option value="M15">M15</option><option value="M5">M5</option>
        </select>
      </div>
      <div class="ff"><label>Time frame micro (gatilho)</label>
        <select id="f_tf_gatilho">
          <option value="">Selecione</option>
          <option value="M5">M5</option><option value="M3">M3</option>
          <option value="M2">M2</option><option value="M1">M1</option>
        </select>
      </div>

      <div class="ff"><label>Preço de entrada</label><input type="number" step="any" id="f_entry" required></div>
      <div class="ff"><label>Preço de stop</label><input type="number" step="any" id="f_stop_price" required></div>
      <div class="ff"><label>Preço de saída</label><input type="number" step="any" id="f_exit" required></div>

      <div class="ff s2">
        <label>Valor de entrada (R$/US$ investido)</label>
        <input type="number" step="any" id="f_valor_entrada" placeholder="Ex: 500" required>
      </div>
      <div class="ff s2">
        <label>Valor de ganho — calculado automaticamente</label>
        <input type="number" step="any" id="f_valor_ganho" placeholder="Preencha os preços acima" required>
      </div>

      <div class="ff s4">
        <label>Observações</label>
        <textarea id="f_notes" rows="2" placeholder="O que funcionou, o que corrigir na próxima..."></textarea>
      </div>
      <div class="s4 hint" id="previewLine"></div>

      <div class="form-actions">
        <button type="button" class="btn sec" id="cancelFormBtn">Cancelar</button>
        <button type="submit" class="btn" id="submitBtn">Salvar operação</button>
      </div>
    </form>

    <div id="tableWrap"></div>
  </div>

  <footer>DIÁRIO DE TRADE · cálculo por múltiplo de risco (R) · capital mês a mês</footer>
</div>

<script src="js/storage.js"></script>
<script src="js/cloud.js"></script>
<script src="js/state.js"></script>
<script src="js/data.js"></script>
<script src="js/killzone.js"></script>
<script src="js/calculations.js"></script>
<script src="js/filters.js"></script>
<script src="js/render.js"></script>
<script src="js/chart.js"></script>
<script src="js/capital-panel.js"></script>
<script src="js/form.js"></script>
<script src="js/print.js"></script>
<script src="js/init.js"></script>
<script src="js/register-sw.js"></script>
</body>
</html>
```

### `prototype/styles.css`

```css
:root{
  --void:#050505; --panel:#0E0E10; --raised:#18191B; --line:#2B2D2F;
  --text:#F2F3F0; --dim:#8A8F8A;
  --pos:#22E065; --neg:#FF3B4E; --neu:#C9CCC7;
  --brand:#22E065; --brand2:#FF3B4E;
}
*{box-sizing:border-box;}
html{scrollbar-color:var(--line) transparent;}
body{
  margin:0;background:var(--void);color:var(--text);
  font-family:'Sora',sans-serif;-webkit-font-smoothing:antialiased;
  background-image:
    radial-gradient(900px 420px at 75% -120px,rgba(255,59,78,.13),transparent 62%),
    radial-gradient(700px 380px at 8% -80px,rgba(34,224,101,.09),transparent 60%),
    repeating-linear-gradient(0deg,rgba(242,243,240,.012) 0 1px,transparent 1px 44px),
    repeating-linear-gradient(90deg,rgba(242,243,240,.012) 0 1px,transparent 1px 44px);
}
.mono{font-family:'JetBrains Mono',monospace;}
.wrap{max-width:1140px;margin:0 auto;padding:26px 20px 90px;}

/* Cabeçalho */
header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
.header-right{display:flex;align-items:center;gap:10px;}
.gear-btn{
  width:40px;height:40px;flex:none;border-radius:10px;
  background:var(--panel);border:1px solid var(--line);color:var(--dim);
  font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:all .15s;
}
.gear-btn:hover{color:var(--brand);border-color:var(--brand);transform:rotate(35deg);}

/* Modal de configuração */
.modal-overlay{
  display:none;position:fixed;inset:0;z-index:50;
  background:rgba(5,5,5,.72);backdrop-filter:blur(3px);
  align-items:center;justify-content:center;padding:20px;
}
.modal-overlay.open{display:flex;}
.modal-box{
  background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:22px 24px;max-width:440px;width:100%;position:relative;
}
.modal-box::before{
  content:'';position:absolute;top:-1px;left:20px;right:20px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(34,224,101,.5),rgba(255,59,78,.5),transparent);
}
.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
.modal-head h3{font-family:'Unbounded',sans-serif;font-size:15px;margin:0;font-weight:600;}
.modal-close{
  background:transparent;border:none;color:var(--dim);font-size:16px;cursor:pointer;
  width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;
}
.modal-close:hover{color:var(--neg);background:var(--raised);}
.modal-desc{font-size:12px;color:var(--dim);margin:0 0 16px;line-height:1.4;}
.modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}
.modal-grid .f{display:flex;flex-direction:column;}
.modal-grid label{font-size:10px;color:var(--dim);margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em;}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;}
@media(max-width:480px){.modal-grid{grid-template-columns:1fr;}}
.logo-block{display:flex;align-items:center;gap:14px;}
.logo-mark{
  width:44px;height:44px;border-radius:12px;flex:none;
  background:linear-gradient(110deg,var(--brand),var(--brand2));
  display:flex;align-items:center;justify-content:center;
  font-family:'Unbounded',sans-serif;font-weight:700;font-size:16px;color:#050810;
  box-shadow:0 0 22px rgba(34,224,101,.45);
}
header h1{font-family:'Unbounded',sans-serif;font-size:18px;margin:0;letter-spacing:.04em;font-weight:700;}
header h1 .thin{color:var(--dim);font-weight:500;}
header .sub{margin:3px 0 0;color:var(--dim);font-size:12px;}
.session-badge{
  background:var(--panel);border:1px solid var(--line);border-radius:12px;
  padding:10px 16px;font-size:12.5px;color:var(--dim);min-width:250px;text-align:right;
}
.session-badge .kz-label{color:var(--brand2);font-weight:600;}
.session-badge .time{color:var(--text);font-weight:600;font-size:14px;}

/* Régua de killzones (elemento-assinatura) */
.kz-panel{
  background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:14px 18px 16px;margin-bottom:18px;position:relative;overflow:hidden;
}
.kz-panel::before{
  content:'';position:absolute;top:0;left:0;right:0;height:1px;
  background:linear-gradient(90deg,transparent,var(--brand),var(--brand2),transparent);opacity:.5;
}
.kz-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;}
.kz-top-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);}
.kz-now-label{font-size:11px;color:var(--dim);font-family:'JetBrains Mono',monospace;}
.kz-rail{position:relative;height:36px;margin-bottom:6px;}
.kz-track{display:flex;height:36px;border-radius:8px;overflow:hidden;border:1px solid var(--line);}
.kz-seg{
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:.04em;
  color:var(--dim);background:var(--raised);border-right:1px solid var(--line);
  text-transform:uppercase;white-space:nowrap;
}
.kz-seg:last-child{border-right:none;}
.kz-seg.is-zone{background:rgba(34,224,101,.12);color:#9CF0B8;}
.kz-seg.is-active{background:linear-gradient(90deg,var(--brand),var(--brand2));color:#050810;font-weight:700;}
.kz-needle{
  position:absolute;top:-4px;bottom:-4px;width:2px;
  background:linear-gradient(180deg,var(--brand),var(--brand2));
  box-shadow:0 0 10px rgba(255,59,78,.8);pointer-events:none;border-radius:2px;
}
.kz-needle::after{
  content:'';position:absolute;top:-4px;left:50%;transform:translateX(-50%);
  border:5px solid transparent;border-top-color:var(--brand2);
}
.kz-hours{display:flex;justify-content:space-between;font-size:9px;color:var(--dim);font-family:'JetBrains Mono',monospace;}

/* Painéis genéricos */
.panel{
  background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:18px 20px;margin-bottom:18px;position:relative;
}
.panel::before{
  content:'';position:absolute;top:-1px;left:20px;right:20px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(34,224,101,.45),rgba(255,59,78,.45),transparent);
}
.panel-h{font-size:12px;margin:0 0 14px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--text);}
.chart-wrap{height:240px;}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;}

/* Painéis de capital e filtro */
.cp{
  background:var(--panel);border:1px solid var(--line);border-radius:14px;
  padding:16px 20px;margin-bottom:18px;display:flex;gap:20px;align-items:flex-end;flex-wrap:wrap;position:relative;
}
.cp::before{
  content:'';position:absolute;top:-1px;left:20px;right:20px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(34,224,101,.45),rgba(255,59,78,.45),transparent);
}
.cp .f{display:flex;flex-direction:column;min-width:150px;}
.cp label{font-size:10px;color:var(--dim);margin-bottom:5px;text-transform:uppercase;letter-spacing:.1em;}
.readout{display:flex;gap:26px;margin-left:auto;flex-wrap:wrap;}
.readout .ri .rl{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px;}
.readout .ri .rv{font-size:22px;font-weight:600;}

/* Inputs e selects */
select,input[type="text"],input[type="number"],input[type="date"],
input[type="time"],input[type="month"],textarea{
  background:var(--raised);border:1px solid var(--line);color:var(--text);
  border-radius:8px;padding:9px 10px;font-family:'Sora',sans-serif;font-size:13.5px;
  width:100%;-webkit-appearance:none;appearance:none;
}
select:focus,input:focus,textarea:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 2px rgba(34,224,101,.16);}
select:disabled,input:disabled{opacity:.5;cursor:not-allowed;}

/* Botões */
.btn{
  background:linear-gradient(110deg,var(--brand),var(--brand2));
  color:#050810;border:none;border-radius:8px;
  padding:10px 16px;font-weight:600;font-size:13.5px;cursor:pointer;
  font-family:'Sora',sans-serif;white-space:nowrap;
}
.btn:hover{filter:brightness(1.1);}
.btn.sec{background:transparent;border:1px solid var(--line);color:var(--text);}
.btn.sec:hover{border-color:var(--brand);}
.btn.danger{background:transparent;border:1px solid var(--neg);color:var(--neg);padding:6px 10px;font-size:12px;}
.btn.edit-b{background:transparent;border:1px solid var(--brand);color:var(--brand);padding:6px 10px;font-size:12px;margin-right:6px;}

/* Cards de stats com cantos HUD */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px;}
.stat-card{
  background:var(--panel);border:1px solid var(--line);border-radius:10px;
  padding:14px 16px;position:relative;
}
.stat-card::before{
  content:'';position:absolute;top:-1px;left:-1px;width:12px;height:12px;
  border-top:2px solid var(--brand);border-left:2px solid var(--brand);border-top-left-radius:4px;
}
.stat-card::after{
  content:'';position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;
  border-bottom:2px solid var(--brand2);border-right:2px solid var(--brand2);border-bottom-right-radius:4px;
}
.stat-card .sl{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--dim);margin-bottom:7px;}
.stat-card .sv{font-size:23px;font-weight:600;}
.pos{color:var(--pos);} .neg{color:var(--neg);} .neu{color:var(--neu);}

/* Fita */
.tape{
  display:flex;gap:3px;overflow-x:auto;padding:12px;
  background:var(--panel);border:1px solid var(--line);border-radius:12px;
  margin-bottom:18px;align-items:flex-end;height:66px;
}
.tape-empty{color:var(--dim);font-size:13px;padding:4px;}
.tape-bar{width:8px;min-width:8px;border-radius:2px;cursor:default;transition:transform .15s;}
.tape-bar:hover{transform:scaleY(1.15);}
.tape-bar.win{background:var(--pos);}
.tape-bar.loss{background:var(--neg);}
.tape-bar.be{background:var(--neu);}

/* Formulário de operação */
.trade-form{display:none;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px;}
.trade-form.open{display:grid;}
.trade-form .ff{display:flex;flex-direction:column;}
.trade-form .ff label{font-size:10px;color:var(--dim);margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em;}
.trade-form .s2{grid-column:span 2;}
.trade-form .s4{grid-column:span 4;}
.trade-form .form-actions{grid-column:span 4;display:flex;gap:10px;justify-content:flex-end;margin-top:4px;}
.hint{font-size:11.5px;color:var(--dim);margin-top:4px;}

/* Banner de edição — isolado do seletor .ff para evitar conflito de especificidade */
.edit-banner{
  display:none;
  background:rgba(255,198,92,.10);border:1px solid var(--neu);color:var(--neu);
  border-radius:8px;padding:8px 12px;font-size:12.5px;
  align-items:center;justify-content:space-between;
  grid-column:span 4;margin-bottom:4px;
}
.edit-banner.show{display:flex;}

/* Chips de confluência */
.chip-group{display:flex;flex-wrap:wrap;gap:6px;}
.chip{
  background:var(--raised);border:1px solid var(--line);color:var(--dim);
  border-radius:7px;padding:6px 12px;font-size:12px;cursor:pointer;user-select:none;
  transition:all .12s;font-family:'JetBrains Mono',monospace;
}
.chip:hover{border-color:var(--brand2);}
.chip.on{background:rgba(34,224,101,.16);border-color:var(--brand);color:#A8F5C0;font-weight:600;}

/* Tabelas */
.tbl-wrap{overflow-x:auto;border-radius:10px;margin:0 -4px;}
.tbl-wrap::-webkit-scrollbar{height:7px;}
.tbl-wrap::-webkit-scrollbar-thumb{background:var(--line);border-radius:4px;}
table{width:100%;border-collapse:collapse;font-size:12.5px;}
table.ops{min-width:920px;}
thead th{
  text-align:left;color:var(--dim);font-weight:500;font-size:10px;
  text-transform:uppercase;letter-spacing:.08em;padding:8px 10px;
  border-bottom:1px solid var(--line);white-space:nowrap;
}
tbody td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap;}
tbody td.tc-notes,tbody td.tc-setup{white-space:normal;}
tbody tr:hover{background:var(--raised);}
.mkt-tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;}
.mkt-tag.Cripto{background:rgba(34,224,101,.14);color:var(--brand);}
.mkt-tag.Forex{background:rgba(201,204,199,.14);color:var(--neu);}
.pnl-win{color:var(--pos);font-weight:600;}
.pnl-loss{color:var(--neg);font-weight:600;}
.pnl-be{color:var(--neu);font-weight:600;}
.mini-tag{display:inline-block;background:var(--raised);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:11px;color:var(--dim);margin:1px;}
.tf-hint{font-size:11px;color:var(--dim);margin-top:2px;font-family:'JetBrains Mono',monospace;}
.empty{text-align:center;padding:36px 10px;color:var(--dim);}
.empty b{color:var(--text);}
.row-actions{display:flex;}

footer{margin-top:26px;text-align:center;color:var(--dim);font-size:11px;letter-spacing:.08em;}

/* Impressão */
#printReport{display:none;}
@media print{
  body *{visibility:hidden;}
  #printReport,#printReport *{visibility:visible;}
  #printReport{
    display:block;position:absolute;left:0;top:0;width:100%;
    background:#fff;color:#111;padding:24px;font-family:'Sora',sans-serif;
  }
  .pr-header{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px;}
  .pr-header h1{font-family:'Unbounded',sans-serif;font-size:20px;margin:0 0 4px;}
  .pr-header .pr-sub{color:#555;font-size:12px;}
  .pr-stats{display:flex;gap:18px;margin-bottom:18px;flex-wrap:wrap;}
  .pr-stats div{border:1px solid #ccc;border-radius:6px;padding:8px 12px;font-size:12px;}
  .pr-stats .pr-label{color:#666;font-size:10px;text-transform:uppercase;letter-spacing:.04em;}
  .pr-stats .pr-value{font-size:16px;font-weight:700;font-family:'JetBrains Mono',monospace;}
  #printReport table{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:8px;}
  #printReport th{text-align:left;border-bottom:2px solid #111;padding:5px 6px;font-size:9.5px;text-transform:uppercase;}
  #printReport td{border-bottom:1px solid #ddd;padding:5px 6px;font-family:'JetBrains Mono',monospace;}
  #printReport .pr-pos{color:#0a7a5f;font-weight:700;}
  #printReport .pr-neg{color:#b3261e;font-weight:700;}
  .pr-section-title{font-size:13px;font-weight:700;margin:16px 0 6px;}
  @page{margin:14mm;}
}

/* Responsivo */
@media(max-width:640px){
  .trade-form{grid-template-columns:repeat(2,1fr);}
  .trade-form .s2,.trade-form .s4{grid-column:span 2;}
  .edit-banner{grid-column:span 2;}
  .trade-form .form-actions{grid-column:span 2;}
  .readout{margin-left:0;}
  .session-badge{text-align:left;min-width:0;width:100%;}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}
```

### `prototype/manifest.json`

```json
{
  "name": "Diário de Trade",
  "short_name": "Diário",
  "description": "Diário de trade para operações de Cripto e Forex — capital por mês, cálculo por múltiplo de risco (R), killzones de mercado.",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#050505",
  "theme_color": "#050505",
  "lang": "pt-BR",
  "icons": [
    { "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

### `prototype/icon.svg`

```xml
<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22E065"/>
      <stop offset="100%" stop-color="#FF3B4E"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="140" fill="url(#g)"/>
  <text x="256" y="345" font-family="Arial, sans-serif" font-weight="900" font-size="300" fill="#050810" text-anchor="middle">R</text>
</svg>
```

### `prototype/sw.js`

```javascript
'use strict';

const CACHE = 'diario-de-trade-v4';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon.svg',
  './js/storage.js',
  './js/state.js',
  './js/data.js',
  './js/killzone.js',
  './js/calculations.js',
  './js/filters.js',
  './js/render.js',
  './js/chart.js',
  './js/capital-panel.js',
  './js/form.js',
  './js/print.js',
  './js/init.js',
  './js/register-sw.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Cache-first com atualização em segundo plano (stale-while-revalidate):
// serve do cache imediatamente quando existe, e atualiza o cache com a
// resposta de rede mais recente para a próxima vez.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
```

### `prototype/js/storage.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// ARMAZENAMENTO — checagem no momento da chamada (não no parse),
// para compatibilidade com o timing de injeção do window.storage no artifact.
// ──────────────────────────────────────────────────────────────────────────────
const TRADES_KEY  = 'trades-data';
const CAPITAL_KEY = 'capital-config';
const FILTER_KEY  = 'filter-config';

async function stGet(key){
  // 1ª opção: nuvem (Firebase — cloud.js), quando há usuário logado, para
  // sincronizar entre aparelhos. Checado a cada chamada, igual às demais.
  if(typeof window.cloudGet === 'function'){
    const cloudVal = await window.cloudGet(key);
    if(cloudVal !== null && cloudVal !== undefined){
      try{ localStorage.setItem(key, cloudVal); }catch(e){ /* ok, segue só na nuvem */ }
      return cloudVal;
    }
  }
  // 2ª opção: window.storage (ambiente artifact — injetado pelo host antes dos scripts)
  if(typeof window.storage !== 'undefined' && window.storage){
    try{
      const r = await window.storage.get(key, false);
      return (r && r.value !== undefined) ? r.value : null;
    }catch(e){ /* cai para localStorage */ }
  }
  // 3ª opção: localStorage (arquivo aberto diretamente no browser, ou sem login)
  try{ return localStorage.getItem(key); }catch(e){ return null; }
}

async function stSet(key, value){
  try{ localStorage.setItem(key, value); }catch(e){ console.warn('Storage indisponível:', e); }
  // Nuvem: grava em paralelo quando há usuário logado (não bloqueia o salvamento local se falhar).
  if(typeof window.cloudSet === 'function'){ await window.cloudSet(key, value); }
  if(typeof window.storage !== 'undefined' && window.storage){
    try{ await window.storage.set(key, value, false); }catch(e){ /* já salvou local(+nuvem) */ }
  }
}

```

### `prototype/js/cloud.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// SINCRONIZAÇÃO ENTRE APARELHOS (Firebase Auth + Firestore)
// ──────────────────────────────────────────────────────────────────────────────
// Camada opcional acima do adaptador de storage (storage.js): quando há um
// usuário autenticado, cloudGet/cloudSet leem/gravam num documento Firestore
// por usuário (users/{uid}), além do localStorage local. Isso permite abrir o
// mesmo login no PC e no celular e ver os mesmos dados nos dois.
const firebaseConfig = {
  apiKey: "AIzaSyBtAJW9v76KXvUTER1l34J1A6vnHbIAXBA",
  authDomain: "diario-de-trader-ir.firebaseapp.com",
  projectId: "diario-de-trader-ir",
  storageBucket: "diario-de-trader-ir.firebasestorage.app",
  messagingSenderId: "314145594930",
  appId: "1:314145594930:web:c5273c55c016c6bc0ae62b"
};
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

let cloudUser  = null;
let appStarted = false;

function showAuthOverlay(msg){
  document.getElementById('authError').textContent = msg || '';
  document.getElementById('authOverlay').classList.add('open');
}
function hideAuthOverlay(){
  document.getElementById('authOverlay').classList.remove('open');
}

// Lidas/gravadas por stGet/stSet (storage.js) sempre que há usuário logado.
window.cloudGet = async function(key){
  if(!cloudUser) return null;
  try{
    const snap = await db.collection('users').doc(cloudUser.uid).get();
    if(!snap.exists) return null;
    const data = snap.data();
    return (data && data[key] !== undefined) ? data[key] : null;
  }catch(e){ console.warn('cloudGet falhou:', e.message); return null; }
};

window.cloudSet = async function(key, value){
  if(!cloudUser) return;
  try{
    await db.collection('users').doc(cloudUser.uid).set({ [key]: value }, { merge:true });
  }catch(e){ console.warn('cloudSet falhou:', e.message); }
};

// Chaves de storage sincronizadas (mesmas da seção 3). Repetidas aqui em vez
// de reaproveitar as consts de storage.js/killzone.js de propósito — cloud.js
// não deve depender da ordem de carregamento dos outros módulos.
const SYNCED_KEYS = ['trades-data', 'capital-config', 'filter-config', 'location-config'];

// No primeiro login de uma conta (documento ainda não existe na nuvem), semeia
// a nuvem com o que já está salvo localmente neste aparelho — sem isso, um
// aparelho com dados só locais "some" ao logar, porque cloudGet passa a
// responder (mesmo que vazio) e stGet para de cair no localStorage.
async function seedCloudIfEmpty(){
  try{
    const ref = db.collection('users').doc(cloudUser.uid);
    const snap = await ref.get();
    if(snap.exists) return;
    const seed = {};
    SYNCED_KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if(v !== null) seed[k] = v;
    });
    if(Object.keys(seed).length) await ref.set(seed, { merge:true });
  }catch(e){ console.warn('Semeadura inicial da nuvem falhou:', e.message); }
}

auth.onAuthStateChanged(async (user) => {
  cloudUser = user;
  if(user){
    hideAuthOverlay();
    // loadAll() só roda uma vez por carregamento de página, na primeira vez
    // que o estado de login resolve para um usuário (login já salvo, ou
    // acabou de ser feito pelo formulário abaixo).
    if(!appStarted){
      appStarted = true;
      await seedCloudIfEmpty();
      loadAll();
    }
  } else {
    // Ao deslogar (inclusive antes de criar/entrar numa outra conta): limpa o
    // cache local e a flag de início. Sem isso, o localStorage continuava com
    // os dados da conta anterior — e uma conta nova, sem documento próprio
    // ainda na nuvem, acabava sendo "semeada" com os dados de quem logou
    // antes nesse mesmo aparelho/navegador.
    SYNCED_KEYS.forEach((k) => { try{ localStorage.removeItem(k); }catch(e){ /* ok */ } });
    appStarted = false;
    showAuthOverlay();
  }
});

document.getElementById('authLoginBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPassword').value;
  if(!email || !pass){ showAuthOverlay('Preencha e-mail e senha.'); return; }
  try{
    await auth.signInWithEmailAndPassword(email, pass);
  }catch(e){
    showAuthOverlay('Não foi possível entrar: ' + (e.message || 'verifique e-mail e senha.'));
  }
});
document.getElementById('authSignupBtn').addEventListener('click', async () => {
  const email = document.getElementById('authEmail').value.trim();
  const pass  = document.getElementById('authPassword').value;
  if(!email || !pass){ showAuthOverlay('Preencha e-mail e senha.'); return; }
  try{
    await auth.createUserWithEmailAndPassword(email, pass);
  }catch(e){
    showAuthOverlay('Não foi possível criar a conta: ' + (e.message || 'tente outro e-mail/senha.'));
  }
});
document.getElementById('authPassword').addEventListener('keydown', (e) => {
  if(e.key === 'Enter') document.getElementById('authLoginBtn').click();
});

document.getElementById('signOutBtn').addEventListener('click', () => {
  auth.signOut();
});

// Sobrescreve a nuvem com os 4 valores atuais de localStorage deste
// aparelho, sem checar o que já existe lá — para o usuário resolver na mão
// um caso de dados divergentes. Usado pelo botão dentro do modal ⚙ e pelo
// ícone de sincronização no cabeçalho (mesma ação, dois pontos de acesso).
async function pushLocalToCloud(){
  if(!cloudUser) throw new Error('Faça login primeiro.');
  const payload = {};
  SYNCED_KEYS.forEach((k) => {
    const v = localStorage.getItem(k);
    if(v !== null) payload[k] = v;
  });
  await db.collection('users').doc(cloudUser.uid).set(payload, { merge:true });
}

document.getElementById('forcePushBtn').addEventListener('click', async () => {
  const status = document.getElementById('forcePushStatus');
  status.textContent = 'Enviando...'; status.style.color = 'var(--dim)';
  try{
    await pushLocalToCloud();
    status.textContent = 'Enviado! Já pode abrir nos outros aparelhos.'; status.style.color = 'var(--pos)';
  }catch(e){
    status.textContent = 'Falhou: ' + e.message; status.style.color = 'var(--neg)';
  }
});

document.getElementById('syncBtn').addEventListener('click', async () => {
  try{
    await pushLocalToCloud();
    alert('Dados deste aparelho enviados para a nuvem.');
  }catch(e){
    alert('Falhou: ' + e.message);
  }
});
```

### `prototype/js/state.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ──────────────────────────────────────────────────────────────────────────────
let trades = [];
let capitalConfig = { currency:'USD', defaultInitial:0, months:{} };
let equityChart = null;
let editingId  = null;

```

### `prototype/js/data.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// CARGA E MIGRAÇÃO DE DADOS
// ──────────────────────────────────────────────────────────────────────────────
async function loadAll(){
  // --- Trades ---
  try{
    const raw = await stGet(TRADES_KEY);
    trades = raw ? JSON.parse(raw) : [];
  }catch(e){ trades = []; }

  // Migração de versões antigas do app:
  trades = trades.map(t=>{
    let m = t;
    // v0: campo pnl (pré-resultInput)
    if(m.resultInput === undefined){
      const leg = parseFloat(m.pnl);
      m = {...m, resultMode:'valor', resultInput: isNaN(leg)?0:leg};
    }
    // v1: campo setup (texto livre pré-chips)
    if(m.confluences === undefined){
      m = {...m, confluences:[], tfMacro:m.tfMacro||'', tfGatilho:m.tfGatilho||'', setupLegacy:m.setup||''};
    }
    // v2: sem valorEntrada (pctBasis:'capital' preserva cálculo histórico!)
    if(m.valorEntrada === undefined){
      m = {...m, valorEntrada:'', pctBasis: m.resultMode==='percentual'?'capital':'entrada'};
    }
    return m;
  });

  // --- Capital ---
  try{
    const raw2 = await stGet(CAPITAL_KEY);
    const p = raw2 ? JSON.parse(raw2) : null;
    if(p && p.months){
      capitalConfig = p;
    } else if(p && p.initial !== undefined){
      capitalConfig = { currency:p.currency||'USD', defaultInitial:p.initial||0, months:{} };
    } else {
      capitalConfig = { currency:'USD', defaultInitial:0, months:{} };
    }
  }catch(e){ capitalConfig = { currency:'USD', defaultInitial:0, months:{} }; }

  // --- Aplicar config na UI ---
  document.getElementById('moeda').value = capitalConfig.currency || 'USD';
  document.getElementById('capMonth').value = new Date().toISOString().slice(0,7);
  syncCapitalPanel();

  // --- Localização de referência (killzone) ---
  await loadLocation();
  updateSession();

  // --- Filtros persistidos ---
  try{
    const raw3 = await stGet(FILTER_KEY);
    const f = raw3 ? JSON.parse(raw3) : null;
    if(f){
      document.getElementById('filterMarket').value = f.market || 'Todos';
      window.__savedMonth = f.month || 'all';
    }
  }catch(e){ /* sem filtro salvo */ }

  buildMonthSelect(window.__savedMonth || 'all');
  render();
}

async function saveTrades(){
  try{ await stSet(TRADES_KEY, JSON.stringify(trades)); }catch(e){ console.error(e); }
}
async function saveCapital(){
  try{ await stSet(CAPITAL_KEY, JSON.stringify(capitalConfig)); }catch(e){ console.error(e); }
}
async function saveFilter(){
  try{
    await stSet(FILTER_KEY, JSON.stringify({
      market: document.getElementById('filterMarket').value,
      month:  document.getElementById('filterMonth').value
    }));
  }catch(e){ console.error(e); }
}
```

### `prototype/js/killzone.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// SESSÃO / KILLZONES
// ──────────────────────────────────────────────────────────────────────────────
// As killzones são sessões reais de mercado, fixas em horário UTC. A tabela
// abaixo foi fornecida em horário local de Campo Grande (UTC-4):
//   00:00–03:00 Pausa | 03:00–05:00 Londres | 05:00–08:00 Pausa
//   08:00–12:00 Londres/NY | 12:00–18:00 NY | 17:00–19:00 Pausa
//   19:00–22:00 Ásia/Tóquio | 22:00–00:00 Pré Sydney
// (a faixa 17:00–19:00 "Pausa" propositalmente sobrepõe o fim de "NY", que
// vale até 18:00 — a entrada listada por último vence para a hora 17 local)
// — convertida aqui para UTC puro (+4h) para poder ser recalculada
// corretamente para QUALQUER fuso de referência que o usuário configurar.
const LOCATION_KEY = 'location-config';
let locationConfig = { city:'Campo Grande', state:'MS', country:'Brasil', offset:-4 };

function kzForUtcHour(h){
  h = ((h%24)+24)%24;
  if(h>=23 || h<2)  return 'Ásia/Tóquio';
  if(h<4)  return 'Pré Sydney';
  if(h<7)  return 'Pausa';
  if(h<9)  return 'Londres';
  if(h<12) return 'Pausa';
  if(h<16) return 'Londres/NY';
  if(h<21) return 'NY';
  return 'Pausa';
}
// Converte hora local (no fuso de referência configurado) para a killzone correta.
function kzForLocalHour(localHour, offset){
  const utcHour = ((Math.floor(localHour) - offset) % 24 + 24) % 24;
  return kzForUtcHour(utcHour);
}

// Gera as opções de fuso horário (UTC-12:00 a UTC+14:00, passo de 30min)
function fmtOffset(o){
  const sign = o>=0 ? '+' : '−';
  const abs = Math.abs(o);
  const h = Math.floor(abs);
  const m = Math.round((abs-h)*60);
  return `UTC${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function buildOffsetSelect(){
  const sel = document.getElementById('locOffset');
  if(!sel) return;
  const opts = [];
  for(let m=-12*60; m<=14*60; m+=30){ opts.push(m/60); }
  sel.innerHTML = opts.map(o=>`<option value="${o}">${fmtOffset(o)}</option>`).join('');
}

// Monta a régua de 24h dinamicamente: calcula a killzone de cada uma das 24 horas
// locais (no fuso configurado) e agrupa horas consecutivas com a mesma sessão em
// um único bloco visual — refeito sempre que a localização muda.
function buildRail(offset){
  const track = document.getElementById('kzTrack');
  if(!track) return;
  const hours = [];
  for(let h=0; h<24; h++) hours.push({ h, name: kzForLocalHour(h, offset) });
  const segs = [];
  hours.forEach(({h,name})=>{
    const last = segs[segs.length-1];
    if(last && last.name === name){ last.to = h+1; }
    else { segs.push({ from:h, to:h+1, name }); }
  });
  track.innerHTML = segs.map(s=>{
    const w = ((s.to-s.from)/24*100).toFixed(4);
    return `<div class="kz-seg${s.name?' is-zone':''}" data-from="${s.from}" data-to="${s.to}" style="width:${w}%">${s.name}</div>`;
  }).join('');
}

async function loadLocation(){
  try{
    const raw = await stGet(LOCATION_KEY);
    const p = raw ? JSON.parse(raw) : null;
    if(p) locationConfig = { ...locationConfig, ...p };
  }catch(e){ /* mantém o padrão Campo Grande */ }
  document.getElementById('locCity').value    = locationConfig.city    || '';
  document.getElementById('locState').value   = locationConfig.state  || '';
  document.getElementById('locCountry').value = locationConfig.country|| '';
  buildOffsetSelect();
  document.getElementById('locOffset').value  = locationConfig.offset;
  buildRail(locationConfig.offset);
}
async function saveLocation(){
  try{ await stSet(LOCATION_KEY, JSON.stringify(locationConfig)); }catch(e){ console.error(e); }
}

document.getElementById('saveLocationBtn').addEventListener('click', async ()=>{
  locationConfig = {
    city:    document.getElementById('locCity').value.trim()    || 'Campo Grande',
    state:   document.getElementById('locState').value.trim(),
    country: document.getElementById('locCountry').value.trim(),
    offset:  parseFloat(document.getElementById('locOffset').value)
  };
  await saveLocation();
  buildRail(locationConfig.offset);
  updateSession();
  closeSettingsModal();
});

// ---------- Modal de configuração (ícone ⚙) ----------
function openSettingsModal(){
  // repovoa os campos com o valor atualmente salvo, descartando qualquer edição
  // não salva de uma abertura anterior
  document.getElementById('locCity').value    = locationConfig.city    || '';
  document.getElementById('locState').value   = locationConfig.state  || '';
  document.getElementById('locCountry').value = locationConfig.country|| '';
  document.getElementById('locOffset').value  = locationConfig.offset;
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettingsModal(){
  document.getElementById('settingsOverlay').classList.remove('open');
}
document.getElementById('openSettingsBtn').addEventListener('click', openSettingsModal);
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettingsModal);
document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
document.getElementById('settingsOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'settingsOverlay') closeSettingsModal();
});
document.addEventListener('keydown', (e)=>{
  if(e.key === 'Escape') closeSettingsModal();
});

function updateSession(){
  // Hora atual em UTC verdadeiro, calculada por aritmética pura — não depende do
  // banco de fusos horários (Intl/IANA) do navegador, então nunca falha nem
  // varia entre dispositivos.
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset()*60000;
  const offset = (typeof locationConfig.offset === 'number' && !isNaN(locationConfig.offset)) ? locationConfig.offset : -4;
  const refMs = utcMs + offset*3600000;
  const ref = new Date(refMs);
  const hh = ref.getUTCHours();
  const mmNum = ref.getUTCMinutes();
  const mmStr = String(mmNum).padStart(2,'0');
  const kz = kzForLocalHour(hh, offset) || 'Fora de killzone';

  // Relógio do cabeçalho: mostra horário + localização + sessão (como era antes).
  // Só o painel "Sessões de mercado" (kz-panel abaixo) fica sem a localização.
  const place = [locationConfig.city, locationConfig.state].filter(Boolean).join(', ') || 'Referência';
  const badge = document.getElementById('sessionBadge');
  if(badge) badge.innerHTML = `<span class="time">${String(hh).padStart(2,'0')}:${mmStr}</span> · ${place} &nbsp;·&nbsp; <span class="kz-label">${kz}</span>`;

  const topLbl = document.getElementById('kzTopLabel');
  if(topLbl) topLbl.textContent = 'Sessões de mercado';

  const pct = (hh*60+mmNum)/1440*100;
  const needle = document.getElementById('kzNeedle');
  if(needle) needle.style.left = pct.toFixed(3)+'%';
  const lbl = document.getElementById('kzNowLabel');
  if(lbl) lbl.textContent = `agora · ${String(hh).padStart(2,'0')}:${mmStr}`;

  document.querySelectorAll('#kzTrack .kz-seg').forEach(el=>{
    const from = parseInt(el.dataset.from,10), to = parseInt(el.dataset.to,10);
    el.classList.toggle('is-active', !!el.textContent && hh>=from && hh<to);
  });
}
updateSession();
setInterval(updateSession, 30000);
```

### `prototype/js/calculations.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ──────────────────────────────────────────────────────────────────────────────
function fmtMoney(v){
  const code = capitalConfig.currency==='USD' ? 'USD' : 'BRL';
  try{ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:code}).format(v||0); }
  catch(e){ return (v||0).toFixed(2); }
}
function monthKey(d){ return d ? d.slice(0,7) : 'sem-data'; }
function monthLabel(k){
  if(k==='sem-data') return 'Sem data';
  const [y,m] = k.split('-');
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]+'/'+y;
}

// ──────────────────────────────────────────────────────────────────────────────
// SÉRIE DE CAPITAL — lógica exata da especificação (seção 4.3)
// ──────────────────────────────────────────────────────────────────────────────
function computeSeries(){
  const sorted = [...trades].sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));
  let bal = parseFloat(capitalConfig.defaultInitial)||0;
  const applied = new Set();
  return sorted.map(t=>{
    const k = monthKey(t.date);
    const mcfg = capitalConfig.months ? capitalConfig.months[k] : null;
    if(mcfg!=null && !applied.has(k)){ bal = parseFloat(mcfg.initial)||0; applied.add(k); }
    const before = bal;
    let pnl;
    if(t.resultMode==='percentual'){
      const pct = (parseFloat(t.resultInput)||0)/100;
      const ve  = parseFloat(t.valorEntrada);
      pnl = (t.pctBasis==='entrada' && !isNaN(ve) && ve>0) ? ve*pct : before*pct;
    } else {
      pnl = parseFloat(t.resultInput)||0;
    }
    bal = before+pnl;
    return {...t, pnlValor:pnl, balanceBefore:before, balanceAfter:bal,
            result: pnl>0?'Win':(pnl<0?'Loss':'BE')};
  });
}
```

### `prototype/js/filters.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────────────────
function getMarketFilter(){ return document.getElementById('filterMarket').value; }
function getMonthFilter(){  return document.getElementById('filterMonth').value; }

function buildMonthSelect(keep){
  const sel = document.getElementById('filterMonth');
  const cur = keep!==undefined ? keep : sel.value;
  const keys = [...new Set(trades.map(t=>monthKey(t.date)))].filter(k=>k!=='sem-data').sort().reverse();
  sel.innerHTML = '<option value="all">Todos os meses (somado)</option>' +
    keys.map(k=>`<option value="${k}">${monthLabel(k)}</option>`).join('');
  sel.value = keys.includes(cur) ? cur : 'all';
}

function applyFilters(list){
  const mkt = getMarketFilter(), mon = getMonthFilter();
  return list.filter(t=>{
    if(mkt!=='Todos' && t.market!==mkt) return false;
    if(mon!=='all'   && monthKey(t.date)!==mon) return false;
    return true;
  });
}
```

### `prototype/js/render.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// RENDER PRINCIPAL
// ──────────────────────────────────────────────────────────────────────────────
function render(){
  const full     = computeSeries();
  const mktOnly  = getMarketFilter()==='Todos' ? full : full.filter(t=>t.market===getMarketFilter());
  const filtered = applyFilters(full);

  renderReadout(full);
  renderStats(filtered);
  renderTape(filtered);
  renderResults(mktOnly, filtered);
  renderTable(filtered);
  // Gráfico: sempre POR ÚLTIMO, isolado — falha no gráfico nunca afeta a tabela (seção 8, bug 1)
  try{ renderChart(full, filtered); }
  catch(e){
    console.error('Gráfico indisponível (dados salvos normalmente):', e.message);
    const wrap = document.querySelector('.chart-wrap');
    if(wrap) wrap.innerHTML = '<div class="empty" style="padding:20px;">Gráfico indisponível. Seus dados foram salvos normalmente.</div>';
  }
}

function renderReadout(full){
  const ini = full.length ? full[0].balanceBefore : (parseFloat(capitalConfig.defaultInitial)||0);
  const atu = full.length ? full[full.length-1].balanceAfter : ini;
  const var_ = ini ? ((atu-ini)/ini*100) : 0;
  document.getElementById('capitalAtual').textContent = fmtMoney(atu);
  const el = document.getElementById('variacaoTotal');
  el.textContent = (var_>=0?'+':'')+var_.toFixed(2)+'%';
  el.className = 'rv mono ' + (var_>0?'pos':(var_<0?'neg':'neu'));
}

function renderStats(list){
  const tot = list.length, wins = list.filter(t=>t.result==='Win').length;
  const losses = list.filter(t=>t.result==='Loss').length;
  const wr = tot ? (wins/tot*100) : 0;
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="sl">Operações</div><div class="sv mono">${tot}</div></div>
    <div class="stat-card"><div class="sl">Taxa de acerto</div><div class="sv mono">${wr.toFixed(1)}%</div></div>
    <div class="stat-card"><div class="sl">Wins / Losses</div><div class="sv mono"><span class="pos">${wins}</span> / <span class="neg">${losses}</span></div></div>`;
}

function renderTape(list){
  const tape = document.getElementById('tape');
  if(!list.length){ tape.innerHTML = '<div class="tape-empty">Sem operações — a fita aparece aqui.</div>'; return; }
  tape.innerHTML = list.map(t=>{
    const cls = t.result==='Win'?'win':(t.result==='Loss'?'loss':'be');
    const h = t.pnlValor===0 ? 20 : Math.min(56, Math.max(14, Math.abs(t.pnlValor)/(t.balanceBefore||1)*400+14));
    return `<div class="tape-bar ${cls}" style="height:${h}px" title="${t.pair} · ${t.date} · ${t.result} · ${fmtMoney(t.pnlValor)}"></div>`;
  }).join('');
}

function renderResults(mktOnly, filtered){
  const wrap = document.getElementById('monthlyWrap');
  const head = document.getElementById('resultsHeading');
  const mon  = getMonthFilter();
  if(mon!=='all'){
    head.textContent = 'Resultados — '+monthLabel(mon);
    renderDaily(filtered, wrap);
  } else {
    head.textContent = 'Resultados mensais';
    renderMonthly(mktOnly, wrap);
  }
}

function renderDaily(list, wrap){
  if(!list.length){ wrap.innerHTML='<div class="empty" style="padding:20px 10px;">Nenhuma operação nesse período.</div>'; return; }
  const groups={};
  list.forEach(t=>{ const k=t.date||'sem-data'; (groups[k]=groups[k]||[]).push(t); });
  const rows = Object.keys(groups).sort().map(k=>{
    const day=groups[k], tot=day.length, wins=day.filter(t=>t.result==='Win').length;
    const wr=tot?(wins/tot*100):0, pnl=day.reduce((s,t)=>s+t.pnlValor,0);
    const si=day[0].balanceBefore, sf=day[day.length-1].balanceAfter, va=si?((sf-si)/si*100):0;
    return `<tr>
      <td class="mono">${k}</td><td class="mono">${tot}</td><td class="mono">${wr.toFixed(1)}%</td>
      <td class="mono ${pnl>0?'pos':pnl<0?'neg':'neu'}">${fmtMoney(pnl)}</td>
      <td class="mono ${va>0?'pos':va<0?'neg':'neu'}">${(va>=0?'+':'')+va.toFixed(2)}%</td>
      <td class="mono">${fmtMoney(sf)}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Data</th><th>Ops.</th><th>Acerto</th><th>Resultado</th><th>Variação</th><th>Saldo final</th>
  </tr></thead><tbody>${rows}</tbody></table></div>
  <div class="hint">Resultado dia a dia. Selecione "Todos os meses" para voltar à visão geral.</div>`;
}

function renderMonthly(list, wrap){
  if(!list.length){ wrap.innerHTML='<div class="empty" style="padding:20px 10px;">Sem operações para agrupar por mês.</div>'; return; }
  const groups={};
  list.forEach(t=>{ const k=monthKey(t.date); (groups[k]=groups[k]||[]).push(t); });
  const rows = Object.keys(groups).sort().reverse().map(k=>{
    const ml=groups[k], tot=ml.length, wins=ml.filter(t=>t.result==='Win').length;
    const wr=tot?(wins/tot*100):0, pnl=ml.reduce((s,t)=>s+t.pnlValor,0);
    const si=ml[0].balanceBefore, sf=ml[ml.length-1].balanceAfter, va=si?((sf-si)/si*100):0;
    return `<tr class="month-row" data-month="${k}" style="cursor:pointer;">
      <td class="mono">${monthLabel(k)}</td><td class="mono">${tot}</td><td class="mono">${wr.toFixed(1)}%</td>
      <td class="mono ${pnl>0?'pos':pnl<0?'neg':'neu'}">${fmtMoney(pnl)}</td>
      <td class="mono ${va>0?'pos':va<0?'neg':'neu'}">${(va>=0?'+':'')+va.toFixed(2)}%</td>
      <td class="mono">${fmtMoney(sf)}</td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table><thead><tr>
    <th>Mês</th><th>Ops.</th><th>Acerto</th><th>Resultado</th><th>Variação</th><th>Saldo final</th>
  </tr></thead><tbody>${rows}</tbody></table></div>
  <div class="hint">Clique em um mês para ver o resultado dia a dia.</div>`;
  wrap.querySelectorAll('.month-row').forEach(row=>{
    row.addEventListener('click',()=>{
      document.getElementById('filterMonth').value = row.dataset.month;
      saveFilter(); render();
      document.getElementById('statsGrid').scrollIntoView({behavior:'smooth',block:'start'});
    });
  });
}

function renderTable(list){
  const wrap = document.getElementById('tableWrap');
  if(!list.length){
    wrap.innerHTML='<div class="empty">Nenhuma operação registrada ainda.<br><b>Clique em "+ Nova operação"</b> para começar.</div>';
    return;
  }
  const rows = [...list].reverse().map(t=>{
    const pnlCls = t.result==='Win'?'pnl-win':(t.result==='Loss'?'pnl-loss':'pnl-be');
    const setupHtml = (t.confluences&&t.confluences.length)
      ? t.confluences.map(c=>`<span class="mini-tag">${c}</span>`).join('')
      : (t.setupLegacy ? `<span class="mini-tag">${t.setupLegacy}</span>` : '—');
    const tfHtml = (t.tfMacro||t.tfGatilho) ? `<div class="tf-hint">${t.tfMacro||'—'} → ${t.tfGatilho||'—'}</div>` : '';
    return `<tr>
      <td class="mono">${t.date}${t.time?' '+t.time:''}</td>
      <td><span class="mkt-tag ${t.market}">${t.market}</span></td>
      <td>${t.pair}</td><td>${t.direction}</td>
      <td class="tc-setup">${setupHtml}${tfHtml}</td>
      <td class="mono">${t.valorEntrada ? fmtMoney(parseFloat(t.valorEntrada)) : '—'}</td>
      <td class="mono">${t.entry||'—'} / ${t.stopPrice||'—'} / ${t.exit||'—'}</td>
      <td class="${pnlCls} mono">${fmtMoney(t.pnlValor)}</td>
      <td class="mono">${fmtMoney(t.balanceAfter)}</td>
      <td class="tc-notes" style="color:var(--dim);font-size:12px;max-width:180px;">${t.notes||''}</td>
      <td class="row-actions">
        <button class="btn edit-b" data-id="${t.id}">Editar</button>
        <button class="btn danger" data-id="${t.id}">Excluir</button>
      </td></tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table class="ops">
    <thead><tr>
      <th>Data</th><th>Mercado</th><th>Par</th><th>Direção</th><th>Setup</th>
      <th>Investido</th><th>Entrada / Stop / Saída</th><th>P&L</th><th>Saldo após</th><th>Obs.</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
  wrap.querySelectorAll('.btn.danger').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if(editingId===btn.dataset.id){ cancelForm(); }
      trades = trades.filter(t=>t.id!==btn.dataset.id);
      await saveTrades();
      buildMonthSelect();
      render();
    });
  });
  wrap.querySelectorAll('.btn.edit-b').forEach(btn=>{
    btn.addEventListener('click', ()=>startEdit(btn.dataset.id));
  });
}
```

### `prototype/js/chart.js`

```javascript
'use strict';

function renderChart(full, filtered){
  const list = (filtered && filtered.length) ? filtered : full;
  const labels = list.map(t=>t.date);
  const points = list.map(t=>t.balanceAfter);
  const base   = list.length ? list[0].balanceBefore : (parseFloat(capitalConfig.defaultInitial)||0);
  const ctx = document.getElementById('equityChart').getContext('2d');
  if(equityChart) equityChart.destroy();
  equityChart = new Chart(ctx,{
    type:'line',
    data:{
      labels: labels.length?['Início',...labels]:['Início'],
      datasets:[{
        data: points.length?[base,...points]:[base],
        borderColor:'#22E065', backgroundColor:'rgba(34,224,101,.10)',
        fill:true, tension:.25, pointRadius:2, borderWidth:2,
        pointBackgroundColor:'#FF3B4E'
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#8A8F8A',font:{size:10}}, grid:{color:'#2B2D2F'}},
        y:{ticks:{color:'#8A8F8A',font:{size:10}, callback:v=>fmtMoney(v)}, grid:{color:'#2B2D2F'}}
      }
    }
  });
}
```

### `prototype/js/capital-panel.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// PAINEL DE CAPITAL
// ──────────────────────────────────────────────────────────────────────────────
function syncCapitalPanel(){
  const key  = document.getElementById('capMonth').value;
  const mcfg = key ? (capitalConfig.months[key]||null) : null;
  const fi   = document.getElementById('capitalInicial');
  const fm   = document.getElementById('moeda');
  const btn  = document.getElementById('saveCapitalBtn');
  if(mcfg){
    fi.value = mcfg.initial; fi.disabled = true; fm.disabled = true;
    btn.textContent='Editar'; btn.dataset.mode='edit';
  } else {
    fi.value=''; fi.disabled=false; fm.disabled=false;
    btn.textContent='Salvar capital'; btn.dataset.mode='save';
  }
}

document.getElementById('capMonth').addEventListener('change', syncCapitalPanel);

document.getElementById('saveCapitalBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('saveCapitalBtn');
  const fi  = document.getElementById('capitalInicial');
  const fm  = document.getElementById('moeda');
  if(btn.dataset.mode==='edit'){
    fi.disabled=false; fm.disabled=false;
    btn.textContent='Salvar capital'; btn.dataset.mode='save';
    return;
  }
  const key = document.getElementById('capMonth').value;
  if(!key) return;
  const ini = parseFloat(fi.value);
  capitalConfig.months[key] = { initial: isNaN(ini)?0:ini };
  capitalConfig.currency = fm.value;
  await saveCapital();
  syncCapitalPanel();
  render();
});
```

### `prototype/js/form.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// CHIPS DE CONFLUÊNCIA
// ──────────────────────────────────────────────────────────────────────────────
document.querySelectorAll('#setupChips .chip').forEach(c=>{
  c.addEventListener('click', ()=>c.classList.toggle('on'));
});
function getChips(){ return [...document.querySelectorAll('#setupChips .chip.on')].map(c=>c.dataset.v); }
function clearChips(){ document.querySelectorAll('#setupChips .chip').forEach(c=>c.classList.remove('on')); }

// ──────────────────────────────────────────────────────────────────────────────
// FORMULÁRIO — cálculo R e eventos
// ──────────────────────────────────────────────────────────────────────────────
// Fórmula exata (seção 4.1): risco=|entrada−stop|; movimento invertido em Venda;
// R=movimento/risco; ganho=valorEntrada×R
function calcR(){
  const en  = parseFloat(document.getElementById('f_entry').value);
  const sp  = parseFloat(document.getElementById('f_stop_price').value);
  const ex  = parseFloat(document.getElementById('f_exit').value);
  const dir = document.getElementById('f_direction').value;
  const ve  = parseFloat(document.getElementById('f_valor_entrada').value);
  const prev = document.getElementById('previewLine');
  if(isNaN(en)||isNaN(sp)||isNaN(ex)||isNaN(ve)){
    prev.textContent='Preencha entrada, stop, saída e valor de entrada para calcular automaticamente.';
    return;
  }
  const risco = Math.abs(en-sp);
  if(risco===0){ prev.textContent='Preço de entrada e de stop não podem ser iguais (risco ficaria zero).'; return; }
  const mov = dir==='Compra' ? (ex-en) : (en-ex);
  const R   = mov/risco;
  const gan = ve*R;
  document.getElementById('f_valor_ganho').value = gan.toFixed(2);
  prev.textContent = `R = ${R.toFixed(2)} → ${gan>=0?'+':''}${fmtMoney(gan)} sobre o valor de entrada`;
}
['f_entry','f_stop_price','f_exit','f_valor_entrada'].forEach(id=>{
  document.getElementById(id).addEventListener('input', calcR);
});
document.getElementById('f_direction').addEventListener('change', calcR);

// Abrir / fechar formulário
const form      = document.getElementById('tradeForm');
const toggleBtn = document.getElementById('toggleFormBtn');

toggleBtn.addEventListener('click', ()=>{
  const opening = !form.classList.contains('open');
  if(opening && !editingId){
    form.reset(); clearChips();
    document.getElementById('f_date').valueAsDate = new Date();
    document.getElementById('previewLine').textContent = '';
  }
  form.classList.toggle('open');
  if(form.classList.contains('open')) calcR();
});

function cancelForm(){
  form.reset(); clearChips(); form.classList.remove('open');
  document.getElementById('previewLine').textContent = '';
  document.getElementById('editBanner').classList.remove('show');
  document.getElementById('submitBtn').textContent = 'Salvar operação';
  editingId = null;
}
document.getElementById('cancelFormBtn').addEventListener('click', cancelForm);

// Editar operação existente
function startEdit(id){
  const t = trades.find(x=>x.id===id);
  if(!t) return;
  editingId = id;
  const s = v=>id=>{ document.getElementById(id).value = v||''; };
  document.getElementById('f_date').value        = t.date||'';
  document.getElementById('f_time').value        = t.time||'';
  document.getElementById('f_market').value      = t.market||'Cripto';
  document.getElementById('f_pair').value        = t.pair||'';
  document.getElementById('f_direction').value   = t.direction||'Compra';
  document.getElementById('f_valor_entrada').value = t.valorEntrada||'';
  document.getElementById('f_entry').value       = t.entry||'';
  document.getElementById('f_stop_price').value  = t.stopPrice||'';
  document.getElementById('f_exit').value        = t.exit||'';
  document.getElementById('f_tf_macro').value    = t.tfMacro||'';
  document.getElementById('f_tf_gatilho').value  = t.tfGatilho||'';
  document.getElementById('f_valor_ganho').value = t.resultInput!==undefined ? t.resultInput : '';
  document.getElementById('f_notes').value       = t.notes||'';
  clearChips();
  (t.confluences||[]).forEach(v=>{
    const c = [...document.querySelectorAll('#setupChips .chip')].find(el=>el.dataset.v===v);
    if(c) c.classList.add('on');
  });
  document.getElementById('editBanner').classList.add('show');
  document.getElementById('submitBtn').textContent = 'Salvar edição';
  form.classList.add('open');
  calcR();
  form.scrollIntoView({behavior:'smooth', block:'center'});
}

// Submeter operação (nova ou edição)
form.addEventListener('submit', async function(e){
  e.preventDefault();
  const trade = {
    id:          editingId || (Date.now().toString(36)+Math.random().toString(36).slice(2,7)),
    date:        document.getElementById('f_date').value,
    time:        document.getElementById('f_time').value,
    market:      document.getElementById('f_market').value,
    pair:        document.getElementById('f_pair').value.trim(),
    direction:   document.getElementById('f_direction').value,
    confluences: getChips(),
    tfMacro:     document.getElementById('f_tf_macro').value,
    tfGatilho:   document.getElementById('f_tf_gatilho').value,
    valorEntrada:document.getElementById('f_valor_entrada').value,
    entry:       document.getElementById('f_entry').value,
    stopPrice:   document.getElementById('f_stop_price').value,
    exit:        document.getElementById('f_exit').value,
    resultMode:  'valor',
    resultInput: parseFloat(document.getElementById('f_valor_ganho').value)||0,
    notes:       document.getElementById('f_notes').value.trim()
  };
  if(editingId){
    trades = trades.map(t=> t.id===editingId ? trade : t);
  } else {
    trades.push(trade);
  }
  await saveTrades();
  buildMonthSelect();
  cancelForm();
  render();
});

// ──────────────────────────────────────────────────────────────────────────────
// FILTROS
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('filterMarket').addEventListener('change', ()=>{ saveFilter(); render(); });
document.getElementById('filterMonth').addEventListener('change',  ()=>{ saveFilter(); render(); });
```

### `prototype/js/print.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DE IMPRESSÃO — apenas para mês específico (seção 5.7)
// ──────────────────────────────────────────────────────────────────────────────
document.getElementById('printReportBtn').addEventListener('click', ()=>{
  const mon = getMonthFilter();
  if(mon==='all'){
    alert('Selecione um mês específico no filtro "Mês" acima para gerar o relatório. Não é possível imprimir todos os meses de uma vez.');
    return;
  }
  const full = computeSeries();
  const list = applyFilters(full);
  if(!list.length){
    alert(`Não há operações registradas em ${monthLabel(mon)} para o mercado selecionado.`);
    return;
  }
  const tot=list.length, wins=list.filter(t=>t.result==='Win').length, losses=list.filter(t=>t.result==='Loss').length;
  const wr=tot?(wins/tot*100):0, pnl=list.reduce((s,t)=>s+t.pnlValor,0);
  const si=list[0].balanceBefore, sf=list[list.length-1].balanceAfter, va=si?((sf-si)/si*100):0;
  const mktLabel = getMarketFilter()==='Todos' ? 'Todos os mercados' : getMarketFilter();
  const rows = list.map(t=>`<tr>
    <td>${t.date}${t.time?' '+t.time:''}</td><td>${t.market}</td><td>${t.pair}</td><td>${t.direction}</td>
    <td>${t.valorEntrada?fmtMoney(parseFloat(t.valorEntrada)):'—'}</td>
    <td>${t.entry||'—'} / ${t.stopPrice||'—'} / ${t.exit||'—'}</td>
    <td class="${t.pnlValor>0?'pr-pos':t.pnlValor<0?'pr-neg':''}">${fmtMoney(t.pnlValor)}</td>
    <td>${fmtMoney(t.balanceAfter)}</td></tr>`).join('');
  document.getElementById('printReport').innerHTML = `
    <div class="pr-header">
      <h1>Relatório de Trade — ${monthLabel(mon)}</h1>
      <div class="pr-sub">Mercado: ${mktLabel} · Gerado em ${new Date().toLocaleDateString('pt-BR')}</div>
    </div>
    <div class="pr-stats">
      <div><div class="pr-label">Operações</div><div class="pr-value">${tot}</div></div>
      <div><div class="pr-label">Taxa de acerto</div><div class="pr-value">${wr.toFixed(1)}%</div></div>
      <div><div class="pr-label">Wins / Losses</div><div class="pr-value">${wins} / ${losses}</div></div>
      <div><div class="pr-label">Resultado do mês</div><div class="pr-value ${pnl>=0?'pr-pos':'pr-neg'}">${fmtMoney(pnl)}</div></div>
      <div><div class="pr-label">Variação no mês</div><div class="pr-value ${va>=0?'pr-pos':'pr-neg'}">${(va>=0?'+':'')+va.toFixed(2)}%</div></div>
      <div><div class="pr-label">Saldo final</div><div class="pr-value">${fmtMoney(sf)}</div></div>
    </div>
    <div class="pr-section-title">Operações de ${monthLabel(mon)}</div>
    <table>
      <thead><tr><th>Data</th><th>Mercado</th><th>Par</th><th>Direção</th>
        <th>Investido</th><th>Entrada/Stop/Saída</th><th>P&L</th><th>Saldo após</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  window.print();
});
```

### `prototype/js/init.js`

```javascript
'use strict';

// ──────────────────────────────────────────────────────────────────────────────
// INICIALIZAÇÃO
// ──────────────────────────────────────────────────────────────────────────────
// loadAll() não é chamado diretamente aqui: cloud.js chama assim que o estado
// de autenticação resolve para um usuário logado (login salvo, ou recém-feito
// no formulário de entrada), pra garantir que stGet já enxergue o usuário
// certo antes de qualquer leitura.
```

### `prototype/js/register-sw.js`

```javascript
'use strict';

// Registro do service worker — habilita instalação como PWA e uso offline.
// Requer contexto seguro (https:// ou http://localhost); em file:// o
// navegador não expõe navigator.serviceWorker, então isso vira um no-op.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('Service worker não registrado:', e.message);
    });
  });
}
```

