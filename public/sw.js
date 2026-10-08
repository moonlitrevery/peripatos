// Service worker do Peripatos.
//
// REGRA: este arquivo NÃO guarda nada que dependa de quem está logado.
//
// Num celular emprestado ou num computador do laboratório, qualquer resposta
// guardada em cache ficaria disponível para a próxima pessoa que abrisse o
// app. Por isso o cache aqui tem uma lista fechada de arquivos públicos e
// idênticos para todo mundo: a página "sem conexão" e os ícones. Nada mais
// entra, nunca: não existe cache.put() fora da instalação.
//
// - Páginas (navegação): sempre da rede. Só se a rede falhar mostramos a
//   página offline. O HTML do app nunca é guardado.
// - Notificações push: só mostram "Nova mensagem de <nome>". Ver o fim do
//   arquivo.
// - Todo o resto (dados do Supabase, RSC, server actions, /api, imagens,
//   avatares, GIFs, JS e CSS): o service worker nem toca. Vai direto para a
//   rede, com as regras normais de cache HTTP do navegador.
//
// Foi escrito à mão, sem biblioteca, de propósito: os padrões de cache em
// tempo de execução das bibliotecas de PWA guardam páginas e respostas de
// navegação, que é exatamente o que não pode acontecer aqui.

const CACHE = "peripatos-estatico-v1";
const PUBLICOS = ["/offline", "/icones/icone-192.png", "/icones/icone-512.png", "/icones/icone.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PUBLICOS.map((url) => new Request(url, { cache: "reload", credentials: "omit" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Só navegações do próprio site. Qualquer outra requisição segue sem
  // passar por aqui (sem respondWith, o navegador trata normalmente).
  if (req.mode !== "navigate") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match("/offline")) ?? Response.error();
    }),
  );
});

// ---------------------------------------------------------------------------
// Notificações push
// ---------------------------------------------------------------------------
// O servidor manda só "de quem" e para onde abrir. O CONTEÚDO da mensagem
// nunca vem na notificação: ela aparece na tela bloqueada, para quem estiver
// por perto. O texto abaixo é fixo.
self.addEventListener("push", (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch {
    // corpo ilegível: mostra a notificação genérica
  }
  const titulo = typeof dados.titulo === "string" && dados.titulo ? dados.titulo.slice(0, 80) : "Nova mensagem no Peripatos";
  const url = typeof dados.url === "string" && dados.url.startsWith("/mensagens") ? dados.url : "/mensagens";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: "Abra o Peripatos para ler.",
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-192.png",
      tag: typeof dados.tag === "string" ? dados.tag : "mensagem",
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Só caminhos do próprio app, e só da área de mensagens.
  const caminho = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : "/mensagens";
  const destino = new URL(caminho.startsWith("/mensagens") ? caminho : "/mensagens", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (new URL(j.url).origin === self.location.origin && "focus" in j) {
          return j.navigate(destino).then((n) => (n || j).focus());
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
