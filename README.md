# Site institucional Vitaliti Soluções + ERP

Site público estático com painel de gerenciamento (ERP) protegido por login.

| | |
|---|---|
| **Produção** | https://vitalitisolucoes.com.br |
| **Hospedagem** | Vercel — projeto `site-institucional-vitaliti-solu-es-...` (`prj_UQL1UYQopy13QRoipEzFHVILu7zG`) |
| **Banco / Auth** | Supabase — projeto `vitaliti-erp`, org `Reserva`, região `sa-east-1` |
| **Stack** | HTML estático + runtime React embutido (`support.js`) + `supabase-js` |

## Estrutura

```
index.html               Site público. A nav muda conforme a sessão.
Gerenciamento.dc.html    ERP: dashboard, clientes, serviços, orçamentos, PDF.
contratos.html           Página de contratos.
vitaliti-config.js       URL e chave publishable do Supabase.
vitaliti-store.js        Camada de dados (window.VS). Auth + CRUD + sync.
support.js               Runtime dos templates <x-dc>. GERADO — não editar.
doc-page.js              Runtime auxiliar. GERADO — não editar.
vendor/                  supabase-js (vendorizado, não vem de CDN).
supabase/migrations/     Schema e RLS.
docs/                    ADRs.
```

`support.js` e `doc-page.js` são artefatos de build da ferramenta de design.
Editar à mão significa perder a alteração no próximo export.

## Rodar local

```bash
npx serve -p 4321 .
```

Abre em http://localhost:4321. O ERP fica em `/Gerenciamento.dc.html`.
`http://localhost:4321/**` já está na lista de redirect URLs do Supabase, então
login e recuperação de senha funcionam igual em produção.

## Banco de dados

O schema está em [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
Para aplicar num projeto novo, cole o arquivo inteiro no SQL Editor do Supabase
e execute. Ele é idempotente — pode rodar de novo sem quebrar.

Tabelas: `app_users`, `clients`, `services`, `quotes`, `activity_log`, `settings`.

## Segurança — o que sustenta o "protegido por login"

O site é estático. `Gerenciamento.dc.html` pode ser baixado por qualquer pessoa
e **isso é esperado**: o arquivo não contém dado nenhum, só a interface. O que
protege os dados:

1. **RLS em todas as 6 tabelas.** O papel `anon` não tem nenhum privilégio no
   schema `public` — leitura anônima devolve `401 permission denied`.
2. **Cadastro público desligado.** Sem isso, qualquer um usaria a chave
   publishable (que é pública, por definição) para chamar `signUp()`, virar
   `authenticated` e ler tudo. Continua desligado — novos usuários só pelo
   painel do Supabase.
3. **DELETE exige perfil Administrador**, verificado no banco via
   `public.is_admin()`, não na interface.

Detalhes e alternativas descartadas em
[`docs/adr-0001-erp-sobre-supabase.md`](docs/adr-0001-erp-sobre-supabase.md).

### Dar acesso a um novo funcionário

1. Supabase → **Authentication → Users → Add user**
2. Definir e-mail e senha, marcar **Auto Confirm User**
3. O perfil em `app_users` é criado sozinho (trigger `on_auth_user_created`),
   com `perfil = 'Funcionário'`
4. Para promover a administrador:

```sql
update public.app_users set perfil = 'Administrador'
where email = 'pessoa@vitaliti.com.br';
```

### Chaves

`vitaliti-config.js` contém a chave **publishable** — pública por definição,
pode ficar no repositório. A chave **secret / service_role** ignora RLS e nunca
deve entrar em nenhum arquivo servido ao navegador.

## Deploy

Push na branch `main` → Vercel publica. Sem build: os arquivos são servidos
como estão.
