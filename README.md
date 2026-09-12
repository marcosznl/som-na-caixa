# plug.dj pessoal 🎧

Recriação simplificada do plug.dj para uso pessoal: uma sala única onde
qualquer pessoa pode entrar na fila de DJs, tocar músicas do YouTube em
sincronia com todo mundo, e conversar no chat.

## Como funciona

- **Backend** (`server/`): Node.js + Express + Socket.IO. Mantém o estado da
  sala inteiramente em memória (reinicia se o processo cair) — usuários
  conectados, fila de DJs, faixa tocando agora e histórico de chat.
- **Frontend** (`client/`): React + Vite. Usa a YouTube IFrame API para
  reproduzir o vídeo e se sincroniza com o horário de início que o servidor
  manda (`startedAt`), corrigindo o "relógio" a cada poucos segundos.

Fluxo da fila: qualquer usuário clica em "Entrar na fila" para virar DJ.
Uma vez na cabine, dá pra adicionar quantas músicas quiser à sua fila
pessoal a qualquer momento (buscando ou colando um link do YouTube) — não
precisa esperar sua vez pra ir empilhando. Quando chega a sua vez, o app já
puxa automaticamente a próxima música da sua fila e toca pra todo mundo ao
mesmo tempo. Quando o vídeo acaba (ou alguém pula), passa pro próximo DJ da
cabine, que também tem sua própria fila indo tocar em sequência.

## Configuração da busca do YouTube

A busca usa a YouTube Data API v3 (oficial, gratuita até ~100 buscas/dia):

1. Acesse [console.cloud.google.com](https://console.cloud.google.com), crie
   um projeto.
2. Em **APIs e Serviços → Biblioteca**, ative **"YouTube Data API v3"**.
3. Em **APIs e Serviços → Credenciais → Criar Credenciais → Chave de API**,
   gere uma chave.
4. Copie `server/.env.example` para `server/.env` e cole a chave em
   `YOUTUBE_API_KEY`.

Sem a chave configurada, a busca mostra um erro, mas ainda dá pra colar um
link do YouTube direto no mesmo campo (ele detecta automaticamente).

## Rodando localmente

Em dois terminais separados:

```bash
cd server && npm install && npm run dev
```

```bash
cd client && npm install && npm run dev
```

O backend sobe em `http://localhost:3001` e o frontend em
`http://localhost:5173`. Abra o frontend em duas abas/dispositivos
diferentes na mesma rede para testar a sincronização.

Se for acessar de outro dispositivo na rede local (não só localhost), crie
um arquivo `client/.env` com:

```
VITE_SERVER_URL=http://SEU_IP_LOCAL:3001
```

e ajuste `CLIENT_ORIGIN` no ambiente do servidor (`server`) se necessário.

## Próximos passos possíveis

- Múltiplas salas
- Login/contas persistentes
- Sistema de votos (woot/meh) e histórico de músicas
- Deploy (Render/Railway/Fly.io) para acesso remoto
