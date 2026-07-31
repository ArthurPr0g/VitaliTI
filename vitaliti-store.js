/* Vitaliti — camada de dados (Supabase).
 *
 * Substitui a versão localStorage mantendo a MESMA superfície pública
 * (window.VS), porque a UI do Gerenciamento mexe em `db.clients`,
 * `db.services` e `db.quotes` em memória e depois chama VS.persist().
 *
 * Como funciona:
 *   VS.init()     — assíncrono. Confere a sessão, carrega o perfil e hidrata
 *                   o `db` inteiro do Postgres. A UI só monta depois disso.
 *   VS.load()     — síncrono. Devolve o `db` já hidratado (cache em memória).
 *   VS.persist()  — compara o `db` atual com o último snapshot conhecido e
 *                   manda só o que mudou (insert/update/delete). É isso que
 *                   permite não reescrever nenhuma tela.
 *   VS.session()  — síncrono. Lê um espelho leve da sessão gravado por nós,
 *                   porque o site público (index.html) consulta a sessão
 *                   antes de qualquer await.
 *
 * O que NÃO está aqui: senha. Autenticação é Supabase Auth; o banco é
 * protegido por RLS. A checagem de perfil na UI é cosmética — quem barra
 * de verdade são as policies.
 */
(function (w) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * guarda de idempotência — NÃO REMOVER
   *
   * Este script é carregado de dentro do <helmet> do template <x-dc>, e o
   * runtime reinjeta o conteúdo do <helmet> no <head> a cada render. Ou
   * seja: o arquivo é reexecutado várias vezes no mesmo carregamento de
   * página (dá para ver no DevTools: 200 seguido de vários 304).
   *
   * A versão anterior, baseada em localStorage, não se importava — relia
   * o storage a cada execução. Esta guarda estado em memória (db, snapshot,
   * cliente Supabase, sessão). Sem esta guarda, cada reexecução cria um
   * `window.VS` novo com `db = null`, e a UI que chamou VS.init() no closure
   * antigo acaba lendo VS.load() do closure novo — que estoura.
   *
   * Mover as tags para o <head> real não funciona: o support.js depende da
   * ordem em que os scripts entram e a página deixa de renderizar.
   * ------------------------------------------------------------------ */
  if (w.VS && w.VS.__vitalitiStore) return;

  /* ------------------------------------------------------------------ *
   * configuração
   * A chave publishable é pública por definição — vai no bundle do
   * navegador e é protegida por RLS. Não confundir com a service_role,
   * que nunca pode aparecer no cliente.
   * ------------------------------------------------------------------ */
  var SUPABASE_URL = w.VITALITI_SUPABASE_URL || '__SUPABASE_URL__';
  var SUPABASE_KEY = w.VITALITI_SUPABASE_KEY || '__SUPABASE_PUBLISHABLE_KEY__';

  var MIRROR = 'vitaliti.session.v2';

  /* ------------------------------------------------------------------ *
   * helpers de formatação — idênticos à versão anterior
   * ------------------------------------------------------------------ */
  var uid = function () {
    if (w.crypto && w.crypto.randomUUID) return w.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var addDays = function (iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  var brl = function (v) { return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  var dateBR = function (iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  var monthLabel = function (iso) { return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][parseInt(String(iso).slice(5, 7), 10) - 1]; };
  var digits = function (s) { return String(s || '').replace(/\D/g, ''); };
  var maskDoc = function (s) {
    var d = digits(s);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return d.slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };
  var maskPhone = function (s) {
    var d = digits(s).slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  };
  var maskCep = function (s) { return digits(s).slice(0, 8).replace(/(\d{5})(\d{1,3})/, '$1-$2'); };
  var sanitize = function (s) { return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, 400); };

  function quoteTotals(q) {
    var sub = (q.itens || []).reduce(function (a, i) { return a + (Number(i.qtd) || 0) * (Number(i.valor) || 0); }, 0);
    var desc = q.descTipo === '%' ? sub * (Number(q.descValor) || 0) / 100 : (Number(q.descValor) || 0);
    if (desc > sub) desc = sub;
    return { subtotal: sub, desconto: desc, total: sub - desc };
  }

  /* ------------------------------------------------------------------ *
   * cliente Supabase
   * ------------------------------------------------------------------ */
  var sb = null;
  function client() {
    if (sb) return sb;
    if (!w.supabase || !w.supabase.createClient) {
      throw new Error('vitaliti-store: supabase-js não carregou. Confira a tag <script> de vendor/supabase-js.min.js.');
    }
    if (SUPABASE_URL.indexOf('__') === 0) {
      throw new Error('vitaliti-store: SUPABASE_URL não configurada.');
    }
    sb = w.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    return sb;
  }

  /* ------------------------------------------------------------------ *
   * mapeamento coluna <-> campo
   * O Postgres usa snake_case; a UI usa camelCase. A tradução mora aqui
   * e em lugar nenhum mais.
   * ------------------------------------------------------------------ */
  var MAPS = {
    clients: {
      table: 'clients',
      toRow: function (c) {
        return {
          id: c.id, nome: c.nome || '', doc: c.doc || '', empresa: c.empresa || '', email: c.email || '',
          telefone: c.telefone || '', whatsapp: c.whatsapp || '', endereco: c.endereco || '',
          cidade: c.cidade || '', uf: c.uf || '', cep: c.cep || '', obs: c.obs || '',
          created_at: c.createdAt || today()
        };
      },
      fromRow: function (r) {
        return {
          id: r.id, nome: r.nome, doc: r.doc, empresa: r.empresa, email: r.email,
          telefone: r.telefone, whatsapp: r.whatsapp, endereco: r.endereco,
          cidade: r.cidade, uf: r.uf, cep: r.cep, obs: r.obs, createdAt: r.created_at
        };
      }
    },
    services: {
      table: 'services',
      toRow: function (s) {
        return {
          id: s.id, nome: s.nome || '', categoria: s.categoria || 'Geral', descricao: s.descricao || '',
          valor: Number(s.valor) || 0, unidade: s.unidade || 'un', status: s.status === 'Inativo' ? 'Inativo' : 'Ativo'
        };
      },
      fromRow: function (r) {
        return {
          id: r.id, nome: r.nome, categoria: r.categoria, descricao: r.descricao,
          valor: Number(r.valor), unidade: r.unidade, status: r.status
        };
      }
    },
    quotes: {
      table: 'quotes',
      toRow: function (q) {
        return {
          id: q.id, numero: Number(q.numero) || 0, cliente_id: q.clienteId,
          data: q.data || today(), validade: q.validade || null,
          itens: (q.itens || []).map(function (i) {
            return {
              id: i.id, servicoId: i.servicoId || null, nome: i.nome || '', descricao: i.descricao || '',
              unidade: i.unidade || 'un', qtd: Number(i.qtd) || 0, valor: Number(i.valor) || 0
            };
          }),
          desc_tipo: q.descTipo === '%' ? '%' : 'R$', desc_valor: Number(q.descValor) || 0,
          condicoes: q.condicoes || '', obs: q.obs || '', status: q.status || 'Em andamento',
          created_at: q.createdAt || today()
        };
      },
      fromRow: function (r) {
        return {
          id: r.id, numero: r.numero, clienteId: r.cliente_id, data: r.data, validade: r.validade,
          itens: r.itens || [], descTipo: r.desc_tipo, descValor: Number(r.desc_valor),
          condicoes: r.condicoes, obs: r.obs, status: r.status, createdAt: r.created_at
        };
      }
    }
  };
  var TABLES = ['clients', 'services', 'quotes'];

  function settingsFromRow(r) {
    return {
      nome: r.nome, cnpj: r.cnpj, endereco: r.endereco, telefone: r.telefone, email: r.email,
      instagram: r.instagram, site: r.site, condicoes: r.condicoes, rodape: r.rodape,
      mensagem: r.mensagem, validadeDias: r.validade_dias
    };
  }
  function settingsToRow(s) {
    return {
      id: 1, nome: s.nome || '', cnpj: s.cnpj || '', endereco: s.endereco || '', telefone: s.telefone || '',
      email: s.email || '', instagram: s.instagram || '', site: s.site || '', condicoes: s.condicoes || '',
      rodape: s.rodape || '', mensagem: s.mensagem || '',
      validade_dias: Math.max(1, Number(s.validadeDias) || 15)
    };
  }

  /* ------------------------------------------------------------------ *
   * estado em memória
   * ------------------------------------------------------------------ */
  var db = null;        // objeto que a UI manipula
  var snap = null;      // {tabela: {id: json}} do último estado sincronizado
  var currentSession = null;
  var errorHandlers = [];
  var sessionHandlers = [];

  function emitError(e) {
    var msg = (e && (e.message || e.error_description || e.details)) || String(e);
    errorHandlers.forEach(function (h) { try { h(msg, e); } catch (_) { } });
    if (!errorHandlers.length) console.error('[vitaliti-store]', e);
  }

  function snapshot() {
    var s = {};
    TABLES.forEach(function (t) {
      s[t] = {};
      (db[t] || []).forEach(function (row) { s[t][row.id] = JSON.stringify(MAPS[t].toRow(row)); });
    });
    s.settings = JSON.stringify(settingsToRow(db.settings));
    return s;
  }

  /* ------------------------------------------------------------------ *
   * sessão
   * ------------------------------------------------------------------ */
  function readMirror() {
    try { return JSON.parse(localStorage.getItem(MIRROR) || 'null'); } catch (e) { return null; }
  }
  function writeMirror(s) {
    currentSession = s;
    try {
      if (s) localStorage.setItem(MIRROR, JSON.stringify(s));
      else localStorage.removeItem(MIRROR);
    } catch (e) { }
    sessionHandlers.forEach(function (h) { try { h(s); } catch (_) { } });
  }
  function session() {
    return currentSession !== null ? currentSession : readMirror();
  }

  function iniciaisDe(nome, email) {
    var parts = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return String(email || '??').slice(0, 2).toUpperCase();
  }

  // Carrega o perfil (nome/perfil/iniciais) da tabela app_users. O trigger
  // on_auth_user_created garante que a linha existe no primeiro login, mas
  // se por algum motivo faltar, montamos a sessão a partir do próprio user.
  function buildSession(user) {
    return client().from('app_users').select('*').eq('id', user.id).maybeSingle()
      .then(function (res) {
        var p = res.data;
        var nome = (p && p.nome) ||
          (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) ||
          String(user.email || '').split('@')[0];
        return {
          id: user.id,
          nome: nome,
          email: user.email,
          perfil: (p && p.perfil) || 'Funcionário',
          iniciais: (p && p.iniciais) || iniciaisDe(nome, user.email),
          at: Date.now()
        };
      });
  }

  /* ------------------------------------------------------------------ *
   * hidratação
   * ------------------------------------------------------------------ */
  function hydrate() {
    var c = client();
    return Promise.all([
      c.from('clients').select('*').order('nome'),
      c.from('services').select('*').order('nome'),
      c.from('quotes').select('*').order('data', { ascending: false }),
      c.from('activity_log').select('*').order('at', { ascending: false }).limit(200),
      c.from('settings').select('*').eq('id', 1).maybeSingle()
    ]).then(function (r) {
      var err = r.filter(function (x) { return x.error; })[0];
      if (err) throw err.error;

      db = {
        clients: (r[0].data || []).map(MAPS.clients.fromRow),
        services: (r[1].data || []).map(MAPS.services.fromRow),
        quotes: (r[2].data || []).map(MAPS.quotes.fromRow),
        log: (r[3].data || []).map(function (l) {
          return { id: l.id, entidade: l.entidade, ref: l.ref, acao: l.acao, autor: l.autor, at: l.at };
        }),
        settings: r[4].data ? settingsFromRow(r[4].data) : {
          nome: 'Vitaliti Soluções Tecnológicas', cnpj: '', endereco: '', telefone: '', email: '',
          instagram: '', site: '', condicoes: '', rodape: '', mensagem: '', validadeDias: 15
        },
        users: []
      };
      snap = snapshot();
      return db;
    });
  }

  var initPromise = null;
  function init() {
    if (initPromise) return initPromise;

    initPromise = client().auth.getSession().then(function (res) {
      var s = res.data && res.data.session;
      if (!s || !s.user) { writeMirror(null); return { session: null, db: null }; }
      return buildSession(s.user).then(function (sess) {
        writeMirror(sess);
        return hydrate().then(function (d) { return { session: sess, db: d }; });
      });
    }).catch(function (e) {
      initPromise = null;   // deixa tentar de novo depois de falha de rede
      emitError(e);
      throw e;
    });

    // Mantém o espelho em dia se o token expirar ou o usuário sair em outra aba.
    try {
      client().auth.onAuthStateChange(function (evt, s) {
        if (evt === 'SIGNED_OUT' || !s) {
          writeMirror(null);
          db = null; snap = null; initPromise = null;
        }
      });
    } catch (e) { }

    return initPromise;
  }

  function load() {
    if (!db) throw new Error('vitaliti-store: chame VS.init() antes de VS.load().');
    return db;
  }

  /* ------------------------------------------------------------------ *
   * escrita — diff contra o snapshot
   *
   * A UI muta arrays em memória e chama persist(). Aqui descobrimos o que
   * mudou de fato e mandamos só isso. As gravações são serializadas numa
   * fila para não embaralhar a ordem se o usuário salvar duas vezes rápido.
   * ------------------------------------------------------------------ */
  function planOps() {
    var ops = [];
    TABLES.forEach(function (t) {
      var m = MAPS[t];
      var before = snap[t] || {};
      var seen = {};
      (db[t] || []).forEach(function (item) {
        var row = m.toRow(item);
        var json = JSON.stringify(row);
        seen[item.id] = true;
        if (!(item.id in before)) ops.push({ kind: 'insert', table: t, row: row, id: item.id });
        else if (before[item.id] !== json) ops.push({ kind: 'update', table: t, row: row, id: item.id });
      });
      Object.keys(before).forEach(function (id) {
        if (!seen[id]) ops.push({ kind: 'delete', table: t, id: id });
      });
    });

    var cfg = JSON.stringify(settingsToRow(db.settings));
    if (cfg !== snap.settings) ops.push({ kind: 'settings', row: settingsToRow(db.settings) });

    // Orçamento referencia cliente: insere cliente antes, apaga cliente depois.
    var rank = { insert: 0, update: 1, settings: 1, delete: 2 };
    var tableRank = { clients: 0, services: 0, quotes: 1 };
    return ops.sort(function (a, b) {
      if (rank[a.kind] !== rank[b.kind]) return rank[a.kind] - rank[b.kind];
      var ta = tableRank[a.table] || 0, tb = tableRank[b.table] || 0;
      return a.kind === 'delete' ? tb - ta : ta - tb;
    });
  }

  function nextNumero() {
    var nums = (db.quotes || []).map(function (q) { return Number(q.numero) || 0; });
    return (nums.length ? Math.max.apply(null, nums) : 1023) + 1;
  }

  function check(res) {
    if (res && res.error) throw res.error;
    return res;
  }

  /* RLS bloqueia em silêncio: quando a policy nega um update ou delete, o
     PostgREST responde 200 com zero linhas, não um erro. Sem esta checagem
     o store daria a gravação por feita e a UI mostraria "salvo" — o usuário
     só descobriria no próximo reload, quando o dado voltasse ao que era.

     Por isso todo update/delete pede as linhas de volta com .select() e
     exige pelo menos uma. Zero linhas significa policy negando (ex.: um
     Funcionário tentando excluir) ou registro já removido por outra pessoa. */
  function checkAfetou(res, acao) {
    if (res && res.error) throw res.error;
    if (!res.data || !res.data.length) {
      throw new Error('não foi possível ' + acao + ' — você não tem permissão para esta ação, ou o registro foi alterado por outro usuário. Recarregue a página.');
    }
    return res;
  }

  function runOp(op) {
    var c = client();
    if (op.kind === 'settings') {
      return c.from('settings').update(op.row).eq('id', 1).select()
        .then(function (r) { return checkAfetou(r, 'salvar as configurações'); });
    }
    var m = MAPS[op.table];
    if (op.kind === 'delete') {
      return c.from(m.table).delete().eq('id', op.id).select()
        .then(function (r) { return checkAfetou(r, 'excluir o registro'); });
    }
    if (op.kind === 'insert') {
      return c.from(m.table).insert(op.row).then(function (res) {
        // Dois usuários podem calcular o mesmo número de proposta ao mesmo
        // tempo. O índice único barra; aqui renumeramos e tentamos de novo.
        if (res.error && res.error.code === '23505' && op.table === 'quotes') {
          var novo = nextNumero();
          var alvo = (db.quotes || []).filter(function (q) { return q.id === op.id; })[0];
          if (alvo) alvo.numero = novo;
          op.row.numero = novo;
          return c.from('quotes').insert(op.row).then(check);
        }
        return check(res);
      });
    }
    return c.from(m.table).update(op.row).eq('id', op.id).select()
      .then(function (r) { return checkAfetou(r, 'salvar a alteração'); });
  }

  var queue = Promise.resolve();
  function persist() {
    if (!db || !snap) return Promise.resolve();
    var ops = planOps();
    if (!ops.length) return Promise.resolve();

    // Congela o alvo agora: se a UI mudar o db durante o envio, a próxima
    // chamada a persist() pega a diferença restante.
    var target = snapshot();

    queue = queue.then(function () {
      return ops.reduce(function (p, op) {
        return p.then(function () { return runOp(op); });
      }, Promise.resolve());
    }).then(function () {
      snap = target;
    }).catch(function (e) {
      emitError(e);
      // snap não avança de propósito: a próxima gravação tenta de novo.
    });

    return queue;
  }

  function logAction(entidade, ref, acao, autor) {
    var row = {
      id: uid(), entidade: String(entidade || ''), ref: String(ref || ''),
      acao: String(acao || ''), autor: autor || 'sistema', at: new Date().toISOString()
    };
    if (db) { db.log.unshift(row); db.log = db.log.slice(0, 200); }
    queue = queue.then(function () {
      return client().from('activity_log').insert(row).then(check);
    }).catch(emitError);
    return queue;
  }

  /* ------------------------------------------------------------------ *
   * autenticação
   * ------------------------------------------------------------------ */
  function login(email, senha) {
    return client().auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: String(senha || '')
    }).then(function (res) {
      if (res.error) {
        var m = res.error.message || '';
        if (/invalid login credentials/i.test(m)) return { ok: false, erro: 'E-mail ou senha incorretos.' };
        if (/email not confirmed/i.test(m)) return { ok: false, erro: 'Confirme seu e-mail antes de entrar.' };
        return { ok: false, erro: m };
      }
      return buildSession(res.data.user).then(function (sess) {
        writeMirror(sess);
        initPromise = null;
        return hydrate().then(function () { return { ok: true, session: sess }; });
      });
    }).catch(function (e) {
      emitError(e);
      return { ok: false, erro: 'Falha de conexão com o servidor.' };
    });
  }

  // Redireciona para o Google e volta para esta mesma página. O
  // detectSessionInUrl do supabase-js consome o retorno automaticamente.
  function loginGoogle() {
    return client().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: location.origin + location.pathname + '?view=app',
        queryParams: { prompt: 'select_account' }
      }
    }).then(function (res) {
      if (res.error) { emitError(res.error); return { ok: false, erro: res.error.message }; }
      return { ok: true, redirecting: true };
    });
  }

  function recoverPassword(email) {
    return client().auth.resetPasswordForEmail(String(email || '').trim().toLowerCase(), {
      redirectTo: location.origin + location.pathname
    }).then(function (res) {
      if (res.error) return { ok: false, erro: res.error.message };
      return { ok: true };
    });
  }

  function logout() {
    var p = client().auth.signOut().catch(emitError);
    writeMirror(null);
    db = null; snap = null; initPromise = null;
    return p;
  }

  function can(sess, acao) {
    if (!sess) return false;
    if (sess.perfil === 'Administrador') return true;
    return ['ver', 'orcamento.criar', 'orcamento.editar', 'cliente.criar', 'cliente.editar'].indexOf(acao) >= 0;
  }

  /* Recarrega tudo do servidor, descartando o que estiver em memória.
     Substitui o antigo reset(), que recriava dados de demonstração. */
  function reload() {
    return hydrate().catch(function (e) { emitError(e); throw e; });
  }

  /* ------------------------------------------------------------------ *
   * API pública
   * ------------------------------------------------------------------ */
  w.VS = {
    __vitalitiStore: true,   // marcador lido pela guarda de idempotência no topo
    init: init, load: load, persist: persist, reload: reload,
    uid: uid, today: today, addDays: addDays,
    brl: brl, dateBR: dateBR, monthLabel: monthLabel,
    maskDoc: maskDoc, maskPhone: maskPhone, maskCep: maskCep,
    digits: digits, sanitize: sanitize, quoteTotals: quoteTotals, logAction: logAction,
    session: session, login: login, loginGoogle: loginGoogle, recoverPassword: recoverPassword,
    logout: logout, can: can,
    onError: function (cb) { errorHandlers.push(cb); },
    onSession: function (cb) { sessionHandlers.push(cb); },
    isConfigured: function () { return SUPABASE_URL.indexOf('__') !== 0; }
  };

  // O site público chama VS.session() sem esperar por nada. Se o espelho
  // estiver velho (token expirou, logout em outra aba), corrigimos em
  // segundo plano e avisamos quem estiver ouvindo.
  currentSession = readMirror();
  if (currentSession && w.VS.isConfigured()) {
    try {
      client().auth.getSession().then(function (res) {
        var s = res.data && res.data.session;
        if (!s || !s.user) writeMirror(null);
      }).catch(function () { });
    } catch (e) { }
  }
})(window);
