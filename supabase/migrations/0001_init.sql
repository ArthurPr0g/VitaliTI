-- Vitaliti ERP — schema inicial
-- Modelo single-tenant: todos os usuários autenticados são a equipe Vitaliti.
-- Isolamento entre empresas NÃO é objetivo aqui; o controle é por perfil.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- perfis (espelha auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.app_users (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text        not null default '',
  email      text        not null,
  perfil     text        not null default 'Funcionário'
             check (perfil in ('Administrador', 'Funcionário')),
  iniciais   text        not null default '',
  created_at timestamptz not null default now()
);

comment on table public.app_users is
  'Perfil da equipe Vitaliti. Criado automaticamente no primeiro login (trigger).';

-- Deriva iniciais a partir do nome: "Arthur Matos" -> "AM"
create or replace function public.derive_iniciais(p_nome text, p_email text)
returns text
language sql
immutable
as $fn$
  select coalesce(
    nullif(
      upper(
        substr(split_part(trim(p_nome), ' ', 1), 1, 1) ||
        coalesce(
          nullif(substr(split_part(trim(p_nome), ' ', array_length(string_to_array(trim(p_nome), ' '), 1)), 1, 1), ''),
          ''
        )
      ),
      ''
    ),
    upper(substr(p_email, 1, 2))
  );
$fn$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_nome text;
begin
  v_nome := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.app_users (id, nome, email, iniciais)
  values (new.id, v_nome, new.email, public.derive_iniciais(v_nome, new.email))
  on conflict (id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- clientes
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id         uuid primary key,
  nome       text        not null,
  doc        text        not null default '',
  empresa    text        not null default '',
  email      text        not null default '',
  telefone   text        not null default '',
  whatsapp   text        not null default '',
  endereco   text        not null default '',
  cidade     text        not null default '',
  uf         text        not null default '',
  cep        text        not null default '',
  obs        text        not null default '',
  created_at date        not null default current_date,
  updated_at timestamptz not null default now()
);

create index if not exists clients_nome_idx on public.clients (nome);
create index if not exists clients_uf_idx   on public.clients (uf);

-- ---------------------------------------------------------------------------
-- catálogo de serviços
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id         uuid primary key,
  nome       text          not null,
  categoria  text          not null default 'Geral',
  descricao  text          not null default '',
  valor      numeric(12,2) not null default 0 check (valor >= 0),
  unidade    text          not null default 'un',
  status     text          not null default 'Ativo'
             check (status in ('Ativo', 'Inativo')),
  updated_at timestamptz   not null default now()
);

create index if not exists services_categoria_idx on public.services (categoria);

-- ---------------------------------------------------------------------------
-- orçamentos
--
-- `itens` fica em jsonb: a UI sempre lê e grava a lista inteira de uma vez
-- (JSON.parse(JSON.stringify(draft))), nunca item isolado. Tabela filha só
-- adicionaria joins sem ganho. Ver ADR-0002.
-- ---------------------------------------------------------------------------
create table if not exists public.quotes (
  id          uuid primary key,
  numero      integer     not null,
  cliente_id  uuid        not null references public.clients (id) on delete cascade,
  data        date        not null default current_date,
  validade    date,
  itens       jsonb       not null default '[]'::jsonb,
  desc_tipo   text        not null default 'R$' check (desc_tipo in ('R$', '%')),
  desc_valor  numeric(12,2) not null default 0 check (desc_valor >= 0),
  condicoes   text        not null default '',
  obs         text        not null default '',
  status      text        not null default 'Em andamento'
              check (status in ('Em andamento', 'Enviado', 'Aprovado', 'Pendente', 'Recusado', 'Cancelado')),
  created_at  date        not null default current_date,
  updated_at  timestamptz not null default now()
);

-- Numeração da proposta é única: o cliente calcula max+1 e o store faz retry
-- se dois usuários gerarem o mesmo número ao mesmo tempo.
create unique index if not exists quotes_numero_key on public.quotes (numero);
create index if not exists quotes_cliente_idx on public.quotes (cliente_id);
create index if not exists quotes_status_idx  on public.quotes (status);

