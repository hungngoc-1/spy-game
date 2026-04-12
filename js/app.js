// ========================================
// Main App Controller - Spy Game
// ========================================

const App = {
  currentScreen: null,
  selectedMode: null,
  roleRevealed: false,
  recognition: null,
  isListening: false,

  /**
   * Initialize the app
   */
  init() {
    // Listen for auth state
    Auth.onAuthStateChanged((user) => {
      if (user) {
        document.getElementById('user-display-name').textContent = user.name;
        this.showScreen('screen-home');
      } else {
        this.showScreen('screen-auth');
      }
      // Hide loading
      document.getElementById('screen-loading').classList.add('hidden');
    });

    this.bindEvents();
    this.bindKeyboardShortcuts();

    // Show loading initially
    setTimeout(() => {
      document.getElementById('loading-status').textContent = 'Đang kết nối...';
    }, 500);
  },

  // ================================
  // SCREEN MANAGEMENT
  // ================================

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.add('active');
      this.currentScreen = screenId;
    }
  },

  // ================================
  // EVENT BINDINGS
  // ================================

  bindEvents() {
    // --- Auth Events ---
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        const target = e.target.dataset.tab;
        document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
        document.getElementById('signup-form').classList.toggle('hidden', target !== 'signup');
        document.getElementById('auth-error').classList.add('hidden');
      });
    });

    document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('signup-form').addEventListener('submit', (e) => this.handleSignup(e));
    document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());

    // --- Home Events ---
    document.getElementById('mode-inperson').addEventListener('click', () => this.selectMode('inperson'));
    document.getElementById('mode-online').addEventListener('click', () => this.selectMode('online'));
    document.getElementById('btn-create-room').addEventListener('click', () => this.showScreen('screen-create'));
    document.getElementById('btn-join-room').addEventListener('click', () => this.showScreen('screen-join'));

    // --- Create Room ---
    document.getElementById('create-room-form').addEventListener('submit', (e) => this.handleCreateRoom(e));
    document.getElementById('btn-back-create').addEventListener('click', () => this.showScreen('screen-home'));

    // --- Join Room ---
    document.getElementById('join-room-form').addEventListener('submit', (e) => this.handleJoinRoom(e));
    document.getElementById('btn-back-join').addEventListener('click', () => this.showScreen('screen-home'));

    // --- Waiting Room ---
    document.getElementById('btn-leave-room').addEventListener('click', () => this.handleLeaveRoom());
    document.getElementById('btn-start-game').addEventListener('click', () => this.handleStartGame());
    document.getElementById('btn-copy-code').addEventListener('click', () => this.copyRoomCode());

    // --- Game Screen ---
    document.getElementById('btn-reveal-role').addEventListener('click', () => this.toggleRoleReveal());
    document.getElementById('btn-start-vote').addEventListener('click', () => this.handleStartVoting());
    document.getElementById('btn-leave-game').addEventListener('click', () => this.handleLeaveRoom());

    // --- Bot Testing ---
    document.getElementById('btn-add-bot').addEventListener('click', () => this.handleAddBot());
    document.getElementById('btn-add-3-bots').addEventListener('click', () => this.handleAdd3Bots());

    // --- Online Chat ---
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
      chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));
    }

    // --- Results ---
    document.getElementById('btn-play-again').addEventListener('click', () => this.handlePlayAgain());
    document.getElementById('btn-back-home').addEventListener('click', () => this.handleBackHome());

    // --- Vote Reveal Continue ---
    document.getElementById('btn-continue-game').addEventListener('click', () => this.handleContinueGame());

    // --- Slider updates ---
    document.getElementById('setting-players').addEventListener('input', (e) => {
      document.getElementById('players-value').textContent = e.target.value;
    });
    document.getElementById('setting-spies').addEventListener('input', (e) => {
      document.getElementById('spies-value').textContent = e.target.value;
    });
    document.getElementById('setting-whitehats').addEventListener('input', (e) => {
      document.getElementById('whitehats-value').textContent = e.target.value;
    });
    document.getElementById('setting-discussion').addEventListener('input', (e) => {
      document.getElementById('discussion-value').textContent = e.target.value;
    });

    // --- Mic Button ---
    const micBtn = document.getElementById('btn-mic');
    if (micBtn) {
      micBtn.addEventListener('click', () => this.toggleMic());
    }
  },

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.currentScreen === 'screen-create' || this.currentScreen === 'screen-join') {
          this.showScreen('screen-home');
        }
      }
    });
  },

  // ================================
  // AUTH HANDLERS
  // ================================

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang đăng nhập...';

    const result = await Auth.login(email, password);

    btn.disabled = false;
    btn.textContent = 'Đăng nhập';

    if (!result.success) {
      this.showAuthError(result.error);
    }
  },

  async handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const btn = e.target.querySelector('button[type="submit"]');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang đăng ký...';

    const result = await Auth.signup(email, password, name);

    btn.disabled = false;
    btn.textContent = 'Đăng ký';

    if (!result.success) {
      this.showAuthError(result.error);
    }
  },

  async handleLogout() {
    await Auth.logout();
    this.showScreen('screen-auth');
  },

  showAuthError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    errorEl.classList.add('shake');
    setTimeout(() => errorEl.classList.remove('shake'), 500);
  },

  // ================================
  // MODE SELECTION
  // ================================

  selectMode(mode) {
    this.selectedMode = mode;
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('mode-' + mode).classList.add('selected');
    
    // Update create room form based on mode
    const onlineSettings = document.getElementById('online-settings');
    if (onlineSettings) {
      onlineSettings.classList.toggle('hidden', mode !== 'online');
    }
  },

  // ================================
  // ROOM HANDLERS
  // ================================

  async handleCreateRoom(e) {
    e.preventDefault();

    if (!this.selectedMode) {
      this.showToast('Vui lòng chọn chế độ chơi trước!', 'warning');
      this.showScreen('screen-home');
      return;
    }

    const settings = {
      mode: this.selectedMode,
      maxPlayers: parseInt(document.getElementById('setting-players').value),
      numSpies: parseInt(document.getElementById('setting-spies').value),
      numWhiteHats: parseInt(document.getElementById('setting-whitehats').value),
      discussionTime: parseInt(document.getElementById('setting-discussion').value),
      votingTime: 60,
      keywordMode: document.getElementById('setting-keyword-mode')?.value || 'pair'
    };

    const btn = document.querySelector('#create-room-form button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang tạo phòng...';

    const result = await Game.createRoom(settings);

    btn.disabled = false;
    btn.textContent = 'Tạo Phòng';

    if (result.success) {
      this.enterWaitingRoom(result.code);
    } else {
      this.showToast(result.error, 'error');
    }
  },

  async handleJoinRoom(e) {
    e.preventDefault();
    const code = document.getElementById('join-code').value;
    
    const btn = document.querySelector('#join-room-form button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang tham gia...';

    const result = await Game.joinRoom(code);

    btn.disabled = false;
    btn.textContent = 'Tham Gia';

    if (result.success) {
      this.enterWaitingRoom(result.code);
    } else {
      this.showToast(result.error, 'error');
    }
  },

  async handleLeaveRoom() {
    if (confirm(Game.isHost ? 'Rời phòng sẽ xóa phòng. Bạn chắc chứ?' : 'Bạn muốn rời phòng?')) {
      Game.removeAllListeners();
      await Game.leaveRoom();
      this.showScreen('screen-home');
    }
  },

  // ================================
  // BOT TESTING
  // ================================

  async handleAddBot() {
    await Game.addBotPlayer();
    this.showToast('Đã thêm 1 bot!', 'success');
  },

  async handleAdd3Bots() {
    for (let i = 0; i < 3; i++) {
      await Game.addBotPlayer();
    }
    this.showToast('Đã thêm 3 bot!', 'success');
  },

  // ================================
  // WAITING ROOM
  // ================================

  enterWaitingRoom(code) {
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('btn-start-game').classList.toggle('hidden', !Game.isHost);

    // Show test controls for host
    document.getElementById('test-controls').classList.toggle('hidden', !Game.isHost);

    this.showScreen('screen-waiting');

    // Listen for room updates
    Game.listenToRoom((roomData) => {
      if (!roomData) {
        // Room was deleted
        this.showToast('Phòng đã bị xóa', 'warning');
        this.showScreen('screen-home');
        return;
      }

      this.updateWaitingRoom(roomData);

      // Game started!
      if (roomData.status === 'playing' && this.currentScreen === 'screen-waiting') {
        this.enterGameScreen(roomData);
      }

      // Status changed during game
      if (this.currentScreen === 'screen-game') {
        this.updateGameScreen(roomData);
      }

      if (roomData.status === 'voting') {
        this.enterVotingScreen(roomData);
      }

      if (roomData.status === 'revealing') {
        this.showVoteResults(roomData);
      }

      if (roomData.status === 'finished') {
        this.showFinalResults(roomData);
      }

      // Reset to waiting
      if (roomData.status === 'waiting' && (this.currentScreen === 'screen-game' || this.currentScreen === 'screen-results' || this.currentScreen === 'screen-voting' || this.currentScreen === 'screen-reveal')) {
        this.enterWaitingRoom(roomData.code);
      }
    });
  },

  updateWaitingRoom(roomData) {
    const playersList = document.getElementById('players-list');
    const players = roomData.players || {};
    const playerCount = Object.keys(players).length;

    document.getElementById('player-count').textContent = 
      `${playerCount} / ${roomData.settings.maxPlayers}`;

    playersList.innerHTML = '';
    Object.entries(players).forEach(([id, player]) => {
      const div = document.createElement('div');
      div.className = 'player-item glass-card';
      const isHost = id === roomData.host;
      const isMe = id === Auth.currentUser?.uid;
      div.innerHTML = `
        <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
        <div class="player-info">
          <span class="player-name">${player.name}${isMe ? ' (Bạn)' : ''}</span>
          ${isHost ? '<span class="player-badge host-badge">👑 Quản trò</span>' : ''}
        </div>
      `;
      playersList.appendChild(div);
    });

    // Show/hide start button
    const startBtn = document.getElementById('btn-start-game');
    if (Game.isHost) {
      startBtn.classList.remove('hidden');
      startBtn.disabled = playerCount < 3;
      if (playerCount < 3) {
        startBtn.textContent = `Cần ít nhất 3 người (${playerCount}/3)`;
      } else {
        startBtn.textContent = '🎮 Bắt Đầu Game';
      }
    }

    // Show mode
    document.getElementById('room-mode-display').textContent = 
      roomData.mode === 'inperson' ? '🏠 Chơi trực tiếp' : '🤖 Online AI';
  },

  // ================================
  // GAME SCREEN
  // ================================

  async handleStartGame() {
    const btn = document.getElementById('btn-start-game');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang khởi tạo game...';

    const result = await Game.startGame();

    if (!result.success) {
      btn.disabled = false;
      btn.textContent = '🎮 Bắt Đầu Game';
      this.showToast(result.error, 'error');
    }
  },

  enterGameScreen(roomData) {
    this.roleRevealed = false;
    this.showScreen('screen-game');

    const user = Auth.currentUser;
    const myPlayer = roomData.players[user.uid];
    const isSpy = myPlayer.role === 'spy';
    const isWhiteHat = myPlayer.role === 'whitehat';

    // Determine role display
    let roleIcon, roleTitle, roleClass, keywordText;
    if (isSpy) {
      roleIcon = '🕵️';
      roleTitle = 'GIÁN ĐIỆP';
      roleClass = 'spy';
      keywordText = !roomData.spyKeyword || roomData.spyKeyword === '???' ? 'Bạn không biết từ khóa!' : `Từ: ${myPlayer.keyword}`;
    } else if (isWhiteHat) {
      roleIcon = '🎩';
      roleTitle = 'MŨ TRẮNG';
      roleClass = 'whitehat';
      keywordText = 'Bạn không biết từ khóa!';
    } else {
      roleIcon = '👤';
      roleTitle = 'DÂN THƯỜNG';
      roleClass = 'civilian';
      keywordText = `Từ: ${myPlayer.keyword}`;
    }

    // Set role card
    const cardFront = document.getElementById('role-card-front');
    cardFront.className = `role-card-front ${roleClass}-card`;
    cardFront.innerHTML = `
      <div class="role-icon">${roleIcon}</div>
      <div class="role-title ${roleClass}">${roleTitle}</div>
      <div class="role-keyword">${keywordText}</div>
      <div class="role-category">Chủ đề: ${roomData.category}</div>
    `;

    // Show/hide host controls
    document.getElementById('host-controls').classList.toggle('hidden', !Game.isHost);
    document.getElementById('btn-start-vote').classList.toggle('hidden', !Game.isHost);

    // Update game info
    document.getElementById('game-round').textContent = `Vòng ${roomData.round || 1}`;
    document.getElementById('game-mode-label').textContent = 
      roomData.mode === 'inperson' ? '🏠 Trực tiếp' : '🤖 Online';

    // Update player list in game
    this.updateGamePlayerList(roomData);

    // For online mode, show chat
    const chatSection = document.getElementById('chat-section');
    chatSection.classList.toggle('hidden', roomData.mode !== 'online');

    if (roomData.mode === 'online') {
      this.setupChat();
    }

    // Host view - show all roles (for in-person mode)
    const hostPanel = document.getElementById('host-panel');
    if (Game.isHost && roomData.mode === 'inperson') {
      hostPanel.classList.remove('hidden');
      this.updateHostPanel(roomData);
    } else {
      hostPanel.classList.add('hidden');
    }
  },

  updateGameScreen(roomData) {
    document.getElementById('game-round').textContent = `Vòng ${roomData.round || 1}`;
    this.updateGamePlayerList(roomData);

    if (Game.isHost && roomData.mode === 'inperson') {
      this.updateHostPanel(roomData);
    }
  },

  updateGamePlayerList(roomData) {
    const container = document.getElementById('game-players-list');
    const players = roomData.players || {};

    container.innerHTML = '';
    Object.entries(players).forEach(([id, player]) => {
      const div = document.createElement('div');
      div.className = `game-player-item ${player.eliminated ? 'eliminated' : ''}`;
      const isMe = id === Auth.currentUser?.uid;
      div.innerHTML = `
        <div class="player-avatar ${player.eliminated ? 'eliminated' : ''}">${player.name.charAt(0).toUpperCase()}</div>
        <span class="player-name">${player.name}${isMe ? ' (Bạn)' : ''}</span>
        ${player.eliminated ? '<span class="eliminated-badge">❌ Loại</span>' : ''}
      `;
      container.appendChild(div);
    });
  },

  updateHostPanel(roomData) {
    const panel = document.getElementById('host-roles-list');
    const players = roomData.players || {};

    panel.innerHTML = `<div class="host-keyword-display">
      <strong>Từ dân thường:</strong> ${roomData.keyword}<br>
      <strong>Từ gián điệp:</strong> ${roomData.spyKeyword || 'Không có'}
    </div>`;

    Object.entries(players).forEach(([id, player]) => {
      const div = document.createElement('div');
      const roleClass = player.role === 'spy' ? 'is-spy' : (player.role === 'whitehat' ? 'is-whitehat' : '');
      div.className = `host-player-role ${roleClass}`;

      let badgeText, badgeClass;
      if (player.role === 'spy') {
        badgeText = '🕵️ Spy';
        badgeClass = 'spy';
      } else if (player.role === 'whitehat') {
        badgeText = '🎩 Mũ trắng';
        badgeClass = 'whitehat';
      } else {
        badgeText = '👤 Dân';
        badgeClass = 'civilian';
      }

      div.innerHTML = `
        <span>${player.name}</span>
        <span class="role-badge ${badgeClass}">${badgeText}</span>
      `;
      panel.appendChild(div);
    });
  },

  toggleRoleReveal() {
    this.roleRevealed = !this.roleRevealed;
    const card = document.getElementById('role-card');
    card.classList.toggle('revealed', this.roleRevealed);
    
    const btn = document.getElementById('btn-reveal-role');
    btn.textContent = this.roleRevealed ? '🙈 Ẩn vai trò' : '👁️ Xem vai trò';
  },

  // ================================
  // CHAT (Online mode)
  // ================================

  setupChat() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    Game.listenToMessages((msg) => {
      const div = document.createElement('div');
      const isMe = msg.userId === Auth.currentUser?.uid;
      div.className = `chat-message ${isMe ? 'mine' : ''}`;
      div.innerHTML = `
        <span class="chat-name">${msg.name}</span>
        <span class="chat-text">${this.escapeHtml(msg.text)}</span>
      `;
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  },

  async handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    await Game.sendMessage(text);
  },

  // ================================
  // VOTING
  // ================================

  async handleStartVoting() {
    await Game.startVoting();
    // Auto-vote for bots after a short delay
    setTimeout(() => Game.autoBotVote(), 1500);
  },

  enterVotingScreen(roomData) {
    this.showScreen('screen-voting');

    const user = Auth.currentUser;
    const myPlayer = roomData.players[user.uid];

    if (myPlayer.eliminated) {
      document.getElementById('voting-content').innerHTML = `
        <div class="eliminated-notice">
          <div class="eliminated-icon">💀</div>
          <p>Bạn đã bị loại và không thể vote</p>
          <p class="sub">Chờ kết quả...</p>
        </div>
      `;
      return;
    }

    if (myPlayer.voted) {
      document.getElementById('voting-content').innerHTML = `
        <div class="voted-notice">
          <div class="voted-icon">✅</div>
          <p>Bạn đã vote rồi!</p>
          <p class="sub">Chờ mọi người vote...</p>
        </div>
      `;
      return;
    }

    const container = document.getElementById('voting-content');
    container.innerHTML = '<h3 class="voting-title">🗳️ Chọn người bạn nghi là Gián Điệp</h3><div class="vote-grid"></div>';
    const grid = container.querySelector('.vote-grid');

    Object.entries(roomData.players).forEach(([id, player]) => {
      if (id === user.uid || player.eliminated) return;

      const btn = document.createElement('button');
      btn.className = 'vote-btn glass-card';
      btn.innerHTML = `
        <div class="vote-avatar">${player.name.charAt(0).toUpperCase()}</div>
        <span class="vote-name">${player.name}</span>
      `;
      btn.addEventListener('click', () => this.confirmVote(id, player.name));
      grid.appendChild(btn);
    });
  },

  async confirmVote(targetId, targetName) {
    if (confirm(`Bạn muốn vote loại ${targetName}?`)) {
      await Game.submitVote(targetId);
      document.getElementById('voting-content').innerHTML = `
        <div class="voted-notice">
          <div class="voted-icon">✅</div>
          <p>Đã vote loại <strong>${targetName}</strong></p>
          <p class="sub">Chờ mọi người vote...</p>
        </div>
      `;
    }
  },

  // ================================
  // RESULTS
  // ================================

  showVoteResults(roomData) {
    this.showScreen('screen-reveal');
    
    const eliminatedId = roomData.lastEliminated;
    const player = roomData.players[eliminatedId];
    const voteCounts = roomData.lastVoteCounts || {};

    const container = document.getElementById('reveal-content');
    let roleLabel, roleClass;
    if (player.role === 'spy') {
      roleLabel = '🕵️ LÀ GIÁN ĐIỆP!';
      roleClass = 'is-spy';
    } else if (player.role === 'whitehat') {
      roleLabel = '🎩 Là Mũ Trắng';
      roleClass = 'is-whitehat';
    } else {
      roleLabel = '👤 Là Dân Thường';
      roleClass = 'is-civilian';
    }

    container.innerHTML = `
      <div class="reveal-card ${roleClass}">
        <div class="reveal-avatar">${player.name.charAt(0).toUpperCase()}</div>
        <h2 class="reveal-name">${player.name}</h2>
        <div class="reveal-role">${roleLabel}</div>
        <div class="reveal-votes">Số phiếu: ${voteCounts[eliminatedId] || 0}</div>
      </div>
    `;

    // Show continue button for host
    document.getElementById('btn-continue-game').classList.toggle('hidden', !Game.isHost);
  },

  showFinalResults(roomData) {
    this.showScreen('screen-results');

    const winner = roomData.winner;
    const spyIds = roomData.spies || [];
    const players = roomData.players || {};

    const container = document.getElementById('results-content');
    let html = `
      <div class="results-winner ${winner === 'spy' ? 'spy-win' : 'civilian-win'}">
        <div class="winner-icon">${winner === 'spy' ? '🕵️' : '🎉'}</div>
        <h2>${winner === 'spy' ? 'GIÁN ĐIỆP THẮNG!' : 'DÂN THƯỜNG THẮNG!'}</h2>
        <p class="winner-sub">${winner === 'spy' ? 'Gián điệp đã thoát thành công!' : 'Tất cả gián điệp đã bị phát hiện!'}</p>
      </div>
      <div class="results-keyword">
        <span>Từ khóa dân thường:</span> <strong>${roomData.keyword}</strong><br>
        <span>Từ khóa gián điệp:</span> <strong>${roomData.spyKeyword || 'Không có'}</strong>
      </div>
      <div class="results-players">
        <h3>Vai trò của mọi người</h3>
    `;

    Object.entries(players).forEach(([id, player]) => {
      const isSpy = spyIds.includes(id);
      const whiteHatIds = roomData.whiteHats || [];
      const isWhiteHat = whiteHatIds.includes(id);

      let badgeText, badgeClass;
      if (isSpy) {
        badgeText = '🕵️ Gián điệp';
        badgeClass = 'spy';
      } else if (isWhiteHat) {
        badgeText = '🎩 Mũ trắng';
        badgeClass = 'whitehat';
      } else {
        badgeText = '👤 Dân thường';
        badgeClass = 'civilian';
      }

      const resultClass = isSpy ? 'is-spy' : (isWhiteHat ? 'is-whitehat' : '');

      html += `
        <div class="result-player ${resultClass}">
          <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
          <span class="player-name">${player.name}</span>
          <span class="role-badge ${badgeClass}">${badgeText}</span>
          ${player.eliminated ? '<span class="eliminated-badge">❌</span>' : ''}
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;

    document.getElementById('btn-play-again').classList.toggle('hidden', !Game.isHost);
  },

  async handleContinueGame() {
    await Game.continueGame();
  },

  async handlePlayAgain() {
    await Game.resetGame();
  },

  handleBackHome() {
    Game.removeAllListeners();
    Game.currentRoom = null;
    Game.isHost = false;
    this.showScreen('screen-home');
  },

  // ================================
  // UTILITIES
  // ================================

  copyRoomCode() {
    const code = document.getElementById('room-code-display').textContent;
    navigator.clipboard.writeText(code).then(() => {
      this.showToast('Đã copy mã phòng!', 'success');
    }).catch(() => {
      // Fallback
      const input = document.createElement('input');
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      this.showToast('Đã copy mã phòng!', 'success');
    });
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // ================================
  // MICROPHONE (Speech-to-Text)
  // ================================

  toggleMic() {
    if (this.isListening) {
      this.stopMic();
      return;
    }

    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.showToast('Trình duyệt không hỗ trợ giọng nói. Hãy dùng Chrome.', 'warning');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'vi-VN';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    const micBtn = document.getElementById('btn-mic');
    const micStatus = document.getElementById('mic-status');
    const chatInput = document.getElementById('chat-input');

    this.recognition.onstart = () => {
      this.isListening = true;
      micBtn.classList.add('mic-active');
      micBtn.innerHTML = '🔴';
      micStatus.classList.remove('hidden');
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      chatInput.value = finalTranscript || interimTranscript;
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        this.showToast('Vui lòng cho phép truy cập microphone', 'error');
      }
      this.stopMic();
    };

    this.recognition.onend = () => {
      this.isListening = false;
      micBtn.classList.remove('mic-active');
      micBtn.innerHTML = '🎤';
      micStatus.classList.add('hidden');

      // Auto-send if there's text
      if (chatInput.value.trim()) {
        Game.sendMessage(chatInput.value.trim());
        chatInput.value = '';
      }
    };

    this.recognition.start();
  },

  stopMic() {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    this.isListening = false;
    const micBtn = document.getElementById('btn-mic');
    if (micBtn) {
      micBtn.classList.remove('mic-active');
      micBtn.innerHTML = '🎤';
    }
    const micStatus = document.getElementById('mic-status');
    if (micStatus) micStatus.classList.add('hidden');
  }
};

// ================================
// INITIALIZE APP
// ================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

console.log('✅ App controller loaded');
