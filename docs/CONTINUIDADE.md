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
MCP do Supabase aponta para outra organização e não enxerga este projeto — ele
responde "You do not have permission to perform this action" para este ref.

**O projeto Supabase está no plano Free e pausa sozinho por inatividade.**
Leia 3.9 antes de investigar qualquer falha de login ou de carregamento de
dados depois de um período sem mexer no projeto.

### Cópia local

Não é necessária para o projeto funcionar — GitHub, Vercel e Supabase bastam.
Quando quiser uma:

```bash
git clone https://github.com/ArthurPr0g/VitaliTI.git
```

O design system deste projeto foi extraído para
[github.com/ArthurPr0g/design-systems](https://github.com/ArthurPr0g/design-systems)
(privado), no diretório `vitaliti/`. Mudança de identidade visual deveria
acontecer lá e vir para cá, não o contrário.

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

**No PDF nada empurra nada.** jsPDF desenha por coordenada: um texto mais alto
que o espaço reservado não move o que vem depois, é coberto por ele. Toda
altura de linha precisa ser calculada a partir do texto real, com
`splitTextToSize`, antes de desenhar. Isso já falhou duas vezes — na observação
do fecho e na descrição do serviço, onde a altura era fixa em 10mm e descrição
de duas linhas ou mais sumia atrás da faixa "Total dos serviços".

A visualização em HTML **não** reproduz esse tipo de falha: lá a tabela cresce
sozinha. Conferir na tela não serve para validar o PDF.

**Como testar o PDF sem passar pelo login:** monte uma página com
`vendor/jspdf.umd.min.js` e `vitaliti-pdf.js`, chame `VitalitiPDF.gerar(p)` com
um objeto `p` fabricado e jogue `doc.output('datauristring')` num `<iframe>`.
Sirva a pasta com `npx serve` para os caminhos relativos da logo funcionarem.
Inclua sempre um serviço sem descrição, um com uma linha e um com cinco — é
onde os erros aparecem. E compare com a versão anterior do arquivo
(`git show HEAD:vitaliti-pdf.js`) para confirmar que o teste realmente
reproduzia o defeito.

### 3.9 O Supabase pausa sozinho e o painel some junto

O plano Free pausa o projeto depois de um período sem atividade. Aconteceu em
setembro de 2026, depois de algumas semanas sem mexer no sistema.

O sintoma engana. O site institucional continua **no ar**, porque é estático na
Vercel e não depende do banco. Quem quebra é só o painel de gerenciamento:
login, clientes e orçamentos param. Se o cliente disser "o site não abre",
pergunte qual das duas páginas ele estava usando antes de procurar bug.

O diagnóstico leva dez segundos e não precisa do painel do Supabase — com o
projeto pausado, o host **deixa de existir no DNS**:

```bash
curl https://yolakwvyxeiubfditiig.supabase.co/auth/v1/settings
```

Se o nome não resolver, está pausado. Se responder 200, o banco está de pé e o
problema é outro.

**Conserto:** entrar no dashboard do Supabase com a conta `progimports01@gmail.com`
e clicar em **Resume project**. Os dados ficam intactos — inclusive backups e
storage. A retomada leva alguns minutos até o DNS voltar. Só abrir o projeto no
dashboard já pode disparar a retomada.

Depois de retomar, confirme que a trava de segurança sobreviveu (ver 3.5):

```bash
curl https://yolakwvyxeiubfditiig.supabase.co/auth/v1/settings
```

`disable_signup` tem que continuar `true`.

**Para não repetir:** só o plano Pro elimina a pausa. Manter atividade
artificial com requisições periódicas é paliativo e não há garantia de que
segure indefinidamente.

### 3.10 Baixar e compartilhar não podem sair do mesmo botão

Havia um botão só, "Baixar / Compartilhar PDF", e a função tentava
`navigator.share` primeiro, caindo para `doc.save()` quando não houvesse
suporte. A lógica parece razoável e funciona no celular.

No Windows 11 não. O Edge e o Chrome atendem `canShare({files})`, então abria a
folha de compartilhamento do sistema — **que não tem opção de salvar arquivo**.
O usuário via a janela do Windows com WhatsApp, Outlook e Teams, e não havia
caminho nenhum para obter o PDF.

Agora são duas ações independentes, e quem escolhe é o botão apertado:

- `VitalitiPDF.baixar(p)` — sempre `doc.save()`, nunca compartilha.
- `VitalitiPDF.compartilhar(p)` — sempre a folha; sem suporte, cai para salvar.
- `VitalitiPDF.podeCompartilhar()` — decide se o botão "Compartilhar" aparece.

`VitalitiPDF.abrir()` continua existindo como apelido de `baixar()`, para uma
aba que ainda tenha o HTML antigo em cache.

`navigator.share` só funciona dentro do gesto do usuário: nada de `await`,
`setState` ou promessa antes da chamada.

**Ao testar download em navegador automatizado:** o Chrome bloqueia downloads
automáticos repetidos na mesma página — o primeiro cai no disco e os seguintes
viram `.tmp` pendente. Para medir o comportamento sem depender disso, troque
`doc.save`. Ele é instalado na **instância**, não no protótipo do jsPDF, então o
espião precisa envolver o construtor `window.jspdf.jsPDF`.

### 3.11 Como abrir o painel sem login, para testar

O gerenciamento só renderiza depois de autenticar no Supabase, o que trava
qualquer teste de tela. A saída é trocar **só a camada de dados** do `VS`,
mantendo o painel inteiro rodando de verdade:

1. Copie `Gerenciamento.dc.html` para um arquivo temporário e insira
   `<script src="./_stub.js"></script>` logo depois da tag do
   `vitaliti-store.js`.
2. No `_stub.js`, sobrescreva `VS.init` (devolve `{ session }` de mentira),
   `VS.load` e `VS.reload` (devolvem um banco sintético), mais `VS.session`,
   `VS.can`, `VS.onError`, `VS.persist` e `VS.logAction` como no-ops. Deixe
   `brl`, `monthLabel`, `quoteParts` e `quoteTotals` intactos — são eles que
   você quer exercitar.
3. O stub **precisa** de guarda de idempotência: ele está no bloco `helmet` e
   é reexecutado a cada render (ver 3.1).
4. Sirva a pasta com `npx serve` e abra o arquivo temporário.
5. Apague o arquivo temporário e o stub antes de commitar. A raiz do
   repositório é servida como site: qualquer arquivo ali fica público.

O formato do banco sintético é `{ clients, quotes, services, activity,
settings }`. Em `quotes`, `data` é ISO `aaaa-mm-dd` e `itens` é
`{ servicos: [{nome, valor, descricao}], produtos: [{nome, qtd, valor}] }`.

**Em `localhost` o painel redireciona para o login do Google** em vez de
mostrar a tela de entrada. Não é defeito do código — a versão publicada faz o
mesmo — mas é o motivo de o stub existir: sem ele não há como ver o painel
localmente.

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
