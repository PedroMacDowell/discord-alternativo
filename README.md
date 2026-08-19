# Fuck Disc0rd

Um site estilo Discord para criar servidores, entrar por codigo ou convite, conversar por chat e fazer chamadas com audio, video e compartilhamento de tela.

A chamada agora usa Daily. Isso evita os problemas de WebRTC direto entre amigos em redes diferentes, porque o Daily ja cuida de SFU, TURN, permissoes, camera, microfone, tela cheia, troca de dispositivos e supressao de ruido.

## Testar localmente

```bash
npm start
```

Depois abra:

```text
http://localhost:8081
```

Para testar chamadas Daily localmente, crie um arquivo `.env.local` ou exporte esta variavel no terminal antes de iniciar:

```text
DAILY_API_KEY
```

Sem `DAILY_API_KEY`, o app ainda abre, mas a area da chamada mostra que o Daily nao esta configurado.

## Como funciona

- Firebase/Firestore: login anonimo, servidores salvos, presenca e chat.
- Daily: audio, video, compartilhamento de tela, fullscreen e seletor de dispositivos.
- Vercel: hospeda o site estatico e a rota serverless `/api/daily-room`, que cria ou reutiliza a sala Daily do servidor.

## Publicar na Vercel

Na Vercel, configure estas Environment Variables:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_MEASUREMENT_ID
DAILY_API_KEY
```

As quatro obrigatorias do Firebase sao:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
```

A variavel obrigatoria para chamada funcionar e:

```text
DAILY_API_KEY
```

Depois faca o deploy pela Vercel. O build command ja esta configurado como:

```bash
npm run build
```

E o output directory esta configurado como:

```text
public
```

## Firebase

No console do Firebase:

1. Crie um projeto.
2. Adicione um app Web e copie a configuracao.
3. Ative Authentication > Sign-in method > Anonymous.
4. Ative Firestore Database.
5. Publique as regras de `firestore.rules`.

As regras exigem login anonimo e limitam escrita de participantes, mensagens e dados da sala ao usuario autenticado da sessao.

## Daily

No painel do Daily:

1. Crie uma conta.
2. Abra Developers ou API keys.
3. Copie a API key.
4. Coloque essa chave na Vercel como `DAILY_API_KEY`.

Nao precisa configurar Metered/TURN para o fluxo principal.
