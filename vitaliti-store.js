/* Vitaliti — camada de dados (persistência local + seed).
   Estrutura pensada para trocar `persist()`/`load()` por uma API real sem tocar na UI. */
(function (w) {
  var KEY = 'vitaliti.db.v1';
  var SKEY = 'vitaliti.session.v1';

  var uid = function (p) { return p + '_' + Math.random().toString(36).slice(2, 9); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var addDays = function (iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

  var brl = function (v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
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

  var SERVICES = [
    ['Cabeamento estruturado', 'Infraestrutura', 'Projeto, lançamento e certificação de rede, com fechamento de rack conforme normas técnicas.', 180, 'ponto'],
    ['Rede óptica — fusão e ativação', 'Infraestrutura', 'Implementação e manutenção de fibra óptica, fusões, DIO e ativação de enlaces.', 240, 'ponto'],
    ['CFTV — câmera IP full HD', 'Segurança eletrônica', 'Fornecimento e instalação de câmera IP com configuração de gravação e acesso remoto.', 690, 'un'],
    ['Controle de acesso biométrico', 'Segurança eletrônica', 'Instalação de leitor biométrico/facial com cadastro de usuários e integração de portaria.', 1450, 'un'],
    ['Interfonia com vídeo', 'Interfonia', 'Interfone com vídeo para condomínios e empresas, integrando portaria, unidades e áreas comuns.', 980, 'un'],
    ['Automação Wi-Fi & Alexa', 'Automação', 'Controle de TVs, luzes, ar-condicionado, cortinas e persianas por Wi-Fi e assistente de voz.', 420, 'ambiente'],
    ['Outsourcing de TI — Help Desk', 'Outsourcing', 'Suporte técnico contínuo, telefonia IP e videoconferência, com SLA definido em contrato.', 2400, 'mês'],
    ['Manutenção preventiva de rede', 'Outsourcing', 'Visita técnica programada, limpeza de rack, testes de enlace e relatório de conformidade.', 560, 'visita']
  ].map(function (s) { return { id: uid('srv'), nome: s[0], categoria: s[1], descricao: s[2], valor: s[3], unidade: s[4], status: 'Ativo' }; });

  var CLIENTS = [
    ['Passeio das Águas Shopping', '08.762.010/0001-52', 'Passeio das Águas', 'contato@passeiodasaguas.com.br', 'Goiânia', 'GO', 'Av. Perimetral Norte, 8303', '74445-360'],
    ['Bluefit Academia', '13.457.221/0001-08', 'Bluefit', 'unidade.go@bluefit.com.br', 'Goiânia', 'GO', 'Av. T-63, 1215', '74230-100'],
    ['C&A Modas', '45.242.914/0001-05', 'C&A', 'facilities@cea.com.br', 'Goiânia', 'GO', 'Shopping Flamboyant, Loja 118', '74884-900'],
    ['CRC-GO', '01.556.221/0001-77', 'Conselho Regional de Contabilidade', 'ti@crcgo.org.br', 'Goiânia', 'GO', 'Av. Assis Chateaubriand, 1496', '74130-012'],
    ['New York Square', '22.014.883/0001-31', 'NY Square', 'adm@nysquare.com.br', 'Goiânia', 'GO', 'Rua 9, 1000 — Setor Oeste', '74110-100'],
    ['Metrobus Transporte Coletivo', '01.489.049/0001-05', 'Metrobus', 'ti@metrobus.go.gov.br', 'Goiânia', 'GO', 'Av. Anhanguera, 4322', '74043-011'],
    ['Clube Privé', '19.882.441/0001-63', 'Clube Privé', 'contato@clubeprive.com.br', 'Goiânia', 'GO', 'Alameda Ricardo Paranhos, 1200', '74175-020'],
    ['Virta Engenharia', '30.155.712/0001-90', 'Virta', 'obras@virtaengenharia.com.br', 'Goiânia', 'GO', 'Rua T-30, 750', '74215-060'],
    ['Reserva 35 Residencial', '36.771.002/0001-14', 'Reserva 35', 'sindico@reserva35.com.br', 'Goiânia', 'GO', 'Rua 35, 480 — Setor Marista', '74150-140'],
    ['Clínica Morada', '28.443.190/0001-72', 'Morada Saúde', 'recepcao@clinicamorada.com.br', 'Aparecida de Goiânia', 'GO', 'Av. São Paulo, 210', '74923-030'],
    ['Solidy Benefícios', '41.220.556/0001-19', 'Solidy', 'financeiro@solidy.com.br', 'Brasília', 'DF', 'SIA Trecho 3, Lote 625', '71200-030'],
    ['Zetta Áudio', '17.905.334/0001-46', 'Zetta', 'comercial@zettaaudio.com.br', 'Goiânia', 'GO', 'Av. 85, 2200', '74160-010']
  ].map(function (c, i) {
    return {
      id: uid('cli'), nome: c[0], doc: c[1], empresa: c[2], email: c[3], cidade: c[4], uf: c[5], endereco: c[6], cep: c[7],
      telefone: maskPhone('62' + (30000000 + i * 137711)), whatsapp: maskPhone('629' + (90000000 + i * 411777)),
      obs: '', createdAt: addDays(today(), -(320 - i * 21))
    };
  });

  function seedQuotes(clients, services) {
    var st = ['Aprovado', 'Aprovado', 'Enviado', 'Aprovado', 'Pendente', 'Recusado', 'Aprovado', 'Enviado', 'Aprovado', 'Em andamento', 'Aprovado', 'Aprovado', 'Enviado', 'Aprovado'];
    return st.map(function (s, i) {
      var cli = clients[i % clients.length];
      var itens = [0, 1, 2].slice(0, 2 + (i % 2)).map(function (k) {
        var srv = services[(i + k * 3) % services.length];
        return { id: uid('it'), servicoId: srv.id, nome: srv.nome, descricao: srv.descricao, unidade: srv.unidade, qtd: 1 + ((i + k) % 6), valor: srv.valor };
      });
      var data = addDays(today(), -(290 - i * 21));
      return {
        id: uid('orc'), numero: 1024 + i, clienteId: cli.id, data: data, validade: addDays(data, 15),
        itens: itens, descTipo: i % 4 === 0 ? '%' : 'R$', descValor: i % 4 === 0 ? 5 : (i % 3 === 0 ? 150 : 0),
        condicoes: '50% na aprovação e 50% na entrega do serviço. Pix, boleto ou cartão em até 6x.',
        obs: 'Prazo de execução: 5 dias úteis após liberação do local.', status: s, createdAt: data
      };
    });
  }

  var DEFAULTS = function () {
    var quotes = seedQuotes(CLIENTS, SERVICES);
    return {
      users: [
        { id: uid('usr'), nome: 'Administrador Vitaliti', email: 'admin@vitaliti.com', senha: 'vitaliti123', perfil: 'Administrador', iniciais: 'AV' },
        { id: uid('usr'), nome: 'Equipe Técnica', email: 'equipe@vitaliti.com', senha: 'vitaliti123', perfil: 'Funcionário', iniciais: 'ET' }
      ],
      clients: CLIENTS, services: SERVICES, quotes: quotes,
      log: [],
      settings: {
        nome: 'Vitaliti Soluções Tecnológicas', cnpj: '00.000.000/0001-00',
        endereco: 'Goiânia — GO', telefone: '(62) 99206-2304', email: 'vitalitiengenharia@gmail.com',
        instagram: '@vitalitisolucoes', site: 'vitaliti.com.br',
        condicoes: '50% na aprovação da proposta e 50% na entrega do serviço. Pix, boleto ou cartão em até 6x sem juros.',
        rodape: 'Vitaliti Soluções Tecnológicas — infraestrutura, segurança eletrônica e automação. Proposta sujeita a vistoria técnica no local.',
        mensagem: 'Agradecemos a oportunidade de apresentar esta proposta. Estamos à disposição para qualquer esclarecimento.',
        validadeDias: 15
      }
    };
  };

  var db = null;
  function load() {
    if (db) return db;
    try { var raw = localStorage.getItem(KEY); if (raw) { db = JSON.parse(raw); } } catch (e) { }
    if (!db || !db.clients) { db = DEFAULTS(); persist(); }
    return db;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { } }
  function reset() { db = DEFAULTS(); persist(); return db; }

  function logAction(entidade, ref, acao, autor) {
    load().log.unshift({ id: uid('log'), entidade: entidade, ref: ref, acao: acao, autor: autor || 'sistema', at: new Date().toISOString() });
    db.log = db.log.slice(0, 200); persist();
  }

  /* ---- totais ---- */
  function quoteTotals(q) {
    var sub = (q.itens || []).reduce(function (a, i) { return a + (Number(i.qtd) || 0) * (Number(i.valor) || 0); }, 0);
    var desc = q.descTipo === '%' ? sub * (Number(q.descValor) || 0) / 100 : (Number(q.descValor) || 0);
    if (desc > sub) desc = sub;
    return { subtotal: sub, desconto: desc, total: sub - desc };
  }

  function session() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
  function login(email, senha) {
    var u = load().users.filter(function (x) { return x.email.toLowerCase() === String(email).toLowerCase().trim(); })[0];
    if (!u) return { ok: false, erro: 'E-mail não encontrado.' };
    if (senha !== u.senha) return { ok: false, erro: 'Senha incorreta.' };
    var s = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, iniciais: u.iniciais, at: Date.now() };
    localStorage.setItem(SKEY, JSON.stringify(s));
    return { ok: true, session: s };
  }
  function loginGoogle() {
    var u = load().users[0];
    var s = { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, iniciais: u.iniciais, google: true, at: Date.now() };
    localStorage.setItem(SKEY, JSON.stringify(s));
    return { ok: true, session: s };
  }
  function logout() { localStorage.removeItem(SKEY); }
  function can(sess, acao) {
    if (!sess) return false;
    if (sess.perfil === 'Administrador') return true;
    return ['ver', 'orcamento.criar', 'orcamento.editar', 'cliente.criar', 'cliente.editar'].indexOf(acao) >= 0;
  }

  w.VS = {
    load: load, persist: persist, reset: reset, uid: uid, today: today, addDays: addDays,
    brl: brl, dateBR: dateBR, monthLabel: monthLabel, maskDoc: maskDoc, maskPhone: maskPhone, maskCep: maskCep,
    digits: digits, sanitize: sanitize, quoteTotals: quoteTotals, logAction: logAction,
    session: session, login: login, loginGoogle: loginGoogle, logout: logout, can: can
  };
})(window);
