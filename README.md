# Fuck Disc0rd

Um site estilo Discord para criar servidores, entrar por codigo ou convite, conversar por chat e fazer chamadas com audio, video e compartilhamento de tela.

A chamada usa Jitsi Meet embutido. Isso remove a dependencia de cartao, Daily, Metered e servidor TURN proprio para o uso principal entre amigos.

## Testar localmente

```bash
npm start
```

Depois abra:

```text
http://localhost:8081
```

Se a porta 8081 ja estiver ocupada:

```bash
$env:PORT=8082; npm start
```

## Como funciona

- Firebase/Firestore: login anonimo, servidores salvos, presenca e chat.
- Jitsi Meet: audio, video, compartilhamento de tela, fullscreen e seletor de dispositivos.
- Vercel: hospeda o site estatico.

## Publicar na Vercel

Na Vercel, configure estas Environment Variables do Firebase:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_MEASUREMENT_ID
```

As quatro obrigatorias sao:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
```

Nao precisa configurar `DAILY_API_KEY`.

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

## Observacao sobre Jitsi

O embed usa `meet.jit.si`, que e simples e suficiente para testar e usar com poucos amigos. Para uso grande ou comercial, o ideal e usar Jitsi hospedado por voce ou Jitsi as a Service.
