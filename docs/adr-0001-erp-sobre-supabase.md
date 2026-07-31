# ADR-0001 — ERP da Vitaliti sobre Supabase, mantendo o site estático

- **Data:** 2026-07-31
- **Status:** Aceito
- **Contexto do projeto:** site institucional da Vitaliti Soluções com painel de
  gerenciamento (clientes, catálogo de serviços, orçamentos, PDF de proposta)

## Contexto

O site é um export de ferramenta de design: HTML com templates `<x-dc>`
interpretados por um runtime React próprio (`support.js`, gerado — não editável
à mão). O painel `Gerenciamento.dc.html` já existia funcionando, porém:

- os dados viviam em `localStorage`, isolados por navegador;
- o "login" comparava senha em texto puro contra um array no próprio JavaScript
  (`admin@vitaliti.com` / `vitaliti123`), visível para qualquer visitante que
  abrisse o arquivo;
- o botão "Entrar com Google" apenas abria a sessão do administrador.

Ou seja: não havia autenticação nem banco. Qualquer pessoa com a URL tinha
acesso total ao painel.

## Decisão

### 1. Manter o site estático e trocar só a camada de dados

O `vitaliti-store.js` foi reescrito sobre `supabase-js`, preservando a mesma
superfície pública (`window.VS`). A UI não foi reescrita.

Isso é possível porque a UI segue um padrão consistente: muta `db.clients`,
`db.services` e `db.quotes` em memória e depois chama `VS.persist()`. Todas as
gravações passam por ali — nenhuma exceção. Então `persist()` virou um *diff*
contra o último snapshot sincronizado, que emite apenas os `insert`/`update`/
`delete` correspondentes.

**Alternativa descartada:** migrar para Next.js. Daria rotas protegidas no
servidor, mas os templates `<x-dc>` não convertem automaticamente — seria
reescrever a UI inteira. Custo alto demais para o ganho, e contraria o princípio
de simplicidade.

### 2. Segurança mora no banco, não na UI

O site é estático: `Gerenciamento.dc.html` pode ser baixado por qualquer um, e
não há como impedir isso sem servidor. **Esconder a tela não é proteção.**

A proteção real é RLS no Postgres:

- `anon` não recebe `grant` em nenhuma tabela — visitante anônimo não lê nada;
- `authenticated` lê e grava clientes, serviços e orçamentos;
- `DELETE` exige `perfil = 'Administrador'`, verificado via `public.is_admin()`;
- `activity_log` é append-only (só `select` e `insert`);
- `settings` só o administrador grava.

A função `VS.can()` na UI continua existindo, mas é cosmética: esconde botões.
Quem barra de fato são as policies.

O projeto foi criado com *"automatically expose new tables"* desligado, então
uma tabela nova nasce inacessível pela Data API. A migration dá `grant`
explícito só nas tabelas que o ERP usa.

### 3. Itens do orçamento em `jsonb`

`quotes.itens` é `jsonb` em vez de tabela filha. A UI sempre lê e grava a lista
inteira de uma vez (`JSON.parse(JSON.stringify(draft))`), nunca um item isolado,
e não há relatório que agregue por item. Tabela filha só acrescentaria joins.

**Revisar se:** surgir necessidade de relatório do tipo "quanto faturamos com
cabeamento estruturado no ano", que exigiria agregação por item.

### 4. Sessão com espelho local

`VS.session()` precisa ser síncrono porque o `index.html` consulta a sessão para
decidir a nav antes de qualquer `await`. O store mantém um espelho leve em
`localStorage` (`vitaliti.session.v2`) e o confere com o servidor em segundo
plano, avisando via `VS.onSession()` quando corrige.

O espelho guarda só nome, e-mail, perfil e iniciais — **nunca token**. Os tokens
ficam sob responsabilidade do `supabase-js`.

### 5. `supabase-js` vendorizado

`vendor/supabase-js.min.js` é commitado em vez de carregado por CDN. Um ERP não
deve parar de funcionar porque um CDN de terceiros caiu, e evita executar código
que pode mudar sem aviso.

*(Pendência: o `index.html` ainda carrega `lucide` do unpkg — mesmo raciocínio
se aplica, mas é só ícone decorativo e não bloqueia o uso.)*

### 6. Numeração de propostas

O número da proposta é calculado no cliente (`max + 1`) e protegido por índice
único no banco. Se dois usuários gerarem o mesmo número ao mesmo tempo, o
`insert` falha com `23505` e o store renumera e tenta de novo — em vez de
mostrar erro para quem salvou por último.

## Consequências

**Positivas**
- Dados centralizados: a equipe vê o mesmo conteúdo em qualquer máquina.
- Senha some do código-fonte; autenticação passa a ser gerenciada.
- Deploy no Vercel continua estático — sem build, sem servidor, sem custo.

**Negativas / limites aceitos**
- Sem edição concorrente: quem salvar por último sobrescreve o registro. Aceitável
  para uma equipe pequena; se virar problema, adicionar checagem de `updated_at`.
- Toda a base é carregada na abertura. Fica adequado até a ordem de alguns
  milhares de registros; acima disso é preciso paginar no servidor.
- O HTML do painel continua público. É o esperado — ele não contém dado nenhum.