-- ---------------------------------------------------------------------------
-- log de atividade (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.activity_log (
  id        uuid primary key default gen_random_uuid(),
  entidade  text        not null,
  ref       text        not null default '',
  acao      text        not null,
  autor     text        not null default 'sistema',
  at        timestamptz not null default now()
);

create index if not exists activity_log_at_idx on public.activity_log (at desc);

-- ---------------------------------------------------------------------------
-- configurações da empresa (linha única)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id            smallint primary key default 1 check (id = 1),
  nome          text    not null default 'Vitaliti Soluções Tecnológicas',
  cnpj          text    not null default '',
  endereco      text    not null default '',
  telefone      text    not null default '',
  email         text    not null default '',
  instagram     text    not null default '',
  site          text    not null default '',
  condicoes     text    not null default '',
  rodape        text    not null default '',
  mensagem      text    not null default '',
  validade_dias integer not null default 15 check (validade_dias > 0),
  updated_at    timestamptz not null default now()
);

insert into public.settings (id, cnpj, endereco, telefone, email, instagram, site, condicoes, rodape, mensagem)
values (
  1,
  '00.000.000/0001-00',
  'Goiânia — GO',
  '(62) 99206-2304',
  'vitalitiengenharia@gmail.com',
  '@vitalitisolucoes',
  'vitalitisolucoes.com.br',
  '50% na aprovação da proposta e 50% na entrega do serviço. Pix, boleto ou cartão em até 6x sem juros.',
  'Vitaliti Soluções Tecnológicas — infraestrutura, segurança eletrônica e automação. Proposta sujeita a vistoria técnica no local.',
  'Agradecemos a oportunidade de apresentar esta proposta. Estamos à disposição para qualquer esclarecimento.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

do $do$
declare t text;
begin
  foreach t in array array['clients', 'services', 'quotes', 'settings'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $do$;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Regra: qualquer usuário autenticado (equipe Vitaliti) lê e escreve.
-- DELETE é restrito a Administrador — espelha VS.can(sess, 'excluir') na UI,
-- que sozinho é só cosmético: a garantia real está aqui.
-- Anônimo não enxerga nada.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.app_users
    where id = auth.uid() and perfil = 'Administrador'
  );
$fn$;

alter table public.app_users    enable row level security;
alter table public.clients      enable row level security;
alter table public.services     enable row level security;
alter table public.quotes       enable row level security;
alter table public.activity_log enable row level security;
alter table public.settings     enable row level security;

-- app_users: cada um lê todos os perfis (a UI mostra autor no log),
-- mas só Administrador altera perfil de alguém.
drop policy if exists app_users_select on public.app_users;
create policy app_users_select on public.app_users
  for select to authenticated using (true);

drop policy if exists app_users_update_self on public.app_users;
create policy app_users_update_self on public.app_users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists app_users_delete on public.app_users;
create policy app_users_delete on public.app_users
  for delete to authenticated using (public.is_admin());

-- clients / services / quotes: leitura e escrita para a equipe, delete só admin
do $do$
declare t text;
begin
  foreach t in array array['clients', 'services', 'quotes'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s
                    for select to authenticated using (true)', t);

    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s
                    for insert to authenticated with check (true)', t);

    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_update on public.%1$s
                    for update to authenticated using (true) with check (true)', t);

    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_delete on public.%1$s
                    for delete to authenticated using (public.is_admin())', t);
  end loop;
end $do$;

-- activity_log: append-only. Ninguém edita nem apaga pelo cliente.
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated using (true);

drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log
  for insert to authenticated with check (true);

-- settings: linha única, todos leem, só Administrador grava.
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to authenticated using (true);

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Grants explícitos para a Data API
--
-- O projeto foi criado com "automatically expose new tables" desligado: uma
-- tabela nova nasce inacessível via PostgREST até alguém liberar de propósito.
-- Liberamos só o que o ERP usa. RLS continua sendo o filtro de linha; isto
-- aqui é o filtro de tabela.
--
-- `anon` não recebe nada: o site público não lê o banco.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.clients  to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.quotes   to authenticated;
grant select, insert, update, delete on public.app_users to authenticated;
grant select, insert                 on public.activity_log to authenticated;
grant select, update                 on public.settings to authenticated;

-- O Supabase concede truncate/references/trigger ao `anon` por padrão em
-- tabelas novas do schema public. Nada disso é usado pelo site, e TRUNCATE
-- ignora RLS — então saem. Depois deste bloco, `anon` fica sem nenhum
-- privilégio em public (verificado via information_schema).
do $do$
declare t text;
begin
  foreach t in array array['clients', 'services', 'quotes', 'app_users', 'activity_log', 'settings'] loop
    execute format('revoke truncate, references, trigger on public.%1$s from anon', t);
    execute format('revoke truncate on public.%1$s from authenticated', t);
  end loop;
end $do$;
