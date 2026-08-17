# Continuidade do projeto

Documento para quem for continuar o desenvolvimento — outra pessoa, outra
ferramenta ou você mesmo daqui a alguns meses.

Leia as **armadilhas** antes de editar qualquer arquivo. Todas custaram tempo
para descobrir e nenhuma é evidente lendo o código.

---

## 1. Onde está cada coisa

| | |
|---|---|
| **Código** | github.com/ArthurPr0g/VitaliTI (branch `main`) |
| **Deploy** | Vercel, projeto `prj_UQL1UYQopy13QRoipEzFHVILu7zG`, org `prog-solucoes` |
| **Publicação** | automática: push no `main` → Vercel publica. Sem passo manual. |
| **Site** | https://www.vitalitisolucoes.com.br (o apex redireciona para www) |
| **Banco / Auth** | Supabase, projeto `vitaliti-erp`, ref `yolakwvyxeiubfditiig`, região `sa-east-1` |

**A conta do Supabase é `progimports01@gmail.com`, organização "Reserva".**
Não é a mesma conta dos outros projetos. Isso já causou confusão: o conector
MCP do Supabase aponta para outra organização e não enxerga este projeto.

### Credenciais

- **Chave publishable** (`vitaliti-config.js`): pública por definição, pode
  ficar no repositório. É protegida pelo RLS.
- **Chave secret / service_role**: nunca deve entrar em arquivo servido ao
  navegador. Ela ignora o RLS.
- **Senha do banco**: não está no projeto. Está no gerenciador de senhas de
  quem criou o projeto Supabase.
- `.env.local` e `.vercel/` são ignorados pelo git. Recriam-se com
  `vercel link` e só são necessários para publicar pela linha de comando.

---

## 2. Rodar local

```bash
npx serve -p 4321 .
```

Abre em http://localhost:4321. O painel fica em `/Gerenciamento.dc.html`.

`http://localhost:4321/**` já está na lista de redirect URLs do Supabase, então
login e recuperação de senha funcionam igual em produção.

Não há build. Os arquivos são servidos como estão.

---

## 3. Armadilhas

### 3.1 O runtime `<x-dc>` reexecuta os scripts do bloco `helmet`

`support.js` e `doc-page.js` são gerados por ferramenta de design. **Não
editar à mão** — a alteração se perde no próximo export.

Os `<script>` dentro do bloco `helmet` do template são reinjetados no `head`
**a cada render**. O arquivo é baixado várias vezes por carregamento (200
seguido de vários 304 no DevTools). Qualquer script com estado em memória
precisa de guarda de idempotência — o `vitaliti-store.js` tem uma no topo.

Mover as tags para o `head` real **não** resolve: o `support.js` depende da
ordem de carga e a página deixa de renderizar (fica com `dc-root` vazio).

### 3.2 Nunca escrever os nomes das tags do runtime entre `<` e `>` em comentário

O `support.js` localiza o template procurando essa string no documento, e
comentário HTML não esconde nada dele. Ele encontra a ocorrência do comentário
primeiro e a página passa a despejar o texto do comentário na tela.

Isso derrubou o site em produção uma vez.

### 3.3 O arquivo usa `style` inline em quase tudo

Regra de folha de estilo perde para `style` inline. Toda sobrescrita em
`@media` precisa de `!important`. Isso já causou três bugs:

- o PDF continuava com fonte 11px porque a tabela tem `font-size` inline;
- o título do cabeçalho continuava truncado no celular;
- o cabeçalho da tabela não sumia (ali o problema era ordem: duas regras com
  `!important` e mesma especificidade — resolvido usando duas classes).

### 3.4 O RLS nega gravação em silêncio

Quando a policy recusa um `update` ou `delete`, o PostgREST responde **200 com
zero linhas**, não um erro. Código que só checa `res.error` acha que gravou.

O store trata isso: todo `update`/`delete` pede as linhas de volta com
`.select()` e exige ao menos uma. Se mexer nessa camada, manter esse cuidado.

