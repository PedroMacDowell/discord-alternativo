"use strict";

const els = {
  joinScreen: document.querySelector("#joinScreen"),
  appScreen: document.querySelector("#appScreen"),
  joinForm: document.querySelector("#joinForm"),
  nameInput: document.querySelector("#nameInput"),
  createModeButton: document.querySelector("#createModeButton"),
  enterModeButton: document.querySelector("#enterModeButton"),
  createServerGroup: document.querySelector("#createServerGroup"),
  enterServerGroup: document.querySelector("#enterServerGroup"),
  serverNameInput: document.querySelector("#serverNameInput"),
  serverCodeInput: document.querySelector("#serverCodeInput"),
  randomServerButton: document.querySelector("#randomServerButton"),
  joinButton: document.querySelector("#joinButton"),
  joinButtonText: document.querySelector("#joinButtonText"),
  joinStatus: document.querySelector("#joinStatus"),
  savedServersList: document.querySelector("#savedServersList"),
  roomLabel: document.querySelector("#roomLabel"),
  serverIcon: document.querySelector("#serverIcon"),
  serverNameLabel: document.querySelector("#serverNameLabel"),
  serverCodeLabel: document.querySelector("#serverCodeLabel"),
  channelLabel: document.querySelector("#channelLabel"),
  channelCount: document.querySelector("#channelCount"),
  serverPanel: document.querySelector("#serverPanel"),
  togglePeopleButton: document.querySelector("#togglePeopleButton"),
  connectionStatus: document.querySelector("#connectionStatus"),
  copyLinkButton: document.querySelector("#copyLinkButton"),
  leaveTopButton: document.querySelector("#leaveTopButton"),
  peopleCount: document.querySelector("#peopleCount"),
  peopleList: document.querySelector("#peopleList"),
  videoGrid: document.querySelector("#videoGrid"),
  chatPanel: document.querySelector("#chatPanel"),
  toggleChatButton: document.querySelector("#toggleChatButton"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  messageInput: document.querySelector("#messageInput"),
  micButton: document.querySelector("#micButton"),
  micMonitor: document.querySelector("#micMonitor"),
  micMeterBar: document.querySelector("#micMeterBar"),
  micStatusLabel: document.querySelector("#micStatusLabel"),
  noiseButton: document.querySelector("#noiseButton"),
  deafenButton: document.querySelector("#deafenButton"),
  cameraButton: document.querySelector("#cameraButton"),
  screenButton: document.querySelector("#screenButton"),
  leaveButton: document.querySelector("#leaveButton"),
  toastStack: document.querySelector("#toastStack")
};

const FIREBASE_SDK_VERSION = "12.16.0";
const HEARTBEAT_MS = 15000;
const STALE_PEER_MS = 65000;

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" }
];

const palette = ["#20c7b3", "#ff6b5f", "#f6c85f", "#8bb8ff", "#b98cff", "#7bd88f"];

const state = {
  transport: null,
  selfId: null,
  joinMode: "create",
  serverId: "",
  serverName: "",
  inviteServerName: "",
  channelId: "voz-geral",
  channelName: "Voz geral",
  roomId: "",
  userName: "",
  color: palette[Math.floor(Math.random() * palette.length)],
  cameraTrack: null,
  audioTrack: null,
  screenTrack: null,
  cameraEnabled: false,
  micEnabled: false,
  noiseSuppressionEnabled: true,
  outputMuted: false,
  audioContext: null,
  micSource: null,
  micAnalyser: null,
  micMeterFrame: null,
  micLevel: 0,
  chatCollapsed: false,
  chatUnread: false,
  peopleCollapsed: false,
  peers: new Map(),
  tiles: new Map(),
  joined: false
};

let firebaseModulesPromise = null;

bootstrap();

function bootstrap() {
  const params = new URLSearchParams(window.location.search);
  const savedName = localStorage.getItem("ponte.name") || "";
  const serverFromUrl = params.get("server") || params.get("room") || "";
  const serverNameFromUrl = params.get("serverName") || "";
  state.inviteServerName = serverNameFromUrl;

  els.nameInput.value = savedName;
  els.serverNameInput.value = serverNameFromUrl || createDefaultServerName();
  els.serverCodeInput.value = serverFromUrl;
  state.chatCollapsed = localStorage.getItem("fuckdisc0rd.chatCollapsed") === "true";
  state.peopleCollapsed = localStorage.getItem("fuckdisc0rd.peopleCollapsed") === "true";
  setJoinMode(serverFromUrl ? "enter" : "create");
  renderSavedServers();
  applyPanelState();

  els.joinForm.addEventListener("submit", joinRoom);
  els.createModeButton.addEventListener("click", () => setJoinMode("create"));
  els.enterModeButton.addEventListener("click", () => setJoinMode("enter"));
  els.randomServerButton.addEventListener("click", () => {
    els.serverCodeInput.value = createServerId(els.serverNameInput.value || "servidor");
    els.serverCodeInput.focus();
  });
  els.savedServersList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-server-id]");
    if (deleteButton) {
      const serverName = deleteButton.dataset.serverName || "este servidor";
      const confirmed = window.confirm(`Excluir "${serverName}" da sua lista de servidores?`);
      if (!confirmed) return;

      deleteSavedServer(deleteButton.dataset.deleteServerId);
      toast("Servidor excluído da lista.");
      return;
    }

    const button = event.target.closest("[data-server-id]");
    if (!button) return;

    els.serverCodeInput.value = button.dataset.serverId;
    els.serverNameInput.value = button.dataset.serverName || "";
    state.inviteServerName = button.dataset.serverName || "";
    setJoinMode("enter");
  });

  els.copyLinkButton.addEventListener("click", copyInviteLink);
  els.leaveButton.addEventListener("click", leaveRoom);
  els.leaveTopButton.addEventListener("click", leaveRoom);
  els.toggleChatButton.addEventListener("click", toggleChatPanel);
  els.togglePeopleButton.addEventListener("click", togglePeoplePanel);
  els.micButton.addEventListener("click", toggleMicrophone);
  els.noiseButton.addEventListener("click", toggleNoiseSuppression);
  els.deafenButton.addEventListener("click", toggleOutputAudio);
  els.cameraButton.addEventListener("click", toggleCamera);
  els.screenButton.addEventListener("click", toggleScreenShare);
  els.chatForm.addEventListener("submit", sendChatMessage);

  window.addEventListener("beforeunload", () => {
    state.transport?.leave?.(true);
    stopAllMedia();
  });
}

