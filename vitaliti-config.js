/* Vitaliti — configuração do Supabase.
 *
 * Projeto: vitaliti-erp (org Reserva) — região sa-east-1 (São Paulo)
 *
 * A chave abaixo é a PUBLISHABLE. Ela é pública por definição: vai no bundle
 * que o navegador baixa e serve só para identificar o projeto. Quem decide o
 * que cada usuário pode ler ou gravar são as policies de RLS em
 * supabase/migrations/0001_init.sql.
 *
 * A chave `secret` / `service_role` NUNCA entra aqui nem em nenhum arquivo
 * servido ao navegador — ela ignora RLS e daria acesso total ao banco.
 */
window.VITALITI_SUPABASE_URL = 'https://yolakwvyxeiubfditiig.supabase.co';
window.VITALITI_SUPABASE_KEY = 'sb_publishable_DUsXo2yR52mD3zVQVh5i5A_hSTSb3zD';
