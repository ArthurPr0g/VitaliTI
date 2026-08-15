-- Novo formato do orçamento: lista de serviços, cada um com o próprio valor
-- de mão de obra e a lista de produtos que aquele serviço consome.
--
-- NÃO há mudança de schema. A coluna `quotes.itens` já é jsonb e passa a
-- guardar o novo formato — o que muda é a forma do conteúdo, não a tabela.
-- Evitar DDL aqui também evita depender de acesso ao painel do Supabase.
--
-- Formato novo de `itens`:
-- [
--   { "id": "...", "nome": "CFTV", "valor": 800, "descricao": "...",
--     "produtos": [ { "id": "...", "nome": "Câmera IP", "qtd": 4, "valor": 690 } ] }
-- ]
--
-- Formato antigo (lista plana), que este script converte:
-- [ { "id": "...", "nome": "...", "qtd": 1, "valor": 9899, "unidade": "un" } ]
--
-- Um item antigo vira um serviço sem produtos, com valor = qtd * valor. Isso
-- preserva o total de cada orçamento exatamente.
--
-- Reconhece o formato pela ausência da chave `produtos`, então rodar de novo
-- não converte duas vezes.

update public.quotes q
   set itens = (
     select coalesce(jsonb_agg(
              jsonb_build_object(
                'id',        coalesce(i ->> 'id', gen_random_uuid()::text),
                'nome',      coalesce(nullif(i ->> 'nome', ''), 'Serviço'),
                'valor',     round((coalesce((i ->> 'qtd')::numeric, 0) * coalesce((i ->> 'valor')::numeric, 0))::numeric, 2),
                'descricao', coalesce(i ->> 'descricao', ''),
                'produtos',  '[]'::jsonb
              )
              order by ord
            ), '[]'::jsonb)
       from jsonb_array_elements(q.itens) with ordinality as t(i, ord)
   )
 where jsonb_array_length(coalesce(q.itens, '[]'::jsonb)) > 0
   and not (q.itens -> 0 ? 'produtos');

-- ---------------------------------------------------------------------------
-- Conferência: soma dos serviços por orçamento após a conversão.
-- ---------------------------------------------------------------------------
select q.numero,
       (select coalesce(sum(coalesce((s ->> 'valor')::numeric, 0)), 0)
          from jsonb_array_elements(q.itens) s) as total_servicos,
       (select coalesce(sum(
                 coalesce((p ->> 'qtd')::numeric, 0) * coalesce((p ->> 'valor')::numeric, 0))
               , 0)
          from jsonb_array_elements(q.itens) s,
               jsonb_array_elements(coalesce(s -> 'produtos', '[]'::jsonb)) p) as total_produtos
  from public.quotes q
 order by q.numero;