function setJoinMode(mode) {
  state.joinMode = mode;
  const creating = mode === "create";

  els.createModeButton.classList.toggle("active", creating);
  els.enterModeButton.classList.toggle("active", !creating);
  els.createModeButton.setAttribute("aria-pressed", String(creating));
  els.enterModeButton.setAttribute("aria-pressed", String(!creating));
  els.createServerGroup.classList.toggle("hidden", !creating);
  els.enterServerGroup.classList.toggle("hidden", creating);
  els.joinButtonText.textContent = creating ? "Criar e entrar" : "Entrar no servidor";
}

function renderSavedServers() {
  const servers = getSavedServers();

  if (!servers.length) {
    const empty = document.createElement("p");
    empty.className = "saved-empty";
    empty.textContent = "Nenhum servidor salvo ainda.";
    els.savedServersList.replaceChildren(empty);
    return;
  }

  els.savedServersList.replaceChildren(...servers.map((server) => {
    const item = document.createElement("div");
    item.className = "saved-server-item";

    const button = document.createElement("button");
    button.className = "saved-server-button";
    button.type = "button";
    button.dataset.serverId = server.id;
    button.dataset.serverName = server.name;

    const icon = document.createElement("span");
    icon.className = "saved-server-icon";
    icon.textContent = getInitial(server.name);

    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = server.name;
    const code = document.createElement("small");
    code.textContent = server.id;
    text.append(name, code);

    button.append(icon, text);

    const remove = document.createElement("button");
    remove.className = "icon-button saved-server-delete";
    remove.type = "button";
    remove.dataset.deleteServerId = server.id;
    remove.dataset.serverName = server.name;
    remove.dataset.tooltip = "Excluir servidor";
    remove.setAttribute("aria-label", `Excluir servidor ${server.name}`);
    remove.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';

    item.append(button, remove);
    return item;
  }));
}

function toggleChatPanel() {
  state.chatCollapsed = !state.chatCollapsed;
  if (!state.chatCollapsed) {
    state.chatUnread = false;
  }
  localStorage.setItem("fuckdisc0rd.chatCollapsed", String(state.chatCollapsed));
  applyPanelState();

  if (!state.chatCollapsed) {
    els.messageInput.focus();
  }
}

function togglePeoplePanel() {
  state.peopleCollapsed = !state.peopleCollapsed;
  localStorage.setItem("fuckdisc0rd.peopleCollapsed", String(state.peopleCollapsed));
  applyPanelState();
}

function applyPanelState() {
  els.appScreen.classList.toggle("chat-collapsed", state.chatCollapsed);
  els.chatPanel.classList.toggle("collapsed", state.chatCollapsed);
  els.chatPanel.classList.toggle("unread", state.chatUnread);
  els.chatPanel.setAttribute("aria-label", state.chatCollapsed ? "Chat recolhido" : "Chat");
  els.toggleChatButton.setAttribute("aria-expanded", String(!state.chatCollapsed));

  els.serverPanel.classList.toggle("people-collapsed", state.peopleCollapsed);
  els.peopleList.hidden = state.peopleCollapsed;
  els.togglePeopleButton.setAttribute("aria-expanded", String(!state.peopleCollapsed));
}

async function joinRoom(event) {
  event.preventDefault();

  const userName = els.nameInput.value.trim().replace(/\s+/g, " ").slice(0, 36);
  const serverName = els.serverNameInput.value.trim().replace(/\s+/g, " ").slice(0, 36);
  const serverCode = extractServerId(els.serverCodeInput.value);
  const serverId = state.joinMode === "create"
    ? createServerId(serverName || "servidor")
    : serverCode;
  const resolvedServerName = state.joinMode === "create"
    ? (serverName || "Meu servidor")
    : (getSavedServerName(serverId) || state.inviteServerName || `Servidor ${serverId}`);
  const roomId = buildRoomId(serverId, state.channelId);

  if (!serverId || !userName) {
    setJoinStatus("Preencha seu nome e o servidor.");
    return;
  }

  els.joinButton.disabled = true;
  setJoinStatus("Abrindo microfone...");

  state.serverId = serverId;
  state.serverName = resolvedServerName;
  state.roomId = roomId;
  state.userName = userName;
  localStorage.setItem("ponte.name", userName);
  saveServer({ id: serverId, name: resolvedServerName });
  renderSavedServers();

  await prepareLocalMedia();

  setJoinStatus("Conectando na sala...");

  try {
    state.transport = createTransport();
    await state.transport.connect();
    await state.transport.join(roomId, userName);
  } catch (error) {
    console.error(error);
    const message = error?.code === "firebase-config-missing"
      ? "Configure o Firebase para usar este site na Vercel."
      : "Não foi possível conectar à sala.";
    setJoinStatus(message);
    els.joinButton.disabled = false;
    state.transport = null;
  }
}

function createTransport() {
  if (hasFirebaseConfig()) {
    return createFirebaseTransport();
  }

  if (isLocalHost()) {
    return createWebSocketTransport();
  }

  const error = new Error("Firebase não configurado.");
  error.code = "firebase-config-missing";
  throw error;
}

