-- Carga inicial: clientes e serviços extraídos do conteúdo publicado no site.
--
-- Fonte: index.html — carrossel da seção "Clientes" e cards da seção
-- "O que fazemos". Nada aqui foi inventado; o que o site não informa ficou
-- em branco para o dono preencher.
--
-- Idempotente: rodar de novo não duplica (dedupe por nome).

-- ---------------------------------------------------------------------------
-- Serviços
--
-- `valor` entra como 0 porque o site não publica preço e a coluna é numérica
-- (não aceita vazio). `unidade` fica no padrão 'un'.
--
-- `categoria` reaproveita o vocabulário que o próprio projeto já usava
-- (Infraestrutura, Segurança eletrônica, Interfonia, Automação, Outsourcing),
-- senão o filtro por categoria do catálogo nasceria inútil com tudo em 'Geral'.
-- ---------------------------------------------------------------------------
insert into public.services (id, nome, categoria, descricao, valor, unidade, status)
select gen_random_uuid(), v.nome, v.categoria, v.descricao, 0, 'un', 'Ativo'
from (values
  ('Cabeamento estruturado', 'Infraestrutura',
   'Projeto e instalação de redes organizadas e escaláveis, com fechamento de rack e certificação de rede conforme normas técnicas.'),
  ('Rede óptica', 'Infraestrutura',
   'Implementação e manutenção de redes de fibra óptica, garantindo alta velocidade e estabilidade na sua conexão.'),
  ('Segurança eletrônica', 'Segurança eletrônica',
   'CFTV em alta definição, alarmes e controle de acesso por biometria, tags e reconhecimento facial — monitoramento 24 h.'),
  ('Interfonia', 'Interfonia',
   'Interfones com vídeo para condomínios, empresas e residências, integrando portaria, unidades e áreas comuns.'),
  ('Automação Wi-Fi & Alexa', 'Automação',
   'Controle inteligente de TVs, luzes, ar-condicionado, cortinas e persianas — integrados por Wi-Fi e assistentes de voz.'),
  ('Outsourcing de TI', 'Outsourcing',
   'Help Desk, telefonia IP e videoconferência: sua operação de tecnologia terceirizada, com suporte contínuo e especializado.')
) as v(nome, categoria, descricao)
where not exists (select 1 from public.services s where s.nome = v.nome);

-- ---------------------------------------------------------------------------
-- Clientes
--
-- Só nome e segmento estão publicados. CNPJ, e-mail, telefone, endereço e CEP
-- ficam vazios de propósito.
--
-- O segmento vai para `obs` — é a única informação real que o site traz sobre
-- cada cliente, e jogar fora seria perder contexto.
--
-- `cidade`/`uf` só onde o site diz explicitamente: Clube Privé (Caldas Novas)
-- e StockCar (Autódromo de Goiânia). Nos demais fica vazio mesmo quando dá
-- para supor — supor aqui vira dado errado no cadastro do cliente.
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, doc, empresa, email, telefone, whatsapp, endereco, cidade, uf, cep, obs, created_at)
select gen_random_uuid(), v.nome, '', '', '', '', '', '', v.cidade, v.uf, '',
       case when v.segmento = '' then '' else 'Segmento: ' || v.segmento end,
       current_date
from (values
  ('C&A',                'Moda · Varejo',              '',             ''),
  ('Bluefit',            'Academia',                   '',             ''),
  ('Passeio das Águas',  'Shopping',                   '',             ''),
  ('New York Square',    'Shopping',                   '',             ''),
  ('CRCGO',              'Conselho de Contabilidade',  '',             ''),
  ('StockCar',           'Autódromo de Goiânia',       'Goiânia',      'GO'),
  ('Clube Privé',        'Resort · Caldas Novas',      'Caldas Novas', 'GO'),
  ('Virta Engenharia',   'Engenharia',                 '',             ''),
  ('Reserva 35',         'Adega & Eventos',            '',             ''),
  ('Zetta Áudio',        'Áudio & Automação',          '',             ''),
  ('Organiq Beauté',     'Beleza & Estética',          '',             ''),
  ('Clínica Morada',     'Saúde & Bem-estar',          '',             ''),
  ('Solidy Benefícios',  'Benefícios',                 '',             ''),
  ('Metrobus',           'Sede Administrativa',        '',             ''),
  ('Carne de Sol',       'Gastrobar · Marista',        '',             ''),
  ('Riquinho Store',     'Moda · Varejo',              '',             ''),
  ('Fish Sushi',         'Restaurante',                '',             ''),
  ('Emerald Boutique',   'Moda · Shopping',            '',             ''),
  ('Escola Criativa',    'Educação',                   '',             ''),
  ('Virgínia Arruda',    'Concept Store',              '',             '')
) as v(nome, segmento, cidade, uf)
where not exists (select 1 from public.clients c where c.nome = v.nome);

-- ---------------------------------------------------------------------------
-- conferência
-- ---------------------------------------------------------------------------
select (select count(*) from public.clients)  as clientes,
       (select count(*) from public.services) as servicos,
       (select count(*) from public.services where valor = 0) as servicos_sem_preco;
