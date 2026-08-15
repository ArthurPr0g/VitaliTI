-- Migração de dados: `nome` passa a ser a pessoa de contato e `empresa` o
-- nome da empresa.
--
-- Até aqui `nome` guardava o nome da empresa ("Bluefit", "C&A") e `empresa`
-- ficava vazio. Sem mover, "Bluefit" apareceria como nome de uma pessoa.
--
-- A regra é mover SOMENTE onde `empresa` está vazio. O cadastro
-- "Natália" / "Clínica Nexum", feito à mão pelo dono, já segue a semântica
-- nova — mover ele transformaria a pessoa em empresa. É exatamente o caso que
-- uma migração ingênua (mover todos) estragaria em silêncio.

update public.clients
   set empresa = nome,
       nome    = ''
 where coalesce(trim(empresa), '') = ''
   and coalesce(trim(nome), '')    <> '';

-- Conferência: nenhuma linha deve sobrar sem empresa, e os cadastros que já
-- tinham empresa preenchida precisam continuar com o contato original.
select nome as contato, empresa, doc
  from public.clients
 order by empresa;