function createWebSocketTransport() {
  let ws = null;

  function sendRaw(message) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  return {
    name: "websocket",
    connect() {
      return new Promise((resolve, reject) => {
        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const signalHost = getLocalSignalHost();
        ws = new WebSocket(`${protocol}://${signalHost}/signal`);

        const timeout = window.setTimeout(() => {
          reject(new Error("Tempo esgotado ao conectar."));
          ws.close();
        }, 7000);

        ws.addEventListener("open", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });

        ws.addEventListener("error", () => {
          window.clearTimeout(timeout);
          reject(new Error("Erro no WebSocket."));
        }, { once: true });

        ws.addEventListener("message", handleWebSocketMessage);
        ws.addEventListener("close", () => {
          if (state.joined) {
            setConnectionStatus("offline", "Desconectado");
            toast("A conexão com a sala caiu.");
          }
        });
      });
    },
    join(roomId, name) {
      sendRaw({ type: "join", roomId, name });
    },
    send(message) {
      sendRaw(message);
    },
    leave() {
      if (ws?.readyState === WebSocket.OPEN) {
        sendRaw({ type: "leave" });
        ws.close();
      }
    }
  };
}

function handleWebSocketMessage(event) {
  let message;

  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  dispatchServerMessage(message);
}

function createFirebaseTransport() {
  const seenSignals = new Set();
  const seenMessages = new Set();
  let fb = null;
  let db = null;
  let auth = null;
  let selfId = null;
  let roomRef = null;
  let participantRef = null;
  let participantsRef = null;
  let signalsRef = null;
  let messagesRef = null;
  let heartbeatTimer = null;
  let staleTimer = null;
  const unsubscribers = [];

  async function updateOwnPresence(extra = {}) {
    if (!participantRef) return;
    await fb.updateDoc(participantRef, {
      lastSeenMs: Date.now(),
      lastSeenAt: fb.serverTimestamp(),
      ...extra
    }).catch(() => {});
  }

  function startHeartbeat() {
    window.clearInterval(heartbeatTimer);
    window.clearInterval(staleTimer);

    heartbeatTimer = window.setInterval(() => {
      updateOwnPresence();
    }, HEARTBEAT_MS);

    staleTimer = window.setInterval(() => {
      let changed = false;
      for (const peer of state.peers.values()) {
        if (isStalePeer(peer.lastSeenMs)) {
          removePeer(peer.id, false);
          changed = true;
        }
      }
      if (changed) renderPeople();
    }, HEARTBEAT_MS);
  }

  function subscribeParticipants() {
    unsubscribers.push(fb.onSnapshot(participantsRef, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const id = change.doc.id;
        if (id === selfId) continue;

        const data = change.doc.data();

        if (change.type === "removed" || isStalePeer(data.lastSeenMs)) {
          removePeer(id);
          renderPeople();
          continue;
        }

        const peerMeta = participantToPeer(id, data);
        const peer = state.peers.get(id);

        if (!peer) {
          dispatchServerMessage({ type: "peer-joined", peer: peerMeta });
          continue;
        }

        peer.name = peerMeta.name;
        peer.color = peerMeta.color;
        peer.lastSeenMs = peerMeta.lastSeenMs;
        peer.mediaState = { ...peer.mediaState, ...peerMeta.mediaState };
        updateTile(peer.id);
        renderPeople();
      }
    }));
  }

  function subscribeSignals() {
    const inbox = fb.query(signalsRef, fb.where("to", "==", selfId));
    unsubscribers.push(fb.onSnapshot(inbox, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added" || seenSignals.has(change.doc.id)) continue;
        seenSignals.add(change.doc.id);

        const data = change.doc.data();
        dispatchServerMessage({
          type: "signal",
          from: data.from,
          signalType: data.signalType,
          data: data.data
        });

        fb.deleteDoc(change.doc.ref).catch(() => {});
      }
    }));
  }

  function subscribeMessages() {
    const recentMessages = fb.query(
      messagesRef,
      fb.orderBy("createdAtMs", "asc"),
      fb.limit(120)
    );

    unsubscribers.push(fb.onSnapshot(recentMessages, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added" || seenMessages.has(change.doc.id)) continue;
        seenMessages.add(change.doc.id);

        const data = change.doc.data();
        dispatchServerMessage({
          type: "chat",
          id: change.doc.id,
          from: data.from,
          name: data.name,
          color: data.color,
          text: data.text,
          timestamp: data.createdAtMs || data.createdAt?.toMillis?.() || Date.now()
        });
      }
    }));
  }

  return {
    name: "firebase",
    async connect() {
      fb = await loadFirebaseModules();
      const app = fb.getApps().length
        ? fb.getApp()
        : fb.initializeApp(getFirebaseConfig());
      auth = fb.getAuth(app);
      const credentials = await fb.signInAnonymously(auth);
      db = fb.getFirestore(app);
      selfId = `${credentials.user.uid}-${shortId()}`;
    },
    async join(roomId, name) {
      const now = Date.now();
      roomRef = fb.doc(db, "rooms", roomId);
      participantsRef = fb.collection(roomRef, "participants");
      signalsRef = fb.collection(roomRef, "signals");
      messagesRef = fb.collection(roomRef, "messages");
      participantRef = fb.doc(participantsRef, selfId);

      const currentParticipants = await fb.getDocs(participantsRef);
      const peers = [];

      currentParticipants.forEach((docSnap) => {
        if (docSnap.id === selfId) return;
        const data = docSnap.data();
        if (!isStalePeer(data.lastSeenMs)) {
          peers.push(participantToPeer(docSnap.id, data));
        }
      });

      await fb.setDoc(roomRef, {
        roomId,
        updatedAt: fb.serverTimestamp(),
        updatedAtMs: now
      }, { merge: true });

      await fb.setDoc(participantRef, {
        name,
        color: state.color,
        mediaState: currentMediaState(),
        joinedAt: fb.serverTimestamp(),
        joinedAtMs: now,
        lastSeenAt: fb.serverTimestamp(),
        lastSeenMs: now
      }, { merge: true });

      dispatchServerMessage({
        type: "welcome",
        id: selfId,
        roomId,
        peers
      });

      subscribeParticipants();
      subscribeSignals();
      subscribeMessages();
      startHeartbeat();
    },
    send(message) {
      if (!participantRef) return;

      if (message.type === "signal") {
        fb.addDoc(signalsRef, {
          from: selfId,
          to: message.to,
          signalType: message.signalType,
          data: plainSignalData(message.data),
          createdAt: fb.serverTimestamp(),
          createdAtMs: Date.now()
        }).catch((error) => console.error("Falha ao enviar sinal:", error));
        return;
      }

      if (message.type === "chat") {
        const text = String(message.text || "").trim().slice(0, 800);
        if (!text) return;

        fb.addDoc(messagesRef, {
          from: selfId,
          name: state.userName,
          color: state.color,
          text,
          createdAt: fb.serverTimestamp(),
          createdAtMs: Date.now()
        }).catch((error) => console.error("Falha ao enviar mensagem:", error));
        return;
      }

      if (message.type === "media-state") {
        updateOwnPresence({ mediaState: message.state });
      }
    },
    async leave(isUnloading = false) {
      window.clearInterval(heartbeatTimer);
      window.clearInterval(staleTimer);
      for (const unsubscribe of unsubscribers.splice(0)) {
        unsubscribe();
      }

      if (participantRef && !isUnloading) {
        await fb.deleteDoc(participantRef).catch(() => {});
      }

      participantRef = null;
    }
  };
}

