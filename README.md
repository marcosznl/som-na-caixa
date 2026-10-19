# Som na Caixa

Salas de música para ouvir junto: cada pessoa entra na fila de DJs, escolhe
músicas do YouTube e todo mundo da sala ouve a mesma coisa, no mesmo ponto
do vídeo, enquanto conversa no chat. Inspirado no antigo plug.dj.

No ar em **https://som-na-caixa.onrender.com**.

Não tem conta nem senha: a pessoa digita um nome, cria uma sala ou entra em
uma que já está aberta. Tudo fica em memória no servidor. Uma sala some
quando a última pessoa sai, e todas somem quando o servidor reinicia.

## O que dá pra fazer

- **Salas:** a página inicial mostra as salas abertas, com quantas pessoas
  e o que está tocando em cada uma. O nome da sala não pode repetir, e o
  nome de uma pessoa não pode repetir dentro da mesma sala.
- **Convite por link:** dentro da sala, "Copiar convite" copia um link
  `?sala=...`. Quem abre o link vê o convite direto na página inicial.
- **Fila de DJs:** quem entra na fila monta a própria lista de músicas (até
  20), buscando ou colando um link do YouTube, a qualquer momento. Dá pra
  remover e reordenar arrastando. Na sua vez, a próxima música da sua lista
  toca sozinha. A aba pisca avisando quando é a sua vez e sua lista está
  vazia.
- **Votos:** "curti" e "não curti" na música atual (o placar fica no
  histórico) e voto pra pular, que pula a música quando metade de quem está
  ouvindo vota. O DJ pode pular a própria música na hora.
- **Chat e reações:** mensagens com cor e avatar por pessoa, avisos de quem
  entrou, saiu ou começou a tocar, e emojis que flutuam sobre o vídeo.
- **Histórico:** as últimas 50 músicas que tocaram na sala.
- **Personalização:** ícone de perfil (emoji ou imagem enviada) e tema
  claro ou escuro. Nome, ícone e tema ficam salvos no navegador.
- **Quedas de conexão:** se a internet cair por até 20 segundos, a pessoa
  volta pra sala sem perder o lugar na fila.

## Proteções do site público

- Limite de ações seguidas por conexão: mensagens, reações, votos, músicas
  adicionadas, salas criadas e troca de ícone. Quem passa do limite recebe
  um aviso pra esperar alguns segundos.
- Limite de buscas por IP e no máximo 100 salas abertas ao mesmo tempo.
- A cota gratuita da busca do YouTube é de cerca de 100 buscas por dia pro
  site inteiro. Buscas repetidas são guardadas por 6 horas e não gastam
  cota. Colar um link não usa a busca.

## Como funciona

- **Backend** (`server/`): Node.js, Express e Socket.IO. Guarda as salas em
  memória e manda pra cada sala só o que mudou (estado da música, pessoas,
  chat, histórico), e a fila pessoal só pro dono.
- **Frontend** (`client/`): React e Vite. Usa a YouTube IFrame API pra tocar
  o vídeo e corrige a posição a cada poucos segundos com base no horário em
  que a música começou no servidor.
- Em produção o próprio servidor entrega o frontend já buildado, então o
  deploy é um serviço só.

## Configuração da busca do YouTube

A busca usa a YouTube Data API v3 (oficial e gratuita até cerca de 100
buscas por dia):

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) e
   crie um projeto.
2. Em **APIs e Serviços → Biblioteca**, ative **"YouTube Data API v3"**.
3. Em **APIs e Serviços → Credenciais → Criar Credenciais → Chave de API**,
   gere uma chave.
4. Copie `server/.env.example` para `server/.env` e cole a chave em
   `YOUTUBE_API_KEY`.

Sem a chave, a busca mostra um erro, mas colar um link do YouTube no mesmo
campo continua funcionando.

## Rodando localmente

Em dois terminais separados:

```bash
cd server && npm install && npm run dev
```

```bash
cd client && npm install && npm run dev
```

O backend sobe em `http://localhost:3001` e o frontend em
`http://localhost:5173`. Abra o frontend em duas abas ou dispositivos pra
testar a sincronização.

Pra acessar de outro dispositivo na rede local, crie `client/.env` com:

```
VITE_SERVER_URL=http://SEU_IP_LOCAL:3001
```

e ajuste `CLIENT_ORIGIN` no ambiente do servidor, se necessário.

## Testes

```bash
npm install --prefix server
npm test
```

Os testes sobem o servidor de verdade numa porta livre e conversam com ele
pelo Socket.IO, como o navegador faria: criar e entrar em salas, nomes
repetidos, chat, limites, fila pessoal e votos. Também cobrem as funções
puras (limitador, votos, links do YouTube). Nenhum teste usa a internet.

## Deploy no Render

O repositório tem um `render.yaml`. No Render, use **New → Blueprint**,
escolha este repositório e informe a `YOUTUBE_API_KEY` quando pedir. Cada
push na `main` publica a nova versão sozinho.

No plano gratuito o serviço dorme depois de um tempo sem acesso e leva
cerca de um minuto pra acordar. Como tudo fica em memória, as salas começam
vazias de novo.

## Licença

[MIT](LICENSE): pode usar, modificar e distribuir, mantendo o aviso de
autoria.
