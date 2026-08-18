# Fuck Disc0rd

Um site estilo Discord para criar servidores, entrar por código ou convite, falar por áudio, ligar a câmera quando quiser, compartilhar tela e conversar por chat.

## Testar localmente

```bash
npm start
```

Depois abra:

```text
http://localhost:8081
```

Crie um servidor, copie o convite pelo botão de link e envie para quem vai entrar.

Localmente o app usa o servidor `server.js` como sinalização WebSocket.

## Controles

- O microfone liga ao entrar e mostra um medidor no rodapé. Se a barra mexer quando você fala, o microfone está funcionando.
- A supressão de ruído fica ligada por padrão quando o navegador oferece suporte.
- A câmera começa desligada e só abre quando você clicar no botão de câmera.
- O botão de fone muta ou desmuta o áudio que você recebe dos outros participantes.

## Publicar na Vercel

Na Vercel, o app roda como site estático e usa Firebase/Firestore como sinalização da chamada.

1. Crie um projeto no Firebase.
2. Adicione um app Web no Firebase e copie a configuração.
3. Ative Authentication > Sign-in method > Anonymous.
4. Ative Firestore Database.
5. Na Vercel, configure estas Environment Variables:

```text
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_MEASUREMENT_ID
```

As quatro obrigatórias são `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` e `FIREBASE_APP_ID`.

Regras simples para começar no Firestore:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if request.auth != null;

      match /{document=**} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

Depois faça o deploy pela Vercel. O build command já está configurado como:

```bash
npm run build
```

E o output directory está configurado como:

```text
public
```

## Observações importantes

- Câmera, microfone e compartilhamento de tela funcionam melhor em `localhost` ou em uma URL `https`.
- Para amigos fora da sua rede, use a URL HTTPS da Vercel.
- O app usa WebRTC com servidores STUN públicos. Em algumas redes, chamadas podem precisar de um servidor TURN para funcionar 100%.
- As salas não têm senha por enquanto; use nomes de sala difíceis de adivinhar se quiser mais privacidade.
