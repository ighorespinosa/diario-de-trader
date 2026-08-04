# Diário de Trade

Diário de trade para operações de Cripto e Forex — controle de capital por mês, cálculo automático de resultado por múltiplo de risco (R), indicador de killzone (sessão de mercado) por aritmética de UTC, e relatório de impressão por mês.

Este repositório tem duas partes:

- **[`diario_de_trade_especificacao_completa_v2.md`](diario_de_trade_especificacao_completa_v2.md)** — a especificação técnica completa (em português): modelo de dados, todas as fórmulas de negócio, fluxos de usuário, design system e regras de migração de dados legados. É a fonte da verdade, escrita para servir de blueprint para reimplementação nativa (iOS/Android/desktop).
- **[`prototype/`](prototype/)** — o protótipo web funcional descrito por essa especificação, extraído em arquivos separados.

## Rodando o protótipo

Não há build system, bundler ou dependências para instalar. Basta abrir o arquivo direto no navegador:

```bash
prototype/index.html
```

Dois jeitos de abrir:
- **Duplo clique** no arquivo (ou `file://` no navegador) — funciona porque os módulos JS são carregados via `<script src>` clássico (sem `type="module"`), que não esbarra em CORS ao rodar como arquivo local.
- **Servidor local** (opcional, só se preferir): `npx serve prototype` ou qualquer servidor estático, depois abrir `http://localhost:<porta>`.

Nenhuma etapa de instalação é necessária — Chart.js e as fontes (Google Fonts) são carregados via CDN no próprio `index.html`.

### Persistência de dados

O app grava tudo em `localStorage` do navegador (chaves `trades-data`, `capital-config`, `filter-config`, `location-config`). Não há backend — os dados ficam só naquele navegador/perfil. Para reiniciar do zero, limpe o `localStorage` do site ou abra em uma aba anônima.

## Instalar como app (PWA)

O protótipo tem `manifest.json` + service worker (`sw.js`), então dá pra instalar como app de verdade (ícone próprio, janela sem barra de navegador, funciona offline depois do primeiro carregamento). **Só funciona servido por HTTPS ou `http://localhost`** — navegadores não permitem service worker em `file://`. Abrindo `index.html` por duplo clique, o app funciona normalmente, só não aparece o botão "Instalar".

Formas de servir por HTTPS/localhost:
- **GitHub Pages** (mais simples, sem manter nada rodando): habilite em Settings → Pages, servindo a pasta `prototype/` da branch `master` — daí é só abrir a URL `https://<usuario>.github.io/<repo>/` e clicar em "Instalar app" na barra de endereço.
- **Servidor local**: `npx serve prototype` (ou qualquer servidor estático) e abrir `http://localhost:<porta>`.

## Estrutura do protótipo

```
prototype/
  index.html         # marcação + <link> de estilo + CDN (Chart.js, Google Fonts) + <script> dos módulos, nesta ordem
  styles.css          # design system ("cockpit noturno") — tokens de cor, tipografia, layout
  manifest.json        # metadados de instalação PWA (nome, ícone, cores, display standalone)
  icon.svg              # ícone do app (mesmo gradiente/estilo do logo-mark da UI)
  sw.js                   # service worker — cache-first com atualização em segundo plano
  js/
    storage.js         # adaptador de storage (window.storage com fallback para localStorage)
    state.js            # estado global (trades, capitalConfig, editingId, equityChart)
    data.js              # carga inicial + migração de registros legados
    killzone.js          # localização/fuso horário e cálculo de killzone (aritmética de UTC)
    calculations.js      # formatação monetária + cálculo de saldo (computeSeries)
    filters.js            # filtros de mercado/mês
    render.js              # renderização das telas (stats, tape, resultados, tabela)
    chart.js                # gráfico de evolução de capital (Chart.js)
    capital-panel.js         # painel de configuração de capital por mês
    form.js                   # formulário de nova operação + cálculo de R ao vivo
    print.js                   # geração do relatório de impressão
    init.js                     # ponto de entrada — chama loadAll()
    register-sw.js               # registra o service worker (no-op em file://)
```

A ordem das tags `<script>` no `index.html` importa: alguns módulos (`killzone.js`) rodam código no carregamento, antes de `init.js` chamar `loadAll()`. Veja a nota no início da seção 12 da especificação antes de reordenar ou portar isso para outra plataforma.

## Convenções deste repositório

Ver [`CLAUDE.md`](CLAUDE.md) para as regras de como manter a especificação e o `prototype/` sincronizados (a seção 12 do `.md` é cópia literal dos arquivos em `prototype/`, nunca retranscrita à mão).
