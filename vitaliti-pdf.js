/* Vitaliti — geração do PDF da proposta.
 *
 * Substitui o window.print(). O motivo é simples: com a impressão do
 * navegador, orientação, cabeçalho com URL/data e número de páginas são
 * decididos pelo diálogo de impressão, não pela página. O `@page` do CSS é
 * uma sugestão que o usuário (ou o iOS) sobrepõe. Aqui o arquivo é montado
 * por nós, então nada disso depende de configuração de quem imprime.
 *
 * Recebe o mesmo objeto `pdf` que a visualização em HTML já monta, para não
 * haver duas fontes de verdade sobre o conteúdo da proposta.
 */
(function (w) {
  'use strict';

  var A4 = { l: 210, a: 297 };
  var M = 14;                       // margem
  var L = A4.l - M * 2;             // largura útil = 182mm
  var TINTA = [15, 33, 71];         // #0f2147
  var AZUL = [29, 78, 216];         // #1d4ed8
  var CINZA = [100, 116, 139];      // #64748b
  var LINHA = [230, 236, 245];
  var FUNDO = [244, 247, 252];

  function novoDoc() {
    var JsPDF = (w.jspdf && w.jspdf.jsPDF) || w.jsPDF;
    if (!JsPDF) throw new Error('vitaliti-pdf: jsPDF não carregou.');
    return new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  }

  // A logo é opcional: se não carregar, o documento sai com o nome em texto.
  function carregarLogo(src) {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = src;
    });
  }

  function texto(doc, s, x, y, opt) {
    opt = opt || {};
    doc.setFont('helvetica', opt.peso || 'normal');
    doc.setFontSize(opt.tam || 9);
    var c = opt.cor || TINTA;
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(String(s == null ? '' : s), x, y, { align: opt.al || 'left' });
  }

  /* Quebra o texto na largura dada e devolve a altura ocupada, para o
     chamador saber onde continuar. */
  function paragrafo(doc, s, x, y, larg, opt) {
    opt = opt || {};
    doc.setFont('helvetica', opt.peso || 'normal');
    doc.setFontSize(opt.tam || 9);
    var c = opt.cor || TINTA;
    doc.setTextColor(c[0], c[1], c[2]);
    var linhas = doc.splitTextToSize(String(s == null ? '' : s), larg);
    var alturaLinha = (opt.tam || 9) * 0.45;
    doc.text(linhas, x, y);
    return linhas.length * alturaLinha;
  }

  function retangulo(doc, x, y, larg, alt, cor, raio) {
    doc.setFillColor(cor[0], cor[1], cor[2]);
    if (raio) doc.roundedRect(x, y, larg, alt, raio, raio, 'F');
    else doc.rect(x, y, larg, alt, 'F');
  }

  function regua(doc, y, cor, espessura) {
    var c = cor || LINHA;
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(espessura || 0.2);
    doc.line(M, y, M + L, y);
  }

  /* ------------------------------------------------------------------ *
   * blocos do documento
   * ------------------------------------------------------------------ */

  function cabecalho(doc, p, logo) {
    var y = M;
    if (logo) {
      var alt = 11;
      var larg = alt * (logo.naturalWidth / logo.naturalHeight);
      if (larg > 55) { larg = 55; alt = larg * (logo.naturalHeight / logo.naturalWidth); }
      try { doc.addImage(logo, 'PNG', M, y, larg, alt); } catch (e) { }
    } else {
      texto(doc, 'VITALITI', M, y + 7, { tam: 15, peso: 'bold' });
    }

    var xd = M + L;
    texto(doc, p.empresa, xd, y + 3, { tam: 9.5, peso: 'bold', al: 'right' });
    texto(doc, 'CNPJ ' + p.cnpj, xd, y + 7, { tam: 7.5, cor: CINZA, al: 'right' });
    texto(doc, p.endereco, xd, y + 10.5, { tam: 7.5, cor: CINZA, al: 'right' });
    texto(doc, p.telefone + '  ·  ' + p.email, xd, y + 14, { tam: 7.5, cor: CINZA, al: 'right' });

    var yr = y + 18;
    doc.setDrawColor(AZUL[0], AZUL[1], AZUL[2]);
    doc.setLineWidth(1);
    doc.line(M, yr, M + L, yr);
    return yr + 8;
  }

  function titulo(doc, p, y) {
    texto(doc, 'Proposta comercial', M, y + 2, { tam: 16, peso: 'bold' });
    var xd = M + L;
    texto(doc, 'Nº ' + p.numero, xd, y - 2, { tam: 9, peso: 'bold', al: 'right' });
    texto(doc, 'Emissão ' + p.data, xd, y + 2, { tam: 8, cor: CINZA, al: 'right' });
    if (p.validade && p.validade !== '—') {
      texto(doc, 'Validade ' + p.validade, xd, y + 6, { tam: 8, cor: CINZA, al: 'right' });
    }
    return y + 10;
  }

  function blocoCliente(doc, p, y) {
    var alt = 21;
    retangulo(doc, M, y, L, alt, FUNDO, 1.5);
    doc.setDrawColor(LINHA[0], LINHA[1], LINHA[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, L, alt, 1.5, 1.5, 'S');

    texto(doc, 'DADOS DO CLIENTE', M + 4, y + 5, { tam: 6.5, peso: 'bold', cor: CINZA });

    var col2 = M + L * 0.55;
    texto(doc, p.clienteNome, M + 4, y + 10, { tam: 9.5, peso: 'bold' });
    texto(doc, p.clienteEndereco, M + 4, y + 14, { tam: 7.5, cor: CINZA });
    texto(doc, p.clienteCidade, M + 4, y + 17.5, { tam: 7.5, cor: CINZA });

    texto(doc, 'CPF/CNPJ: ' + p.clienteDoc, col2, y + 10, { tam: 7.5, cor: CINZA });
    texto(doc, 'Telefone: ' + p.clienteTelefone, col2, y + 14, { tam: 7.5, cor: CINZA });
    texto(doc, 'E-mail: ' + p.clienteEmail, col2, y + 17.5, { tam: 7.5, cor: CINZA });

    return y + alt + 7;
  }

  function cabecalhoTabela(doc, y, cols) {
    retangulo(doc, M, y, L, 7, TINTA);
    cols.forEach(function (c) {
      texto(doc, c.rot, c.x, y + 4.7, { tam: 7.5, peso: 'bold', cor: [255, 255, 255], al: c.al });
    });
    return y + 7;
  }

  /* ------------------------------------------------------------------ *
   * montagem
   * ------------------------------------------------------------------ */

  function gerar(p, logo) {
    var doc = novoDoc();
    var y = cabecalho(doc, p, logo);
    y = titulo(doc, p, y);
    y = blocoCliente(doc, p, y);

    // Reserva do rodapé (condições + assinaturas + rodapé). Calibrado para
    // caber ~26 linhas de tabela numa folha: acima disso vai para a segunda,
    // que e o comportamento correto -- espremer mais deixaria a proposta com
    // aparencia ruim.
    var ALT_FECHO = 46;
    var ALT_TOTAIS = 30;
    // As tabelas param antes do espaco de totais E do fecho. Reservar so o
    // fecho fazia o bloco de totais empurrar uma pagina nova mesmo havendo
    // espaco -- era isso que gerava a segunda folha so com o rodape.
    var limite = A4.a - M - ALT_FECHO - ALT_TOTAIS;

    function novaPagina() {
      doc.addPage();
      y = cabecalho(doc, p, logo);
    }

    /* --- serviços --- */
    if (p.servicos && p.servicos.length) {
      var colsS = [
        { rot: '#', x: M + 3, al: 'left' },
        { rot: 'SERVIÇOS', x: M + 12, al: 'left' },
        { rot: 'VALOR', x: M + L - 3, al: 'right' }
      ];
      y = cabecalhoTabela(doc, y, colsS);

      p.servicos.forEach(function (s) {
        var temDesc = s.descricao && String(s.descricao).trim();
        var altLinha = temDesc ? 10 : 7;
        if (y + altLinha > limite) { novaPagina(); y = cabecalhoTabela(doc, y, colsS); }

        texto(doc, s.n, M + 3, y + 4.6, { tam: 8, cor: CINZA });
        texto(doc, s.nome, M + 12, y + 4.6, { tam: 8.5, peso: 'bold' });
        texto(doc, s.valor, M + L - 3, y + 4.6, { tam: 8.5, peso: 'bold', al: 'right' });
        if (temDesc) {
          paragrafo(doc, s.descricao, M + 12, y + 8, L - 40, { tam: 7, cor: CINZA });
        }
        y += altLinha;
        regua(doc, y);
      });

      retangulo(doc, M, y, L, 6.5, FUNDO);
      texto(doc, 'Total dos serviços', M + L - 32, y + 4.4, { tam: 7.5, peso: 'bold', cor: CINZA, al: 'right' });
      texto(doc, p.totalServicos, M + L - 3, y + 4.4, { tam: 8.5, peso: 'bold', al: 'right' });
      y += 6.5 + 7;
    }

    /* --- produtos --- */
    if (p.produtos && p.produtos.length) {
      var colsP = [
        { rot: '#', x: M + 3, al: 'left' },
        { rot: 'PRODUTOS UTILIZADOS', x: M + 12, al: 'left' },
        { rot: 'QTD', x: M + L - 62, al: 'center' },
        { rot: 'UNITÁRIO', x: M + L - 30, al: 'right' },
        { rot: 'TOTAL', x: M + L - 3, al: 'right' }
      ];
      if (y + 20 > limite) novaPagina();
      y = cabecalhoTabela(doc, y, colsP);

      p.produtos.forEach(function (x) {
        if (y + 5.8 > limite) { novaPagina(); y = cabecalhoTabela(doc, y, colsP); }
        texto(doc, x.n, M + 3, y + 4.3, { tam: 8, cor: CINZA });
        texto(doc, x.nome, M + 12, y + 4.3, { tam: 8 });
        texto(doc, x.qtd, M + L - 62, y + 4.3, { tam: 8, al: 'center' });
        texto(doc, x.valor, M + L - 30, y + 4.3, { tam: 8, al: 'right' });
        texto(doc, x.subtotal, M + L - 3, y + 4.3, { tam: 8, peso: 'bold', al: 'right' });
        y += 5.8;
        regua(doc, y);
      });

      retangulo(doc, M, y, L, 6.5, FUNDO);
      texto(doc, 'Total dos produtos', M + L - 32, y + 4.4, { tam: 7.5, peso: 'bold', cor: CINZA, al: 'right' });
      texto(doc, p.totalProdutos, M + L - 3, y + 4.4, { tam: 8.5, peso: 'bold', al: 'right' });
      y += 6.5 + 7;
    }

    /* --- totais --- */
    // Nao precisa checar pagina: o limite das tabelas ja reservou este espaco.
    var xt = M + L - 72;
    var linhasTot = [
      ['Serviços', p.totalServicos], ['Produtos utilizados', p.totalProdutos],
      ['Subtotal', p.subtotal], ['Desconto', '- ' + p.desconto]
    ];
    linhasTot.forEach(function (t) {
      texto(doc, t[0], xt, y + 3.4, { tam: 8, cor: CINZA });
      texto(doc, t[1], M + L - 3, y + 3.4, { tam: 8, al: 'right' });
      y += 5;
    });
    retangulo(doc, xt - 4, y + 1, L - (xt - 4 - M), 11, TINTA, 1.5);
    texto(doc, 'TOTAL', xt, y + 8, { tam: 9, peso: 'bold', cor: [255, 255, 255] });
    texto(doc, p.total, M + L - 3, y + 8.5, { tam: 13, peso: 'bold', cor: [255, 255, 255], al: 'right' });
    y += 18;

    /* --- fecho, sempre no pé da última página --- */
    var yf = A4.a - M - ALT_FECHO + 6;
    if (y > yf) yf = y;   // se o conteúdo passou, segue o fluxo

    texto(doc, 'CONDIÇÕES COMERCIAIS', M, yf, { tam: 6.5, peso: 'bold', cor: CINZA });
    paragrafo(doc, p.condicoes, M, yf + 4, L * 0.47, { tam: 7.5 });
    texto(doc, 'OBSERVAÇÕES', M + L * 0.53, yf, { tam: 6.5, peso: 'bold', cor: CINZA });
    paragrafo(doc, p.obs, M + L * 0.53, yf + 4, L * 0.47, { tam: 7.5 });

    var ya = A4.a - M - 24;
    doc.setDrawColor(TINTA[0], TINTA[1], TINTA[2]);
    doc.setLineWidth(0.3);
    doc.line(M + 8, ya, M + L * 0.42, ya);
    doc.line(M + L * 0.58, ya, M + L - 8, ya);
    texto(doc, 'Prestador', M + 8 + (L * 0.42 - 8) / 2, ya + 4, { tam: 8, peso: 'bold', al: 'center' });
    texto(doc, p.empresa, M + 8 + (L * 0.42 - 8) / 2, ya + 7.5, { tam: 7, cor: CINZA, al: 'center' });
    texto(doc, 'Sacado', M + L * 0.58 + (L * 0.42 - 8) / 2, ya + 4, { tam: 8, peso: 'bold', al: 'center' });
    texto(doc, p.clienteNome, M + L * 0.58 + (L * 0.42 - 8) / 2, ya + 7.5, { tam: 7, cor: CINZA, al: 'center' });

    regua(doc, A4.a - M - 8);
    texto(doc, p.rodape, A4.l / 2, A4.a - M - 4, { tam: 6.5, cor: CINZA, al: 'center' });

    // Numeração só quando há mais de uma página.
    var total = doc.getNumberOfPages();
    if (total > 1) {
      for (var i = 1; i <= total; i++) {
        doc.setPage(i);
        texto(doc, i + ' de ' + total, M + L, A4.a - M - 4, { tam: 6.5, cor: CINZA, al: 'right' });
      }
    }
    return doc;
  }

  function nomeArquivo(p) {
    var base = 'Orcamento ' + p.numero + ' - ' + (p.clienteNome || '');
    return base.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim() + '.pdf';
  }

  /* A logo é carregada assim que o script roda, e não no clique.
     navigator.share() exige ser chamado dentro do gesto do usuário; se
     esperássemos a imagem depois do clique, o iOS recusaria por perda do
     gesto e o compartilhamento não abriria. */
  var logoPronta = null;
  carregarLogo('assets/logo-vitaliti-clean.png').then(function (img) { logoPronta = img; });

  w.VitalitiPDF = {
    abrir: function (p) {
      var doc = gerar(p, logoPronta);
      var nome = nomeArquivo(p);
      var blob = doc.output('blob');

      /* Compartilha o ARQUIVO, não um link.
         doc.save() cria uma URL blob: e dispara download; no celular a folha
         de compartilhamento capturava essa URL e mandava junto com a
         mensagem no WhatsApp. Aqui o PDF vai como anexo.
         Nada de `text` nem `url` no share: qualquer um dos dois vira texto
         na mensagem, que é exatamente o que se quer evitar. */
      try {
        if (w.navigator && navigator.canShare) {
          var arq = new File([blob], nome, { type: 'application/pdf' });
          if (navigator.canShare({ files: [arq] })) {
            return navigator.share({ files: [arq] })
              .then(function () { return doc.getNumberOfPages(); })
              .catch(function (e) {
                // Cancelar o compartilhamento não é erro.
                if (e && e.name === 'AbortError') return doc.getNumberOfPages();
                doc.save(nome);
                return doc.getNumberOfPages();
              });
          }
        }
      } catch (e) { /* cai no download abaixo */ }

      doc.save(nome);   // desktop e navegadores sem Web Share
      return Promise.resolve(doc.getNumberOfPages());
    },
    gerar: function (p, logo) { return gerar(p, logo === undefined ? logoPronta : logo); },
    nomeArquivo: nomeArquivo
  };
})(window);