async function loadFirebaseModules() {
  if (!firebaseModulesPromise) {
    firebaseModulesPromise = Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`)
    ]).then(([app, auth, firestore]) => ({
      initializeApp: app.initializeApp,
      getApp: app.getApp,
      getApps: app.getApps,
      getAuth: auth.getAuth,
      signInAnonymously: auth.signInAnonymously,
      getFirestore: firestore.getFirestore,
      collection: firestore.collection,
      doc: firestore.doc,
      setDoc: firestore.setDoc,
      updateDoc: firestore.updateDoc,
      addDoc: firestore.addDoc,
      deleteDoc: firestore.deleteDoc,
      getDocs: firestore.getDocs,
      onSnapshot: firestore.onSnapshot,
      query: firestore.query,
      where: firestore.where,
      orderBy: firestore.orderBy,
      limit: firestore.limit,
      serverTimestamp: firestore.serverTimestamp
    }));
  }

  return firebaseModulesPromise;
}

function dispatchServerMessage(message) {
  if (message.type === "welcome") {
    enterApp(message);
    return;
  }

  if (message.type === "peer-joined") {
    createPeer(message.peer, false);
    renderPeople();
    toast(`${message.peer.name} entrou na sala.`);
    return;
  }

  if (message.type === "peer-left") {
    removePeer(message.id);
    renderPeople();
    return;
  }

  if (message.type === "signal") {
    receiveSignal(message);
    return;
  }

  if (message.type === "chat") {
    addChatMessage(message);
    return;
  }

  if (message.type === "media-state") {
    const peer = state.peers.get(message.from);
    if (peer) {
      peer.mediaState = { ...peer.mediaState, ...message.state };
      updateTile(peer.id);
      renderPeople();
    }
  }
}

function getAudioConstraints() {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};

  return {
    echoCancellation: true,
    noiseSuppression: supported.noiseSuppression ? state.noiseSuppressionEnabled : undefined,
    autoGainControl: supported.autoGainControl ? true : undefined
  };
}

function supportsNoiseSuppression() {
  return Boolean(navigator.mediaDevices?.getSupportedConstraints?.()?.noiseSuppression);
}

async function prepareLocalMedia() {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Este navegador não liberou o microfone.");
    updateMicMonitorDisplay();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioConstraints()
    });

    state.audioTrack = stream.getAudioTracks()[0] || null;
    state.micEnabled = Boolean(state.audioTrack);
    state.cameraTrack = null;
    state.cameraEnabled = false;

    if (state.audioTrack) {
      state.audioTrack.enabled = true;
      startMicMonitor();
    }
  } catch (error) {
    console.warn("Falha ao acessar mídia local:", error);
    state.micEnabled = false;
    state.cameraEnabled = false;
    updateMicMonitorDisplay();
    toast("Você entrou sem microfone. Dá para ativar pelo botão de microfone.");
  }
}

function enterApp(message) {
  state.selfId = message.id;
  state.joined = true;

  els.joinScreen.hidden = true;
  els.appScreen.hidden = false;
  els.joinScreen.classList.add("hidden");
  els.appScreen.classList.remove("hidden");
  els.roomLabel.textContent = state.channelName;
  els.serverNameLabel.textContent = state.serverName;
  els.serverCodeLabel.textContent = `Código: ${state.serverId}`;
  els.serverIcon.textContent = getInitial(state.serverName);
  els.channelLabel.textContent = state.channelName;
  setConnectionStatus("connected", "Conectado");
  setJoinStatus("");

  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  url.searchParams.set("server", state.serverId);
  url.searchParams.set("serverName", state.serverName);
  window.history.replaceState({}, "", url);

  updateControls();
  renderLocalTile();
  renderPeople();
  sendMediaState();

  for (const peer of message.peers || []) {
    createPeer(peer, true);
  }

  els.messageInput.focus();
}

function createPeer(meta, shouldOffer) {
  if (!meta?.id || meta.id === state.selfId) return state.peers.get(meta?.id);
  if (state.peers.has(meta.id)) return state.peers.get(meta.id);

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const remoteStream = new MediaStream();

  const audioTransceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
  const videoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });

  const peer = {
    id: meta.id,
    name: meta.name || "Convidado",
    color: meta.color || palette[state.peers.size % palette.length],
    lastSeenMs: meta.lastSeenMs || Date.now(),
    pc,
    remoteStream,
    audioSender: audioTransceiver.sender,
    videoSender: videoTransceiver.sender,
    pendingCandidates: [],
    mediaState: {
      micEnabled: meta.mediaState?.micEnabled ?? true,
      cameraEnabled: meta.mediaState?.cameraEnabled ?? false,
      screenEnabled: meta.mediaState?.screenEnabled ?? false
    }
  };

  state.peers.set(peer.id, peer);

  syncSenders(peer);

  pc.addEventListener("track", (event) => {
    const [stream] = event.streams;
    const tracks = stream?.getTracks?.() || [event.track];

    for (const track of tracks) {
      if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) {
        remoteStream.addTrack(track);
      }
    }

    event.track.addEventListener("mute", () => updateTile(peer.id));
    event.track.addEventListener("unmute", () => updateTile(peer.id));
    event.track.addEventListener("ended", () => updateTile(peer.id));
    updateTile(peer.id);
  });

  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) {
      sendSignal(peer.id, "candidate", event.candidate);
    }
  });

  pc.addEventListener("connectionstatechange", () => {
    updateTile(peer.id);
    if (pc.connectionState === "failed") {
      pc.restartIce();
    }
  });

  renderPeople();
  updateTile(peer.id);

  if (shouldOffer) {
    makeOffer(peer);
  }

  return peer;
}

async function makeOffer(peer) {
  try {
    if (peer.pc.signalingState !== "stable") return;
    await syncSenders(peer);
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    sendSignal(peer.id, "offer", peer.pc.localDescription);
  } catch (error) {
    console.error("Falha ao criar oferta:", error);
  }
}

async function receiveSignal(message) {
  let peer = state.peers.get(message.from);

  if (!peer) {
    peer = createPeer({
      id: message.from,
      name: "Convidado",
      color: palette[state.peers.size % palette.length]
    }, false);
  }

  try {
    if (message.signalType === "offer") {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(message.data));
      await flushCandidates(peer);
      await syncSenders(peer);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      sendSignal(peer.id, "answer", peer.pc.localDescription);
      return;
    }

    if (message.signalType === "answer") {
      if (peer.pc.signalingState !== "stable") {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(message.data));
        await flushCandidates(peer);
      }
      return;
    }

    if (message.signalType === "candidate" && message.data) {
      if (peer.pc.remoteDescription) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(message.data));
      } else {
        peer.pendingCandidates.push(message.data);
      }
    }
  } catch (error) {
    console.error("Falha ao processar sinal:", error);
  }
}

async function flushCandidates(peer) {
  while (peer.pendingCandidates.length) {
    const candidate = peer.pendingCandidates.shift();
    await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

function sendSignal(to, signalType, data) {
  send({ type: "signal", to, signalType, data: plainSignalData(data) });
}

function syncSenders(peer) {
  return Promise.all([
    peer.audioSender.replaceTrack(state.micEnabled ? state.audioTrack : null),
    peer.videoSender.replaceTrack(getActiveVideoTrack())
  ]);
}

function replaceAudioForAll() {
  const jobs = [];
  for (const peer of state.peers.values()) {
    jobs.push(peer.audioSender.replaceTrack(state.micEnabled ? state.audioTrack : null));
  }
  return Promise.allSettled(jobs);
}

function replaceVideoForAll() {
  const jobs = [];
  const track = getActiveVideoTrack();
  for (const peer of state.peers.values()) {
    jobs.push(peer.videoSender.replaceTrack(track));
  }
  return Promise.allSettled(jobs);
}

async function toggleMicrophone() {
  if (!state.audioTrack || state.audioTrack.readyState === "ended") {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints()
      });
      state.audioTrack = stream.getAudioTracks()[0] || null;
      state.micEnabled = Boolean(state.audioTrack);
      if (state.audioTrack) {
        state.audioTrack.enabled = true;
        startMicMonitor();
      }
    } catch {
      toast("Não consegui ativar o microfone.");
      updateMicMonitorDisplay();
      return;
    }
  } else {
    state.micEnabled = !state.micEnabled;
    state.audioTrack.enabled = state.micEnabled;
  }

  await replaceAudioForAll();
  updateControls();
  renderLocalTile();
  renderPeople();
  sendMediaState();
}

async function toggleNoiseSuppression() {
  if (!supportsNoiseSuppression()) {
    toast("Este navegador não oferece supressão de ruído nativa.");
    updateControls();
    return;
  }

  state.noiseSuppressionEnabled = !state.noiseSuppressionEnabled;
  updateControls();

  if (!state.audioTrack || state.audioTrack.readyState === "ended") {
    toast(state.noiseSuppressionEnabled ? "Supressão de ruído ligada." : "Supressão de ruído desligada.");
    return;
  }

  const wasEnabled = state.micEnabled;
  const oldTrack = state.audioTrack;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioConstraints()
    });
    state.audioTrack = stream.getAudioTracks()[0] || null;
    state.micEnabled = Boolean(state.audioTrack && wasEnabled);

    if (state.audioTrack) {
      state.audioTrack.enabled = wasEnabled;
      oldTrack.stop();
      startMicMonitor();
      await replaceAudioForAll();
      renderLocalTile();
      renderPeople();
      sendMediaState();
    }

    toast(state.noiseSuppressionEnabled ? "Supressão de ruído ligada." : "Supressão de ruído desligada.");
  } catch (error) {
    state.noiseSuppressionEnabled = !state.noiseSuppressionEnabled;
    updateControls();
    console.warn("Falha ao alternar supressão de ruído:", error);
    toast("Não consegui trocar a supressão de ruído.");
  }
}

function toggleOutputAudio() {
  state.outputMuted = !state.outputMuted;
  applyOutputMute();
  updateControls();
  toast(state.outputMuted ? "Fone mutado." : "Fone desmutado.");
}

async function toggleCamera() {
  if (state.cameraEnabled) {
    state.cameraEnabled = false;
    if (state.cameraTrack?.readyState === "live") {
      state.cameraTrack.stop();
    }
    state.cameraTrack = null;
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 }
        }
      });
      state.cameraTrack = stream.getVideoTracks()[0] || null;
      state.cameraEnabled = Boolean(state.cameraTrack);
      if (state.cameraTrack) {
        state.cameraTrack.enabled = true;
      }
    } catch {
      state.cameraEnabled = false;
      state.cameraTrack = null;
      toast("Não consegui ativar a câmera.");
      return;
    }
  }

  if (!state.screenTrack) {
    await replaceVideoForAll();
  }

  updateControls();
  renderLocalTile();
  renderPeople();
  sendMediaState();
}

async function toggleScreenShare() {
  if (state.screenTrack) {
    stopScreenShare();
    return;
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    toast("Compartilhamento de tela não está disponível neste navegador.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "monitor"
      },
      audio: false
    });

    state.screenTrack = stream.getVideoTracks()[0] || null;
    if (!state.screenTrack) return;

    state.screenTrack.addEventListener("ended", stopScreenShare, { once: true });
    await replaceVideoForAll();
    updateControls();
    renderLocalTile();
    renderPeople();
    sendMediaState();
  } catch {
    toast("Compartilhamento de tela cancelado.");
  }
}

async function stopScreenShare() {
  const track = state.screenTrack;
  state.screenTrack = null;

  if (track?.readyState === "live") {
    track.stop();
  }

  await replaceVideoForAll();
  updateControls();
  renderLocalTile();
  renderPeople();
  sendMediaState();
}

function getActiveVideoTrack() {
  if (state.screenTrack) return state.screenTrack;
  if (state.cameraEnabled && state.cameraTrack?.readyState === "live") return state.cameraTrack;
  return null;
}

function renderLocalTile() {
  const stream = new MediaStream();
  const activeVideo = getActiveVideoTrack();

  if (activeVideo) {
    stream.addTrack(activeVideo);
  }

  updateTile("local", {
    id: "local",
    name: `${state.userName} (você)`,
    color: state.color,
    stream,
    mediaState: currentMediaState(),
    isLocal: true
  });
}

function updateTile(peerId, override = null) {
  const data = override || state.peers.get(peerId);
  if (!data) return;

  let tile = state.tiles.get(peerId);

  if (!tile) {
    tile = createTile(peerId);
    state.tiles.set(peerId, tile);
    els.videoGrid.appendChild(tile.root);
  }

  const mediaState = data.mediaState || {};
  const stream = data.stream || data.remoteStream || new MediaStream();
  const videoTracks = stream.getVideoTracks();
  const hasLiveVideo = videoTracks.some((track) => track.readyState === "live" && !track.muted);
  const shouldShowVideo = Boolean(hasLiveVideo && (mediaState.screenEnabled || mediaState.cameraEnabled !== false));

  tile.root.classList.toggle("has-video", shouldShowVideo);
  tile.root.classList.toggle("audio-only", !shouldShowVideo);
  tile.root.classList.toggle("screen", Boolean(mediaState.screenEnabled));
  tile.video.srcObject = stream;
  tile.video.muted = Boolean(data.isLocal || state.outputMuted);
  tile.name.textContent = data.name;
  tile.avatarText.textContent = getInitial(data.name);
  tile.avatarText.style.background = data.color;
  tile.badges.innerHTML = "";

  tile.badges.appendChild(createBadge("Mic", !mediaState.micEnabled));
  tile.badges.appendChild(createBadge(mediaState.screenEnabled ? "Tela" : "Cam", !mediaState.screenEnabled && mediaState.cameraEnabled === false));
  updateStageLayout();
}

function createTile(id) {
  const root = document.createElement("article");
  root.className = "video-tile";
  root.dataset.peerId = id;

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;

  const avatar = document.createElement("div");
  avatar.className = "tile-avatar";
  const avatarText = document.createElement("span");
  avatar.appendChild(avatarText);

  const footer = document.createElement("div");
  footer.className = "tile-footer";
  const name = document.createElement("span");
  name.className = "tile-name";
  const badges = document.createElement("div");
  badges.className = "tile-badges";

  footer.append(name, badges);
  root.append(video, avatar, footer);

  return { root, video, avatarText, name, badges };
}

function createBadge(text, isOff) {
  const badge = document.createElement("span");
  badge.textContent = text;
  badge.classList.toggle("off", Boolean(isOff));
  return badge;
}

function updateStageLayout() {
  const hasVisualTile = [...state.tiles.values()].some((tile) => tile.root.classList.contains("has-video"));
  els.videoGrid.classList.toggle("audio-layout", !hasVisualTile);
  els.videoGrid.classList.toggle("media-layout", hasVisualTile);
}

function renderPeople() {
  const people = [
    {
      id: "local",
      name: `${state.userName || "Você"} (você)`,
      color: state.color,
      mediaState: currentMediaState()
    },
    ...state.peers.values()
  ];

  els.peopleCount.textContent = String(people.length);
  els.channelCount.textContent = String(people.length);
  els.peopleList.replaceChildren(...people.map(createPersonRow));
}

function createPersonRow(person) {
  const row = document.createElement("div");
  row.className = "person-row";

  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.style.background = person.color;
  avatar.textContent = getInitial(person.name);

  const text = document.createElement("div");
  const name = document.createElement("div");
  name.className = "person-name";
  name.textContent = person.name;
  const meta = document.createElement("div");
  meta.className = "person-meta";
  meta.textContent = person.mediaState?.screenEnabled ? "Compartilhando tela" : "Na chamada";
  text.append(name, meta);

  const stateIcons = document.createElement("div");
  stateIcons.className = "mini-state";
  stateIcons.append(
    createMiniState("M", person.mediaState?.micEnabled),
    createMiniState("C", person.mediaState?.cameraEnabled || person.mediaState?.screenEnabled)
  );

  row.append(avatar, text, stateIcons);
  return row;
}

function createMiniState(label, active) {
  const item = document.createElement("span");
  item.classList.toggle("active", Boolean(active));
  item.textContent = label;
  return item;
}

function sendChatMessage(event) {
  event.preventDefault();
  const text = els.messageInput.value.trim();
  if (!text) return;
  send({ type: "chat", text });
  els.messageInput.value = "";
}

function addChatMessage(message) {
  if (state.chatCollapsed && message.from !== state.selfId) {
    state.chatUnread = true;
    applyPanelState();
  }

  const item = document.createElement("article");
  item.className = "message";
  item.classList.toggle("mine", message.from === state.selfId);

  const head = document.createElement("div");
  head.className = "message-head";
  const name = document.createElement("span");
  name.textContent = message.name || "Convidado";
  const time = document.createElement("time");
  time.textContent = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(message.timestamp || Date.now()));
  head.append(name, time);

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = message.text;

  item.append(head, body);
  els.messages.appendChild(item);
  els.messages.scrollTop = els.messages.scrollHeight;
}

function removePeer(peerId, showToast = true) {
  const peer = state.peers.get(peerId);
  if (peer) {
    peer.pc.close();
    peer.remoteStream.getTracks().forEach((track) => track.stop());
    state.peers.delete(peerId);
    if (showToast) {
      toast(`${peer.name} saiu da sala.`);
    }
  }

  const tile = state.tiles.get(peerId);
  if (tile) {
    tile.root.remove();
    state.tiles.delete(peerId);
    updateStageLayout();
  }
}

function updateControls() {
  const noiseSupported = supportsNoiseSuppression();

  els.micButton.classList.toggle("active", state.micEnabled);
  els.micButton.classList.toggle("off", !state.micEnabled);
  els.micButton.dataset.tooltip = state.micEnabled ? "Mutar microfone" : "Desmutar microfone";
  els.micButton.setAttribute("aria-pressed", String(state.micEnabled));

  els.noiseButton.classList.toggle("active", state.noiseSuppressionEnabled);
  els.noiseButton.classList.toggle("off", !state.noiseSuppressionEnabled);
  els.noiseButton.disabled = !noiseSupported;
  els.noiseButton.dataset.tooltip = !noiseSupported
    ? "Supressão indisponível"
    : state.noiseSuppressionEnabled
      ? "Desligar supressão de ruído"
      : "Ligar supressão de ruído";
  els.noiseButton.setAttribute("aria-pressed", String(state.noiseSuppressionEnabled));

  els.deafenButton.classList.toggle("active", !state.outputMuted);
  els.deafenButton.classList.toggle("off", state.outputMuted);
  els.deafenButton.dataset.tooltip = state.outputMuted ? "Desmutar fone" : "Mutar fone";
  els.deafenButton.setAttribute("aria-pressed", String(state.outputMuted));

  els.cameraButton.classList.toggle("active", state.cameraEnabled && !state.screenTrack);
  els.cameraButton.classList.toggle("off", !state.cameraEnabled && !state.screenTrack);
  els.cameraButton.dataset.tooltip = state.cameraEnabled ? "Desligar câmera" : "Ligar câmera";
  els.cameraButton.setAttribute("aria-pressed", String(state.cameraEnabled));

  els.screenButton.classList.toggle("active", Boolean(state.screenTrack));
  els.screenButton.dataset.tooltip = state.screenTrack ? "Parar compartilhamento" : "Compartilhar tela";
  els.screenButton.setAttribute("aria-pressed", String(Boolean(state.screenTrack)));
  updateMicMonitorDisplay();
}

function applyOutputMute() {
  for (const [peerId, tile] of state.tiles) {
    tile.video.muted = peerId === "local" || state.outputMuted;
  }
}

function startMicMonitor() {
  stopMicMonitor(false);

  if (!state.audioTrack || state.audioTrack.readyState === "ended") {
    updateMicMonitorDisplay();
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    updateMicMonitorDisplay("Medidor indisponível");
    return;
  }

  try {
    state.audioContext = state.audioContext || new AudioContextClass();
    if (state.audioContext.state === "suspended") {
      state.audioContext.resume().catch(() => {});
    }

    const stream = new MediaStream([state.audioTrack]);
    state.micSource = state.audioContext.createMediaStreamSource(stream);
    state.micAnalyser = state.audioContext.createAnalyser();
    state.micAnalyser.fftSize = 512;
    state.micAnalyser.smoothingTimeConstant = 0.72;
    state.micSource.connect(state.micAnalyser);

    const samples = new Uint8Array(state.micAnalyser.fftSize);

    const tick = () => {
      if (!state.micAnalyser) return;

      state.micAnalyser.getByteTimeDomainData(samples);
      let sum = 0;

      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }

      const rms = Math.sqrt(sum / samples.length);
      state.micLevel = state.micEnabled ? clamp((rms - 0.012) * 10, 0, 1) : 0;
      updateMicMonitorDisplay();
      state.micMeterFrame = window.requestAnimationFrame(tick);
    };

    tick();
  } catch (error) {
    console.warn("Falha no medidor de microfone:", error);
    updateMicMonitorDisplay("Medidor indisponível");
  }
}

function stopMicMonitor(closeContext = true) {
  if (state.micMeterFrame) {
    window.cancelAnimationFrame(state.micMeterFrame);
    state.micMeterFrame = null;
  }

  if (state.micSource) {
    try {
      state.micSource.disconnect();
    } catch {}
    state.micSource = null;
  }

  state.micAnalyser = null;
  state.micLevel = 0;

  if (closeContext && state.audioContext) {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }

  updateMicMonitorDisplay();
}

function updateMicMonitorDisplay(forcedText = "") {
  if (!els.micMeterBar || !els.micStatusLabel || !els.micMonitor) return;

  const hasMic = Boolean(state.audioTrack && state.audioTrack.readyState === "live");
  const level = hasMic && state.micEnabled ? state.micLevel : 0;
  const active = hasMic && state.micEnabled && level > 0.08;
  const muted = hasMic && !state.micEnabled;
  const missing = !hasMic;

  els.micMeterBar.style.transform = `scaleX(${level})`;
  els.micMonitor.classList.toggle("active", active);
  els.micMonitor.classList.toggle("muted", muted);
  els.micMonitor.classList.toggle("missing", missing);

  if (forcedText) {
    els.micStatusLabel.textContent = forcedText;
  } else if (missing) {
    els.micStatusLabel.textContent = "Sem microfone";
  } else if (muted) {
    els.micStatusLabel.textContent = "Microfone mutado";
  } else if (active) {
    els.micStatusLabel.textContent = "Microfone captando";
  } else {
    els.micStatusLabel.textContent = "Fale para testar";
  }

  const localTile = state.tiles.get("local");
  if (localTile) {
    localTile.root.classList.toggle("speaking", active);
  }
}

function sendMediaState() {
  send({
    type: "media-state",
    state: currentMediaState()
  });
}

function currentMediaState() {
  return {
    micEnabled: state.micEnabled,
    cameraEnabled: state.cameraEnabled,
    screenEnabled: Boolean(state.screenTrack)
  };
}

function send(message) {
  state.transport?.send?.(message);
}

async function copyInviteLink() {
  const url = new URL(window.location.href);
  url.searchParams.delete("room");
  url.searchParams.set("server", state.serverId);
  url.searchParams.set("serverName", state.serverName);

  try {
    await navigator.clipboard.writeText(url.toString());
    toast("Convite copiado.");
  } catch {
    toast(url.toString());
  }
}

async function leaveRoom() {
  await state.transport?.leave?.();
  state.transport = null;

  for (const peerId of [...state.peers.keys()]) {
    removePeer(peerId, false);
  }

  const localTile = state.tiles.get("local");
  if (localTile) {
    localTile.root.remove();
    state.tiles.delete("local");
  }

  stopAllMedia();

  state.selfId = null;
  state.joined = false;
  state.cameraEnabled = false;
  state.micEnabled = false;
  state.outputMuted = false;
  state.screenTrack = null;

  els.messages.replaceChildren();
  els.joinButton.disabled = false;
  els.joinScreen.hidden = false;
  els.appScreen.hidden = true;
  els.appScreen.classList.add("hidden");
  els.joinScreen.classList.remove("hidden");
  setConnectionStatus("offline", "Desconectado");
  setJoinStatus("");
}

function stopAllMedia() {
  stopMicMonitor(true);

  for (const track of [state.audioTrack, state.cameraTrack, state.screenTrack]) {
    if (track?.readyState === "live") {
      track.stop();
    }
  }

  state.audioTrack = null;
  state.cameraTrack = null;
  state.screenTrack = null;
  updateMicMonitorDisplay();
}

function setConnectionStatus(status, label) {
  els.connectionStatus.classList.remove("connected", "offline", "connecting");
  els.connectionStatus.classList.add(status);
  els.connectionStatus.textContent = label;
}

function setJoinStatus(text) {
  els.joinStatus.textContent = text;
}

function toast(message) {
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  els.toastStack.appendChild(item);

  window.setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(6px)";
    window.setTimeout(() => item.remove(), 220);
  }, 3600);
}

function hasFirebaseConfig() {
  const config = getFirebaseConfig();
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

function getFirebaseConfig() {
  return window.PONTE_FIREBASE_CONFIG || null;
}

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function getLocalSignalHost() {
  if (isLocalHost() && window.location.port && window.location.port !== "8081") {
    return `${window.location.hostname}:8081`;
  }

  return window.location.host;
}

function participantToPeer(id, data) {
  return {
    id,
    name: data.name || "Convidado",
    color: data.color || palette[Math.abs(hashCode(id)) % palette.length],
    lastSeenMs: data.lastSeenMs || 0,
    mediaState: {
      micEnabled: data.mediaState?.micEnabled ?? true,
      cameraEnabled: data.mediaState?.cameraEnabled ?? false,
      screenEnabled: data.mediaState?.screenEnabled ?? false
    }
  };
}

function isStalePeer(lastSeenMs) {
  return !lastSeenMs || Date.now() - Number(lastSeenMs) > STALE_PEER_MS;
}

function plainSignalData(data) {
  if (!data) return null;
  if (typeof data.toJSON === "function") return data.toJSON();
  return JSON.parse(JSON.stringify(data));
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildRoomId(serverId, channelId) {
  return normalizeRoomId(`${serverId}-${channelId}`);
}

function createServerId(name) {
  const base = normalizeRoomId(name).replace(/-/g, "-") || "servidor";
  const number = Math.floor(100 + Math.random() * 900);
  return `${base.slice(0, 28)}-${number}`;
}

function createDefaultServerName() {
  const left = ["Disc0rd", "Mesa", "Canal", "Noite", "Grupo"];
  const right = ["Norte", "Solar", "Pixel", "Verde", "Clara"];
  return `${pick(left)} ${pick(right)}`;
}

function extractServerId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return normalizeRoomId(url.searchParams.get("server") || url.searchParams.get("room") || "");
  } catch {
    return normalizeRoomId(raw);
  }
}

function saveServer(server) {
  if (!server.id) return;

  const servers = getSavedServers().filter((item) => item.id !== server.id);
  servers.unshift({
    id: server.id,
    name: server.name || `Servidor ${server.id}`
  });
  localStorage.setItem("ponte.servers", JSON.stringify(servers.slice(0, 12)));
}

function deleteSavedServer(serverId) {
  const normalizedId = normalizeRoomId(serverId);
  if (!normalizedId) return;

  const servers = getSavedServers().filter((server) => server.id !== normalizedId);
  localStorage.setItem("ponte.servers", JSON.stringify(servers));

  if (extractServerId(els.serverCodeInput.value) === normalizedId) {
    els.serverCodeInput.value = "";
    state.inviteServerName = "";
  }

  renderSavedServers();
}

function getSavedServers() {
  try {
    const value = JSON.parse(localStorage.getItem("ponte.servers") || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function getSavedServerName(serverId) {
  return getSavedServers().find((server) => server.id === serverId)?.name || "";
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function getInitial(name) {
  return String(name || "?").trim().charAt(0) || "?";
}

function shortId() {
  return Math.random().toString(36).slice(2, 10);
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