### 3.5 `disable_signup` é o que sustenta toda a segurança

A chave publishable é pública. Com "Allow new users to sign up" ligado — que é
o padrão do Supabase — qualquer pessoa chama `signUp()`, vira `authenticated`
e as policies liberam a base inteira.

Conferir pelo endpoint público, não pela tela do painel:

```
https://yolakwvyxeiubfditiig.supabase.co/auth/v1/settings
```

`disable_signup` tem que estar `true`.

### 3.6 O formato de `quotes.itens` mudou duas vezes

Já existiram três formatos em produção:

1. lista plana `[{nome, qtd, valor}]`
2. lista de serviços com produtos aninhados
3. **atual**: `{ servicos: [], produtos: [] }` — listas irmãs, produto não
   pertence a serviço

`VS.quoteParts()` normaliza os três. Um registro antigo se converte sozinho na
primeira vez que for salvo. Não remover esse fallback sem confirmar que não há
mais registros nos formatos antigos.

### 3.7 O `<input type="date">` mostra o formato do idioma do NAVEGADOR

Não existe atributo nem CSS que mude isso. Num Chrome em inglês aparece
mm/dd/aaaa mesmo com a página em português. Por isso os campos de data são
texto com máscara (`VS.maskDate` / `VS.dateToISO` / `VS.isoToDateBR`).

### 3.8 O PDF é gerado por código, não pela impressão do navegador

`vitaliti-pdf.js` monta o arquivo com jsPDF. A razão: com `window.print()`, a
orientação, o cabeçalho com URL/data e a paginação são decididos pelo diálogo
de impressão — o `@page` do CSS é uma sugestão que o usuário e o iOS
sobrepõem. Cinco tentativas de resolver por CSS falharam antes disso.

Se for mexer no layout do documento, é nesse arquivo — não no HTML da
visualização (que serve só para conferir na tela).

---

## 4. Modelo de dados

Migrations em `supabase/migrations/`. Tabelas: `app_users`, `clients`,
`services`, `quotes`, `activity_log`, `settings`.

Pontos que não se deduzem do schema:

- **`clients.nome` é a pessoa de contato; `clients.empresa` é a empresa.**
  Já foi o contrário. `clientLabel()` monta "Contato — Empresa" para a tela e
  `clientCompany()` devolve só a empresa para o PDF.
- **`services` está sem uso.** A página de Serviços foi removida; serviço é
  digitado dentro do próprio orçamento. A tabela continua lá com os 6
  registros do seed inicial.
- **`settings.validade_dias` está sem uso** desde que a validade padrão foi
  removida.
- **RLS**: `authenticated` lê e grava; `DELETE` exige perfil `Administrador`
  via `public.is_admin()`; `anon` não tem nenhum privilégio no schema `public`.

---

## 5. Pendências conhecidas

- **Segunda página do PDF sem margem no topo** em orçamentos grandes. A
  densidade foi calibrada para caber em uma folha até ~26 linhas, então é raro.
- **`index.html` carrega ícones do `unpkg.com`.** O `supabase-js` e o `jsPDF`
  foram vendorizados; os ícones não. São decorativos, mas o site depende de um
  CDN de terceiros para renderizar completo.
- **Nenhuma das páginas tem teste automatizado.** A validação foi toda por
  inspeção do DOM e medição no navegador.

---

## 6. Lição de método

Duas falhas desta fase vieram do mesmo erro: **validar medindo o DOM em vez de
olhar a página renderizada**.

- A verificação disse "44 imagens, nenhuma quebrada" e estava correta — as
  imagens existiam no DOM, mas o container estava com `opacity: 0` e a seção
  aparecia como um retângulo preto no iPhone.
- As meta tags de SEO foram conferidas lendo o DOM; estavam certas, mas um
  comentário havia quebrado o parse do template e o site não renderizava.

Foto de aparelho real encontrou as duas. Medição sozinha não encontra.
