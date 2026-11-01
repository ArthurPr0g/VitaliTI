# VitaliTI — site institucional + ERP

Leia `docs/CONTINUIDADE.md` (seção 3, armadilhas) antes de editar. As mais perigosas para um ajuste de conteúdo:
- **3.2:** nunca escreva o nome das tags do runtime entre `<` e `>` em comentário HTML (já derrubou o site).
- **3.3:** quase tudo é `style` inline; regra de CSS só vence com `!important`.
- `support.js` e `doc-page.js` são gerados: não edite.

## Publicar
- Não há build (HTML estático). Para conferir: `npx serve -p 4321 .` e abra http://localhost:4321.
- Publicação: `git add -A`, `git commit -m "<o que mudou, em português>"`, `git push` na `main`. A Vercel publica sozinha em https://www.vitalitisolucoes.com.br (1 a 2 minutos). Nunca use `--force`.
- Depois do push, confira o site no ar (o arquivo novo responde 200 e aparece na página).

## Seção "Clientes" (carrossel `#clientes` do `index.html`)
Cada cliente é um cartão dentro de `.cli-track`. A lista aparece **duas vezes** seguidas (a 2ª cópia, com `aria-hidden="true"`, faz o carrossel girar sem emenda). Cliente novo entra nas **duas** cópias, na mesma posição; sem posição pedida, no fim de cada cópia.

Modelo do cartão (1ª cópia; na 2ª, o `div` de fora leva também `aria-hidden="true"`):
```html
        <div style="flex:0 0 340px;height:255px;position:relative;border-radius:18px;overflow:hidden">
          <img src="assets/cliente-NOME.jpg" alt="Nome do Cliente" loading="eager" decoding="async" fetchpriority="low" style="width:100%;height:100%;object-fit:cover;display:block">
          <div style="position:absolute;inset:0;background:linear-gradient(180deg,transparent 42%,rgba(4,10,22,.92))"></div>
          <div style="position:absolute;left:18px;bottom:16px"><div style="font-weight:800;font-size:17px">Nome do Cliente</div><div style="color:#9fb2cf;font-size:12.5px">Ramo ou descrição curta</div></div>
        </div>
```
Foto: `assets/cliente-<nome-em-minusculas-com-hifen>.jpg`, recorte 4:3 centralizado, 800x600, JPEG de até ~150 KB (ex.: `ffmpeg -i entrada -vf "scale=800:600:force_original_aspect_ratio=increase,crop=800:600" -q:v 4 assets/cliente-x.jpg`). Olhe o resultado antes de publicar (nada importante cortado). O nome e a linha de baixo são os que o cliente confirmou; não invente.
