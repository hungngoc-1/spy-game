// ========================================
// Main App Controller - Spy Game (Session 2)
// Full rewrite with circular UI, STT sync, phases
// ========================================

const App = {
  currentScreen: null,
  selectedMode: null,
  recognition: null,
  isListening: false,
  speakerTimerInterval: null,
  discussionTimerInterval: null,
  guessTimerInterval: null,
  selectedVoteTarget: null, // { id, name }
  pendingVoteTarget: null,

  // ================================
  // INIT
  // ================================

  init() {
    Auth.onAuthStateChanged(user => {
      document.getElementById('screen-loading').classList.add('hidden');
      if (user) {
        document.getElementById('user-display-name').textContent = user.name;
        const av = document.getElementById('user-avatar');
        if (av) av.textContent = user.name.charAt(0).toUpperCase();
        this.showScreen('screen-home');
      } else {
        this.showScreen('screen-auth');
      }
    });
    this.bindEvents();
    Voice.init();
    setTimeout(() => {
      const s = document.getElementById('loading-status');
      if (s) s.textContent = 'Đang kết nối Firebase...';
    }, 400);
  },

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) { el.classList.add('active'); this.currentScreen = id; }
  },

  // ================================
  // EVENT BINDINGS
  // ================================

  bindEvents() {
    // Auth
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        const target = e.target.dataset.tab;
        document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
        document.getElementById('signup-form').classList.toggle('hidden', target !== 'signup');
        document.getElementById('auth-error').classList.add('hidden');
      });
    });
    document.getElementById('login-form').addEventListener('submit', e => this.handleLogin(e));
    document.getElementById('signup-form').addEventListener('submit', e => this.handleSignup(e));
    document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());

    // Home - 3 modes
    document.getElementById('mode-inperson').addEventListener('click', () => this.selectMode('inperson'));
    document.getElementById('mode-online').addEventListener('click', () => this.selectMode('online'));
    document.getElementById('mode-custom').addEventListener('click', () => this.selectMode('custom'));
    document.getElementById('btn-create-room').addEventListener('click', () => this.showScreen('screen-create'));
    document.getElementById('btn-join-room').addEventListener('click', () => this.showScreen('screen-join'));

    // Create Room
    document.getElementById('create-room-form').addEventListener('submit', e => this.handleCreateRoom(e));
    document.getElementById('btn-back-create').addEventListener('click', () => this.showScreen('screen-home'));

    // Join Room
    document.getElementById('join-room-form').addEventListener('submit', e => this.handleJoinRoom(e));
    document.getElementById('btn-back-join').addEventListener('click', () => this.showScreen('screen-home'));

    // Waiting Room
    document.getElementById('btn-leave-room').addEventListener('click', () => this.handleLeaveRoom());
    document.getElementById('btn-start-game').addEventListener('click', () => this.handleStartGame());
    document.getElementById('btn-copy-code').addEventListener('click', () => this.copyRoomCode());
    document.getElementById('btn-add-bot').addEventListener('click', () => Game.addBotPlayer().then(() => this.showToast('Đã thêm bot!', 'success')));
    document.getElementById('btn-add-3-bots').addEventListener('click', async () => {
      for (let i = 0; i < 3; i++) await Game.addBotPlayer();
      this.showToast('Đã thêm 3 bot!', 'success');
    });
    document.getElementById('btn-remove-bots').addEventListener('click', () => this.handleRemoveBots());

    // Set Keyword (custom mode)
    document.getElementById('set-keyword-form').addEventListener('submit', e => this.handleSetKeyword(e));
    document.getElementById('btn-back-keyword').addEventListener('click', () => this.showScreen('screen-waiting'));

    // Game Screen - Role Modal
    document.getElementById('btn-show-my-role').addEventListener('click', () => this.toggleRoleModal(true));
    document.getElementById('btn-close-role-modal').addEventListener('click', () => this.toggleRoleModal(false));
    document.getElementById('role-modal-overlay').addEventListener('click', () => this.toggleRoleModal(false));
    document.getElementById('btn-leave-game').addEventListener('click', () => this.handleLeaveRoom());

    // Speaking Controls
    document.getElementById('btn-mic-speak').addEventListener('click', () => this.startMic('speak'));
    document.getElementById('btn-stop-speak').addEventListener('click', () => this.stopMic());

    // Discussion Controls
    document.getElementById('btn-mic-discuss').addEventListener('click', () => this.startMic('discuss'));
    document.getElementById('btn-stop-discuss').addEventListener('click', () => this.stopMic());

    // Host Action Bar
    document.getElementById('btn-next-speaker').addEventListener('click', () => Game.nextSpeaker());
    document.getElementById('btn-start-vote').addEventListener('click', () => this.handleStartVoting());
    document.getElementById('btn-skip-vote').addEventListener('click', () => this.handleSkipVote());

    // Voting - Cancel step 2
    document.getElementById('btn-cancel-vote').addEventListener('click', () => this.resetVoteStep());

    // Voting - Quay lại xem bàn chơi (chứ không rời game)
    document.getElementById('btn-exit-vote').addEventListener('click', () => this.showScreen('screen-game'));
    document.getElementById('btn-exit-vote-elim').addEventListener('click', () => this.showScreen('screen-game'));

    // Voting - Host end voting and calculate results
    document.getElementById('btn-end-vote').addEventListener('click', () => this.handleEndVoting());

    // Accusation buttons
    document.querySelectorAll('.accusation-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const role = e.currentTarget.dataset.role;
        this.handleConfirmVote(role);
      });
    });

    // Guess Screen
    document.getElementById('guess-submit-btn')?.addEventListener('click', () => this.handleGuessSubmit());
    document.getElementById('guess-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.handleGuessSubmit();
    });

    // Reveal Screen
    document.getElementById('btn-continue-game').addEventListener('click', () => Game.continueGame());

    // Voice Chat
    document.getElementById('btn-voice-mute').addEventListener('click', () => this.toggleVoiceMute());

    // Results Screen
    document.getElementById('btn-play-again').addEventListener('click', () => Game.resetGame());
    document.getElementById('btn-back-home').addEventListener('click', () => this.handleBackHome());

    // Sliders
    [['setting-players', 'players-value'], ['setting-spies', 'spies-value'],
    ['setting-whitehats', 'whitehats-value'], ['setting-discussion', 'discussion-value']].forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', e => { document.getElementById(val).textContent = e.target.value; });
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (this.currentScreen === 'screen-create' || this.currentScreen === 'screen-join') {
          this.showScreen('screen-home');
        }
        if (document.getElementById('role-modal') && !document.getElementById('role-modal').classList.contains('hidden')) {
          this.toggleRoleModal(false);
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
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang đăng nhập...';
    const result = await Auth.login(email, password);
    btn.disabled = false; btn.textContent = 'Đăng nhập';
    if (!result.success) this.showAuthError(result.error);
  },

  async handleSignup(e) {
    e.preventDefault();
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang đăng ký...';
    const result = await Auth.signup(email, password, name);
    btn.disabled = false; btn.textContent = 'Đăng ký';
    if (!result.success) this.showAuthError(result.error);
  },

  async handleLogout() { await Auth.logout(); this.showScreen('screen-auth'); },

  showAuthError(message) {
    const el = document.getElementById('auth-error');
    el.textContent = message;
    el.classList.remove('hidden');
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
  },

  // ================================
  // MODE SELECTION
  // ================================

  selectMode(mode) {
    this.selectedMode = mode;
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('mode-' + mode).classList.add('selected');
    // Hide/show keyword mode setting for non-custom modes
    const kwSetting = document.getElementById('keyword-mode-setting');
    if (kwSetting) kwSetting.classList.toggle('hidden', mode === 'custom');
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
      keywordMode: document.getElementById('setting-keyword-mode')?.value || 'pair'
    };
    const btn = document.querySelector('#create-room-form button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang tạo...';
    const result = await Game.createRoom(settings);
    btn.disabled = false; btn.textContent = 'Tạo Phòng';
    if (result.success) this.enterWaitingRoom(result.code);
    else this.showToast(result.error, 'error');
  },

  async handleJoinRoom(e) {
    e.preventDefault();
    const code = document.getElementById('join-code').value;
    const btn = document.querySelector('#join-room-form button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang tham gia...';
    const result = await Game.joinRoom(code);
    btn.disabled = false; btn.textContent = 'Tham Gia';
    if (result.success) this.enterWaitingRoom(result.code);
    else this.showToast(result.error, 'error');
  },

  async handleLeaveRoom() {
    const msg = Game.isHost ? 'Rời phòng sẽ xóa phòng. Bạn chắc chứ?' : 'Bạn muốn rời phòng?';
    if (confirm(msg)) {
      this.stopMic();
      this.clearAllTimers();
      await Voice.leave();
      Game.removeAllListeners();
      await Game.leaveRoom();
      this.showScreen('screen-home');
    }
  },

  handleBackHome() {
    this.stopMic();
    this.clearAllTimers();
    Voice.leave();
    Game.removeAllListeners();
    Game.currentRoom = null;
    Game.isHost = false;
    this.showScreen('screen-home');
  },

  async handleRemoveBots() {
    if (!Game.isHost || !Game.currentRoom) return;
    try {
      const snap = await db.ref('rooms/' + Game.currentRoom + '/players').once('value');
      const players = snap.val() || {};
      const updates = {};
      let count = 0;
      Object.entries(players).forEach(([id, p]) => {
        if (p.isBot) {
          updates[`rooms/${Game.currentRoom}/players/${id}`] = null;
          count++;
        }
      });
      if (count > 0) {
        await db.ref().update(updates);
        this.showToast(`🗑️ Đã xóa ${count} bot`, 'success');
      } else {
        this.showToast('Không có bot nào', 'info');
      }
    } catch (err) {
      console.error('Remove bots error:', err);
      this.showToast('Lỗi xóa bot', 'error');
    }
  },

  clearAllTimers() {
    if (this.speakerTimerInterval) { clearInterval(this.speakerTimerInterval); this.speakerTimerInterval = null; }
    if (this.discussionTimerInterval) { clearInterval(this.discussionTimerInterval); this.discussionTimerInterval = null; }
    if (this.guessTimerInterval) { clearInterval(this.guessTimerInterval); this.guessTimerInterval = null; }
  },

  // ================================
  // VOICE CHAT
  // ================================

  async joinVoiceChat(channelName) {
    const uid = Auth.currentUser?.uid;
    if (!uid || !channelName) return;

    const statusEl = document.getElementById('voice-status');
    if (statusEl) statusEl.textContent = '🟡 Đang kết nối...';

    // Stop any old STT mic first to avoid conflicts
    this.stopMic();

    const result = await Voice.join(channelName, uid);
    if (result.success) {
      if (statusEl) statusEl.textContent = '🟢 Đã kết nối';
      this.updateVoiceUI(false);
      this.showToast('🎤 Voice chat đã bật!', 'success');
    } else {
      const errMsg = result.error || 'Lỗi không xác định';
      if (statusEl) statusEl.textContent = '🔴 ' + errMsg;
      this.showToast('⚠️ ' + errMsg, 'warning');
      console.error('Voice join failed:', errMsg);
    }
  },

  toggleVoiceMute() {
    const muted = Voice.toggleMute();
    this.updateVoiceUI(muted);
  },

  updateVoiceUI(muted) {
    const icon = document.getElementById('voice-icon');
    const label = document.getElementById('voice-label');
    const btn = document.getElementById('btn-voice-mute');
    if (icon) icon.textContent = muted ? '🔇' : '🎤';
    if (label) label.textContent = muted ? 'Mic Tắt' : 'Mic Bật';
    if (btn) btn.classList.toggle('voice-muted', muted);
  },

  // ================================
  // WAITING ROOM
  // ================================

  enterWaitingRoom(code) {
    document.getElementById('room-code-display').textContent = code;
    const startBtn = document.getElementById('btn-start-game');
    startBtn.classList.toggle('hidden', !Game.isHost);
    document.getElementById('test-controls').classList.toggle('hidden', !Game.isHost);
    this.showScreen('screen-waiting');

    Game.listenToRoom(roomData => {
      if (!roomData) { this.showToast('Phòng đã bị xóa', 'warning'); this.showScreen('screen-home'); return; }
      this.updateWaitingRoom(roomData);
      this.handleRoomStateChange(roomData);
    });
  },

  updateWaitingRoom(roomData) {
    const players = roomData.players || {};
    const count = Object.keys(players).length;
    document.getElementById('player-count').textContent = `${count} / ${roomData.settings.maxPlayers}`;
    document.getElementById('room-mode-display').textContent =
      roomData.mode === 'inperson' ? '🏠 Trực tiếp' : roomData.mode === 'custom' ? '🎭 Tự ra đề' : '🤖 Online AI';

    const list = document.getElementById('players-list');
    list.innerHTML = '';
    Object.entries(players).forEach(([id, player]) => {
      const isHost = id === roomData.host;
      const isMe = id === Auth.currentUser?.uid;
      const div = document.createElement('div');
      div.className = 'player-item glass-card';
      div.innerHTML = `
        <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
        <div class="player-info">
          <span class="player-name">${player.name}${isMe ? ' (Bạn)' : ''}</span>
          ${isHost ? '<span class="player-badge host-badge">👑 Quản trò</span>' : ''}
        </div>`;
      list.appendChild(div);
    });

    if (Game.isHost) {
      startBtn: {
        const btn = document.getElementById('btn-start-game');
        btn.classList.remove('hidden');
        btn.disabled = count < 3;
        btn.textContent = count < 3 ? `Cần ít nhất 3 người (${count}/3)` : '🎮 Bắt Đầu Game';
      }
    }
  },

  async handleStartGame() {
    const btn = document.getElementById('btn-start-game');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang khởi tạo...';

    // If custom mode, show keyword input screen
    const snap = await db.ref('rooms/' + Game.currentRoom).once('value');
    const room = snap.val();
    if (room.mode === 'custom') {
      btn.disabled = false; btn.textContent = '🎮 Bắt Đầu Game';
      this.showScreen('screen-set-keyword');
      return;
    }

    const result = await Game.startGame();
    btn.disabled = false; btn.textContent = '🎮 Bắt Đầu Game';
    if (!result.success) this.showToast(result.error, 'error');
  },

  // ================================
  // SET KEYWORD (custom mode)
  // ================================

  async handleSetKeyword(e) {
    e.preventDefault();
    const civilian = document.getElementById('kw-civilian').value.trim();
    const spy = document.getElementById('kw-spy').value.trim();
    const category = document.getElementById('kw-category').value.trim();

    if (!civilian) { this.showToast('Vui lòng nhập từ khóa dân thường!', 'warning'); return; }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang bắt đầu...';

    const result = await Game.startGame({ civilian, spy: spy || '???', category: category || 'Tùy chỉnh' });
    btn.disabled = false; btn.textContent = '▶️ Bắt Đầu Game';
    if (!result.success) this.showToast(result.error, 'error');
  },

  // ================================
  // ROOM STATE CHANGE HANDLER
  // ================================

  handleRoomStateChange(roomData) {
    const status = roomData.status;
    const phase = roomData.phase;
    const screen = this.currentScreen;

    if (status === 'playing' && screen === 'screen-game') {
      this.updateGameScreen(roomData);
      return;
    }

    if (status === 'playing' && screen !== 'screen-game') {
      this.enterGameScreen(roomData);
      return;
    }

    if (status === 'voting' && screen === 'screen-voting') {
      this.updateVotingProgress(roomData);
      return;
    }

    // Only auto-enter voting screen if NOT currently on screen-game (user may have pressed Back)
    if (status === 'voting' && screen !== 'screen-voting' && screen !== 'screen-game') {
      this.enterVotingScreen(roomData);
      return;
    }

    // If on screen-game during voting, show a floating vote indicator
    if (status === 'voting' && screen === 'screen-game') {
      this.updateVotingProgress(roomData);
      return;
    }

    if (status === 'guessing' && screen !== 'screen-guess') {
      this.enterGuessScreen(roomData);
      return;
    }

    if (status === 'revealing' && screen !== 'screen-reveal') {
      this.showVoteReveal(roomData);
      return;
    }

    if (status === 'finished' && screen !== 'screen-results') {
      this.showFinalResults(roomData);
      return;
    }

    if (status === 'waiting' && !['screen-waiting', 'screen-home', 'screen-auth'].includes(screen)) {
      this.clearAllTimers();
      this.stopMic();
      this.enterWaitingRoom(roomData.code);
      return;
    }

    // Update speech display from any game screen
    if (['screen-game', 'screen-guess'].includes(screen) && roomData.currentSpeech !== undefined) {
      this.updateSpeechDisplay(roomData.currentSpeech);
    }
  },

  // ================================
  // GAME SCREEN - CIRCULAR TABLE
  // ================================

  enterGameScreen(roomData) {
    this.clearAllTimers();
    this.showScreen('screen-game');
    this.myRole = null;
    this.myKeyword = null;

    const user = Auth.currentUser;
    const me = roomData.players?.[user.uid];
    if (me) {
      this.myRole = me.role;
      this.myKeyword = me.keyword;
    }

    // Join voice chat for online mode
    const isOnlineMode = roomData.mode === 'online';
    if (isOnlineMode && !Voice.isJoined) {
      this.joinVoiceChat(roomData.code || Game.currentRoom);
    }
    // Show/hide voice bar
    document.getElementById('voice-chat-bar')?.classList.toggle('hidden', !isOnlineMode);

    // Render game
    this.renderCircleTable(roomData);
    this.updatePhaseBadge(roomData);
    this.renderPhaseControls(roomData);
    this.updateSpeechDisplay(roomData.currentSpeech);

    document.getElementById('game-round').textContent = `Vòng ${roomData.round || 1}`;

    // Pre-populate role modal
    this.buildRoleModal(roomData);
  },

  updateGameScreen(roomData) {
    if (this.currentScreen !== 'screen-game') return;
    document.getElementById('game-round').textContent = `Vòng ${roomData.round || 1}`;
    this.renderCircleTable(roomData);
    this.updatePhaseBadge(roomData);
    this.renderPhaseControls(roomData);
    this.updateSpeechDisplay(roomData.currentSpeech);
    this.buildRoleModal(roomData);

    // Auto advance bot speakers (host only)
    if (Game.isHost && roomData.phase === 'speaking') {
      const order = roomData.speakingOrder || [];
      const idx = roomData.currentSpeakerIndex || 0;
      const uid = order[idx];
      const player = roomData.players?.[uid];
      if (player?.isBot) this.autoBotSpeak(roomData, uid, player);
    }
  },

  // Circular table renderer
  renderCircleTable(roomData) {
    const container = document.getElementById('circle-table');
    if (!container) return;

    const players = roomData.players || {};
    const speakingOrder = roomData.speakingOrder || [];
    const currentIdx = roomData.currentSpeakerIndex || 0;
    const currentSpeakerUid = speakingOrder[currentIdx];
    const myUid = Auth.currentUser?.uid;
    const isOnlineMode = roomData.mode === 'online';
    const hostCanSeeRoles = Game.isHost && !isOnlineMode;

    const allPlayers = Object.entries(players);
    if (!allPlayers.length) return;

    // In non-online modes, don't show host in the circle (they're observer)
    const displayPlayers = isOnlineMode
      ? allPlayers
      : allPlayers.filter(([id, p]) => p.role !== 'host');
    if (!displayPlayers.length) return;

    const size = container.offsetWidth || 300;
    const count = displayPlayers.length;
    const tokenDiam = Math.min(68, Math.max(46, (size * 0.35) / Math.max(1, count / 4)));
    const radius = size / 2 - tokenDiam / 2 - 6;
    const cx = size / 2, cy = size / 2;

    container.innerHTML = '';

    const roleIcons = { spy: '🕵️', whitehat: '🎩', civilian: '👤' };

    displayPlayers.forEach(([id, player], i) => {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      const isCurrentSpeaker = id === currentSpeakerUid && roomData.phase === 'speaking';
      const isMe = id === myUid;
      const speakerNum = isOnlineMode ? speakingOrder.indexOf(id) + 1 : 0;
      const nameShort = player.name.length > 9 ? player.name.substr(0, 8) + '…' : player.name;
      const isPlayerEliminated = player.eliminated && player.role !== 'host';

      // Role badge for host in offline modes
      let roleBadgeHtml = '';
      if (hostCanSeeRoles && player.role && player.role !== 'host' && !isPlayerEliminated) {
        const icon = roleIcons[player.role] || '👤';
        roleBadgeHtml = `<div class="token-role-badge token-role-${player.role}">${icon}</div>`;
      }

      const token = document.createElement('div');
      token.className = ['player-token',
        isCurrentSpeaker ? 'active-speaker' : '',
        isPlayerEliminated ? 'token-eliminated' : '',
        isMe ? 'token-me' : '',
        hostCanSeeRoles && player.role === 'spy' ? 'token-spy-host' : '',
        hostCanSeeRoles && player.role === 'whitehat' ? 'token-wh-host' : ''
      ].filter(Boolean).join(' ');
      token.style.cssText = `left:${x - tokenDiam / 2}px;top:${y - tokenDiam / 2}px;width:${tokenDiam}px;height:${tokenDiam}px;`;
      token.dataset.uid = id;

      token.innerHTML = `
        ${isCurrentSpeaker ? '<div class="speaker-ring-anim"></div>' : ''}
        <div class="token-avatar-letter">${player.name.charAt(0).toUpperCase()}</div>
        <div class="token-name-label">${nameShort}${isMe ? '★' : ''}</div>
        ${speakerNum > 0 ? `<div class="token-order-num">${speakerNum}</div>` : ''}
        ${roleBadgeHtml}
        ${isPlayerEliminated ? '<div class="token-x">✕</div>' : ''}
      `;
      container.appendChild(token);
    });
  },

  updatePhaseBadge(roomData) {
    const badge = document.getElementById('phase-badge');
    if (!badge) return;
    const phaseMap = {
      speaking: '🎤 Phát biểu',
      discussion: '💬 Thảo luận',
      voting: '🗳️ Bỏ phiếu',
      guessing: '🔍 Đoán từ',
      freeplay: '🎲 Đang chơi',
    };
    badge.textContent = phaseMap[roomData.phase] || '🎮 Đang chơi';
  },

  renderPhaseControls(roomData) {
    const user = Auth.currentUser;
    const phase = roomData.phase;
    const speakingOrder = roomData.speakingOrder || [];
    const currentIdx = roomData.currentSpeakerIndex || 0;
    const currentSpeakerUid = speakingOrder[currentIdx];
    const isMyTurn = currentSpeakerUid === user.uid;
    const isOnlineMode = roomData.mode === 'online';

    // Hide all
    ['speaking-controls', 'discussion-controls', 'host-action-bar'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });
    ['btn-next-speaker', 'btn-start-vote', 'btn-skip-vote'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });

    // ── FREEPLAY (in-person / custom modes) ──
    if (phase === 'freeplay') {
      // Show a simple status with vote button for host, no mic
      document.getElementById('speaking-controls')?.classList.remove('hidden');
      const statusEl = document.getElementById('speaker-status-text');
      if (statusEl) {
        statusEl.innerHTML = '🎲 <strong>Đang chơi tự do</strong> — Nói chuyện trực tiếp!';
        statusEl.style.color = 'var(--accent-1)';
      }
      // Hide timer and mic
      document.querySelector('.speaker-timer-wrap')?.classList.add('hidden');
      document.getElementById('btn-mic-speak')?.classList.add('hidden');
      document.getElementById('listening-indicator')?.classList.add('hidden');

      if (Game.isHost) {
        const bar = document.getElementById('host-action-bar');
        bar?.classList.remove('hidden');
        document.getElementById('btn-start-vote')?.classList.remove('hidden');
        document.getElementById('btn-skip-vote')?.classList.remove('hidden');
      }
      return;
    }

    // ── SPEAKING (online mode) ──
    if (phase === 'speaking') {
      document.getElementById('speaking-controls')?.classList.remove('hidden');
      document.querySelector('.speaker-timer-wrap')?.classList.remove('hidden');

      // Status text
      const statusEl = document.getElementById('speaker-status-text');
      if (statusEl) {
        if (isMyTurn) {
          statusEl.innerHTML = '🎤 <strong>Đến lượt bạn nói!</strong>';
          statusEl.style.color = 'var(--accent)';
        } else {
          const speakerName = roomData.players?.[currentSpeakerUid]?.name || '...';
          statusEl.textContent = `Chờ ${speakerName} phát biểu...`;
          statusEl.style.color = 'var(--text-muted)';
        }
      }

      // My turn mic button - ONLY show STT mic in non-online mode
      // In online mode, Agora handles voice - no STT needed
      const micBtn = document.getElementById('btn-mic-speak');
      if (micBtn) {
        if (isOnlineMode) {
          micBtn.classList.add('hidden');
          // Also hide listening indicator in online mode
          document.getElementById('listening-indicator')?.classList.add('hidden');
        } else {
          micBtn.classList.toggle('hidden', !isMyTurn || this.isListening);
        }
      }

      // Start speaker timer
      this.startSpeakerTimer(roomData);

      // Show "Next Speaker" button:
      // - Host can always skip
      // - Current speaker can skip their own turn
      if (Game.isHost || isMyTurn) {
        const bar = document.getElementById('host-action-bar');
        bar?.classList.remove('hidden');
        document.getElementById('btn-next-speaker')?.classList.remove('hidden');
      }

    } else if (phase === 'discussion') {
      document.getElementById('discussion-controls')?.classList.remove('hidden');
      this.startDiscussionTimer(roomData);

      const user = Auth.currentUser;
      const me = roomData.players?.[user.uid];
      const isEliminated = me?.eliminated;

      // Online AI: tất cả người chơi chưa bị loại đều có nút Vote
      // Chế độ khác: chỉ Host mới có
      const canVote = !isEliminated && (Game.isHost || isOnlineMode);
      if (canVote) {
        const bar = document.getElementById('host-action-bar');
        bar?.classList.remove('hidden');
        document.getElementById('btn-start-vote')?.classList.remove('hidden');
        if (Game.isHost) {
          document.getElementById('btn-skip-vote')?.classList.remove('hidden');
        }
      }
    }
  },

  // ================================
  // TIMERS
  // ================================

  startSpeakerTimer(roomData) {
    if (this.speakerTimerInterval) { clearInterval(this.speakerTimerInterval); this.speakerTimerInterval = null; }
    const DURATION = (roomData.settings?.speakTime || 30) * 1000;
    const startTime = roomData.speakerStartTime;
    if (!startTime) return;

    const user = Auth.currentUser;
    const speakingOrder = roomData.speakingOrder || [];
    const currentSpeakerUid = speakingOrder[roomData.currentSpeakerIndex || 0];

    this.speakerTimerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, DURATION - elapsed);
      const fraction = remaining / DURATION;

      const timerText = document.getElementById('timer-text');
      const timerFill = document.getElementById('timer-fill');
      if (timerText) timerText.textContent = this.formatTime(remaining);
      if (timerFill) timerFill.style.width = (fraction * 100) + '%';

      // Color warning
      if (timerFill) {
        if (fraction < 0.25) timerFill.style.background = 'linear-gradient(90deg, #ef4444, #f97316)';
        else timerFill.style.background = '';
      }

      if (remaining === 0) {
        clearInterval(this.speakerTimerInterval);
        this.speakerTimerInterval = null;
        // Stop mic if I was speaking
        if (currentSpeakerUid === user.uid && this.isListening) this.stopMic();
        // Host auto-advances
        if (Game.isHost) Game.nextSpeaker();
      }
    }, 100);
  },

  startDiscussionTimer(roomData) {
    if (this.discussionTimerInterval) { clearInterval(this.discussionTimerInterval); this.discussionTimerInterval = null; }
    const DURATION = (roomData.settings?.discussionTime || 120) * 1000;
    const startTime = roomData.discussionStartTime;
    if (!startTime) return;

    this.discussionTimerInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, DURATION - elapsed);
      const fraction = remaining / DURATION;

      const timerText = document.getElementById('discussion-timer-text');
      const timerFill = document.getElementById('disc-timer-fill');
      if (timerText) timerText.textContent = this.formatTime(remaining);
      if (timerFill) timerFill.style.width = (fraction * 100) + '%';

      if (remaining === 0) {
        clearInterval(this.discussionTimerInterval);
        this.discussionTimerInterval = null;
        if (this.isListening) this.stopMic();
        // Show vote button hint
        this.showToast('⏰ Hết thời gian thảo luận! Host bắt đầu vote.', 'warning');
      }
    }, 500);
  },

  startGuessTimer(deadline) {
    if (this.guessTimerInterval) { clearInterval(this.guessTimerInterval); this.guessTimerInterval = null; }
    const timerEl = document.getElementById('guess-timer-text');
    const fillEl = document.getElementById('guess-timer-fill');
    const DURATION = 31000;

    this.guessTimerInterval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      const fraction = remaining / DURATION;
      if (timerEl) timerEl.textContent = this.formatTime(remaining);
      if (fillEl) fillEl.style.width = (fraction * 100) + '%';

      if (remaining === 0) {
        clearInterval(this.guessTimerInterval);
        this.guessTimerInterval = null;

        const input = document.getElementById('guess-input');
        if (input) {
          // Trường hợp 1: Mình là người đang trực tiếp đoán
          if (!input.disabled) {
            this.showToast('⏰ Hết giờ! Đoán sai!', 'error');
            input.disabled = true;
            const btn = document.getElementById('guess-submit-btn');
            if (btn) btn.disabled = true;
            Game.submitGuess('__timeout__');
          }
        } else if (Game.isHost) {
          // Trường hợp 2: Người đoán là Bot (hoặc khán giả)
          Game.submitGuess('__timeout__');
        }
      }
    }, 200);
  },

  formatTime(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },

  // ================================
  // SPEECH DISPLAY (STT → Firebase sync)
  // ================================

  updateSpeechDisplay(speechData) {
    const speakerName = document.getElementById('speech-speaker-name');
    const speechText = document.getElementById('speech-text');
    const speechInterim = document.getElementById('speech-interim');
    const placeholder = document.getElementById('speech-placeholder');

    if (!speechData || !speechData.text) {
      if (speakerName) speakerName.textContent = '';
      if (speechText) speechText.textContent = '';
      if (speechInterim) speechInterim.textContent = '';
      if (placeholder) placeholder.classList.remove('hidden');
      return;
    }

    if (placeholder) placeholder.classList.add('hidden');
    if (speakerName) speakerName.textContent = speechData.speakerName + ':';
    if (speechData.isFinal) {
      if (speechText) speechText.textContent = speechData.text;
      if (speechInterim) speechInterim.textContent = '';
    } else {
      if (speechInterim) speechInterim.textContent = speechData.text;
    }
  },

  // ================================
  // MICROPHONE (STT)
  // ================================

  startMic(mode) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.showToast('Trình duyệt không hỗ trợ mic. Dùng Chrome!', 'warning');
      return;
    }
    if (this.isListening) { this.stopMic(); return; }

    const user = Auth.currentUser;
    this.recognition = new SR();
    this.recognition.lang = 'vi-VN';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onresult = async event => {
      let final = '', interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t; else interim += t;
      }
      const text = final || interim;
      const isFinal = !!final;
      await Game.sendSpeech(text, isFinal, user.uid, user.name);
    };

    this.recognition.onerror = event => {
      if (event.error !== 'aborted') this.showToast('Lỗi mic: ' + event.error, 'warning');
      this.stopMic();
    };

    this.recognition.onend = () => {
      if (this.isListening) {
        this.isListening = false;
        this.updateMicUI(false, mode);
      }
    };

    this.recognition.start();
    this.isListening = true;
    this.updateMicUI(true, mode);
  },

  stopMic() {
    if (this.recognition) { this.recognition.stop(); this.recognition = null; }
    this.isListening = false;
    this.updateMicUI(false, 'speak');
    this.updateMicUI(false, 'discuss');
  },

  updateMicUI(isListening, mode) {
    if (mode === 'speak') {
      document.getElementById('btn-mic-speak')?.classList.toggle('hidden', isListening);
      document.getElementById('listening-indicator')?.classList.toggle('hidden', !isListening);
    } else if (mode === 'discuss') {
      document.getElementById('btn-mic-discuss')?.classList.toggle('hidden', isListening);
      document.getElementById('discuss-listening-indicator')?.classList.toggle('hidden', !isListening);
    }
  },

  // Auto-speak for bots (host only)
  autoBotSpeak(roomData, botUid, botPlayer) {
    if (this._botSpeakScheduled) return;
    this._botSpeakScheduled = true;
    const phrases = ['Từ này quen quen...', 'Hmm, tôi biết từ này!', 'Có vẻ liên quan đến...', 'Tôi nghĩ đây là...', '...'];
    const phrase = phrases[Math.floor(Math.random() * phrases.length)];
    setTimeout(async () => {
      await Game.sendSpeech(phrase, true, botUid, botPlayer.name);
      this._botSpeakScheduled = false;
      setTimeout(async () => {
        const snap = await db.ref('rooms/' + Game.currentRoom + '/speakingOrder').once('value');
        const order = snap.val();
        if (order && (order[roomData.currentSpeakerIndex] === botUid)) {
          await Game.nextSpeaker();
        }
      }, 2000);
    }, 1500 + Math.random() * 1000);
  },

  // ================================
  // ROLE MODAL
  // ================================

  buildRoleModal(roomData) {
    const user = Auth.currentUser;
    const me = roomData.players?.[user.uid];
    if (!me) return;

    // Spy & WhiteHat do NOT know their role until voted out.
    // Everyone sees themselves as "Người Chơi" — only their keyword differs.
    const isOnlineMode = roomData.mode === 'online';
    const hideRole = isOnlineMode && (me.role === 'spy' || me.role === 'whitehat');

    let icon, title, cls, hint;
    if (me.role === 'host') {
      icon = '👑'; title = 'QUẢN TRÒ'; cls = 'civilian';
      hint = 'Bạn là người điều phối. Bạn biết hết vai trò!';
    } else if (hideRole) {
      // Spy/WhiteHat in online mode: look like a normal player
      icon = '👤'; title = 'NGƯỜI CHƠI'; cls = 'civilian';
      hint = 'Hãy thảo luận và tìm ra ai là kẻ lạ!';
    } else if (me.role === 'spy') {
      icon = '🕵️'; title = 'GIÁN ĐIỆP'; cls = 'spy';
      hint = 'Bạn KHÔNG biết từ khóa của dân. Hãy giả vờ biết!';
    } else if (me.role === 'whitehat') {
      icon = '🎩'; title = 'MŨ TRẮNG'; cls = 'whitehat';
      hint = 'Bạn không biết từ khóa. Nếu đoán đúng → thắng!';
    } else {
      icon = '👤'; title = 'DÂN THƯỜNG'; cls = 'civilian';
      hint = 'Tìm gián điệp và mũ trắng!';
    }

    const card = document.getElementById('role-modal-card');
    if (!card) return;
    card.className = `role-modal-card ${cls}-card`;
    card.innerHTML = `
      <div style="font-size:3rem">${icon}</div>
      <div class="role-title ${cls}" style="font-size:1.4rem;font-weight:900;margin:8px 0">${title}</div>
      <div class="role-keyword" style="font-size:1.1rem;margin:8px 0">
        ${me.keyword && me.keyword !== '???' ? `Từ khóa của bạn: <strong>${me.keyword}</strong>` : '❓ Bạn không biết từ khóa'}
      </div>
      <div class="role-category" style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">
        Chủ đề: ${roomData.category || '?'}
      </div>
      <div style="margin-top:12px;font-size:0.8rem;color:var(--text-muted);font-style:italic">${hint}</div>
    `;
  },

  toggleRoleModal(show) {
    const modal = document.getElementById('role-modal');
    if (!modal) return;
    modal.classList.toggle('hidden', !show);
  },

  // ================================
  // VOTING SCREEN
  // ================================

  async handleStartVoting() {
    await Game.startVoting();
    // Auto-enter voting screen for the user who clicked
    const snap = await db.ref('rooms/' + Game.currentRoom).once('value');
    this.enterVotingScreen(snap.val());
    setTimeout(() => Game.autoBotVote(), 1500);
  },

  async handleEndVoting() {
    if (!Game.isHost) return;
    const btn = document.getElementById('btn-end-vote');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang tính...' }
    await Game.calculateVoteResults();
  },

  async handleSkipVote() {
    this.showToast('⏩ Bỏ qua vote, sang vòng mới!', 'info');
    await Game.continueGame();
  },

  enterVotingScreen(roomData) {
    this.clearAllTimers();
    this.stopMic();
    this.showScreen('screen-voting');
    this.selectedVoteTarget = null;

    const user = Auth.currentUser;
    const me = roomData.players?.[user.uid];

    // Hide all vote states
    document.getElementById('vote-step-1').classList.add('hidden');
    document.getElementById('vote-step-2').classList.add('hidden');
    document.getElementById('vote-done').classList.add('hidden');
    document.getElementById('vote-eliminated-notice').classList.add('hidden');

    // Back button is always visible
    const backBtn = document.getElementById('btn-exit-vote');
    if (backBtn) backBtn.classList.remove('hidden');

    // Host observer (in non-online modes, role='host')
    if (me?.role === 'host') {
      document.getElementById('vote-eliminated-notice').classList.remove('hidden');
      document.querySelector('#vote-eliminated-notice .eliminated-icon').textContent = '👑';
      document.querySelector('#vote-eliminated-notice p').textContent = 'Bạn là quản trò — đang chờ mọi người vote...';
      document.querySelector('#vote-eliminated-notice .sub').textContent = '';
      this.updateVotingProgress(roomData);
      return;
    }

    if (me?.eliminated) {
      document.getElementById('vote-eliminated-notice').classList.remove('hidden');
      this.updateVotingProgress(roomData);
      return;
    }

    // If already voted — show done state (preserve vote, no re-vote)
    if (me?.voted) {
      const roleLabels = { spy: '🕵️ Gián điệp', whitehat: '🎩 Mũ trắng', civilian: '👤 Dân thường' };
      const targetName = roomData.players?.[me.vote?.targetId]?.name || '...';
      const roleLabel = roleLabels[me.vote?.accusedRole] || '?';
      this.showVoteDone(me.vote, roomData, targetName, roleLabel);
      this.updateVotingProgress(roomData);
      return;
    }

    // Step 1: show player list
    this.renderVoteStep1(roomData);
    this.updateVotingProgress(roomData);
  },

  renderVoteStep1(roomData) {
    document.getElementById('vote-step-1').classList.remove('hidden');
    document.getElementById('vote-step-2').classList.add('hidden');
    document.getElementById('vote-done').classList.add('hidden');

    const user = Auth.currentUser;
    const grid = document.getElementById('vote-grid');
    grid.innerHTML = '';
    Object.entries(roomData.players).forEach(([id, player]) => {
      if (id === user.uid || player.eliminated) return;
      const btn = document.createElement('button');
      btn.className = 'vote-btn glass-card';
      btn.innerHTML = `
        <div class="vote-avatar">${player.name.charAt(0).toUpperCase()}</div>
        <span class="vote-name">${player.name}</span>
      `;
      btn.addEventListener('click', () => {
        this.selectedVoteTarget = { id, name: player.name };
        this.showVoteStep2(player.name);
      });
      grid.appendChild(btn);
    });
  },

  showVoteStep2(targetName) {
    document.getElementById('vote-step-1').classList.add('hidden');
    document.getElementById('vote-step-2').classList.remove('hidden');
    document.getElementById('accused-name').textContent = targetName;
  },

  resetVoteStep() {
    this.selectedVoteTarget = null;
    document.getElementById('vote-step-2').classList.add('hidden');
    document.getElementById('vote-step-1').classList.remove('hidden');
  },

  async handleConfirmVote(accusedRole) {
    if (!this.selectedVoteTarget) return;
    const { id, name } = this.selectedVoteTarget;
    await Game.submitVote(id, accusedRole);
    const roleLabels = { spy: '🕵️ Gián điệp', whitehat: '🎩 Mũ trắng', civilian: '👤 Dân thường' };
    document.getElementById('vote-step-2').classList.add('hidden');
    this.showVoteDone({ targetId: id, accusedRole }, null, name, roleLabels[accusedRole]);

    // Refresh progress after voting
    const snap = await db.ref('rooms/' + Game.currentRoom + '/players').once('value');
    const players = snap.val() || {};
    this.updateVotingProgress({ players });
  },

  showVoteDone(vote, roomData, targetName, roleLabel) {
    document.getElementById('vote-step-1').classList.add('hidden');
    document.getElementById('vote-step-2').classList.add('hidden');
    document.getElementById('vote-done').classList.remove('hidden');
    const doneText = document.getElementById('vote-done-text');
    if (doneText) doneText.innerHTML = targetName
      ? `Đã tố <strong>${targetName}</strong> là <strong>${roleLabel}</strong>`
      : 'Đã bỏ phiếu!';
  },

  updateVotingProgress(roomData) {
    const players = roomData.players || {};
    const active = Object.entries(players).filter(([, p]) => !p.eliminated);
    const realActive = active.filter(([, p]) => !p.isBot);
    const voted = active.filter(([, p]) => p.voted).length;
    const prog = document.getElementById('vote-progress');
    if (prog) prog.textContent = `${voted}/${active.length} người đã vote`;

    const uid = Auth.currentUser?.uid;
    // Nếu là chế độ Online, chọn người chơi thật đầu tiên trong map active làm "người đại diện" tính vote
    const isOnlineDelegate = roomData.mode === 'online' && realActive.length > 0 && realActive[0][0] === uid;
    const canEndVote = Game.isHost || isOnlineDelegate;

    // Show end-vote button for host/delegate (on voting screen only)
    const endBtn = document.getElementById('btn-end-vote');
    if (endBtn) {
      if (canEndVote && this.currentScreen === 'screen-voting') {
        endBtn.classList.remove('hidden');
        endBtn.disabled = voted === 0;
        endBtn.textContent = `⚖️ Tính kết quả vote (${voted} phiếu)`;
        
        // Auto trigger if everyone voted
        if (voted === active.length && active.length > 0 && !this._isCalculatingVotes) {
          this._isCalculatingVotes = true;
          this.showToast('Tất cả đã vote! Đang tính kết quả...', 'info');
          setTimeout(() => {
            Game.calculateVoteResults().finally(() => this._isCalculatingVotes = false);
          }, 2000);
        }
      } else {
        endBtn.classList.add('hidden');
      }
    }
  },

  // ================================
  // GUESS SCREEN
  // ================================

  enterGuessScreen(roomData) {
    this.clearAllTimers();
    this.showScreen('screen-guess');

    const user = Auth.currentUser;
    const pending = roomData.pendingElimination;
    if (!pending) return;

    const isGuesser = pending.playerId === user.uid;
    const card = document.getElementById('guess-card');

    const roleLabels = { spy: '🕵️ Gián điệp', whitehat: '🎩 Mũ trắng' };
    const roleLabel = roleLabels[pending.trueRole] || pending.trueRole;
    const guesserName = roomData.players?.[pending.playerId]?.name || '...';

    if (isGuesser) {
      // I am the one who needs to guess
      card.innerHTML = `
        <div class="guess-reveal-icon">${pending.trueRole === 'spy' ? '🕵️' : '🎩'}</div>
        <h2 class="guess-title">Bạn bị phát hiện là <span style="color:${pending.trueRole === 'spy' ? '#ef4444' : '#f59e0b'}">${roleLabel}</span>!</h2>
        <p class="guess-subtitle">Đoán từ khóa của Dân thường để chiến thắng!</p>
        <div class="guess-hint">Chủ đề: <strong>${roomData.category || '?'}</strong></div>
        <div class="guess-timer-wrap">
          <div class="guess-timer-bar"><div class="guess-timer-fill" id="guess-timer-fill" style="width:100%"></div></div>
          <span class="guess-timer-text" id="guess-timer-text">0:31</span>
        </div>
        <div class="guess-input-wrap">
          <input type="text" id="guess-input" class="guess-input-field" placeholder="Nhập từ khóa..." autocomplete="off" maxlength="50" autofocus>
          <button id="guess-submit-btn" class="btn btn-primary btn-lg" style="margin-top:12px;width:100%">✅ Xác nhận đoán</button>
        </div>
      `;
      // Re-bind events (new DOM)
      document.getElementById('guess-submit-btn').addEventListener('click', () => this.handleGuessSubmit());
      document.getElementById('guess-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') this.handleGuessSubmit();
      });
      // Start timer
      this.startGuessTimer(pending.guessDeadline);
    } else {
      // Spectating
      card.innerHTML = `
        <div class="guess-reveal-icon">🔍</div>
        <h2 class="guess-title">${guesserName} đang đoán từ...</h2>
        <p class="guess-subtitle">
          <span class="${pending.trueRole === 'spy' ? 'spy' : 'whitehat'}">${roleLabel}</span>
          có 30 giây để đoán từ khóa của Dân thường.
          Nếu đoán đúng — họ thắng!
        </p>
        <div class="guess-waiting-spinner"><div class="spinner"></div></div>
        <div class="guess-timer-wrap">
          <div class="guess-timer-bar"><div class="guess-timer-fill" id="guess-timer-fill" style="width:100%"></div></div>
          <span class="guess-timer-text" id="guess-timer-text">0:31</span>
        </div>
      `;
      this.startGuessTimer(pending.guessDeadline);
    }
  },

  async handleGuessSubmit() {
    const input = document.getElementById('guess-input');
    const btn = document.getElementById('guess-submit-btn');
    if (!input || !btn) return;
    const word = input.value.trim();
    if (!word) { this.showToast('Nhập từ khóa đi!', 'warning'); return; }
    input.disabled = true; btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Đang kiểm tra...';
    this.clearAllTimers();

    // Ẩn luôn khu vực nhập từ đi để ra hiệu đã gửi
    document.querySelector('.guess-input-wrap')?.classList.add('hidden');

    await Game.submitGuess(word);
  },

  // ================================
  // REVEAL SCREEN
  // ================================

  showVoteReveal(roomData) {
    this.clearAllTimers();
    this.showScreen('screen-reveal');

    const eliminatedId = roomData.lastEliminated;
    const player = roomData.players?.[eliminatedId];
    if (!player) return;

    const trueRole = roomData.lastTrueRole || player.role;
    const accusedRole = roomData.lastAccusedRole || 'civilian';
    const guessCorrect = roomData.lastGuessCorrect;
    const lastGuess = roomData.lastGuess;

    const roleInfo = {
      spy: { icon: '🕵️', label: 'GIÁN ĐIỆP', cls: 'is-spy' },
      whitehat: { icon: '🎩', label: 'MŨ TRẮNG', cls: 'is-whitehat' },
      civilian: { icon: '👤', label: 'DÂN THƯỜNG', cls: 'is-civilian' }
    };
    const info = roleInfo[trueRole] || roleInfo.civilian;
    const voteCounts = roomData.lastVoteCounts || {};

    let guessMsg = '';
    if (lastGuess !== undefined && lastGuess !== null) {
      guessMsg = guessCorrect
        ? `<div class="reveal-guess correct">✅ Đoán đúng: "${lastGuess}"</div>`
        : `<div class="reveal-guess wrong">❌ Đoán sai: "${lastGuess}"</div>`;
    }

    document.getElementById('reveal-content').innerHTML = `
      <div class="reveal-card ${info.cls}">
        <div class="reveal-avatar">${player.name.charAt(0).toUpperCase()}</div>
        <h2 class="reveal-name">${player.name}</h2>
        <div class="reveal-role">${info.icon} ${info.label}</div>
        <div class="reveal-votes">Nhận ${voteCounts[eliminatedId] || 0} phiếu</div>
        ${guessMsg}
      </div>
    `;

    document.getElementById('btn-continue-game').classList.toggle('hidden', !Game.isHost);
    // Show waiting hint for non-host
    let waitHint = document.getElementById('reveal-wait-hint');
    if (!waitHint) {
      waitHint = document.createElement('p');
      waitHint.id = 'reveal-wait-hint';
      waitHint.style.cssText = 'text-align:center;font-size:0.82rem;color:var(--text-muted);margin-top:12px;';
      document.getElementById('btn-continue-game').parentNode.appendChild(waitHint);
    }
    waitHint.textContent = Game.isHost ? '' : '⏳ Chờ quản trò tiếp tục...';
    waitHint.classList.toggle('hidden', Game.isHost);
  },

  // ================================
  // FINAL RESULTS
  // ================================

  showFinalResults(roomData) {
    this.clearAllTimers();
    this.stopMic();
    this.showScreen('screen-results');

    const winner = roomData.winner;
    const reason = roomData.winReason;
    const players = roomData.players || {};
    const spyIds = roomData.spies || [];
    const whiteHatIds = roomData.whiteHats || [];

    const winnerInfo = {
      civilian: { icon: '🎉', title: 'DÂN THƯỜNG THẮNG!', sub: 'Tất cả gián điệp và mũ trắng đã bị phát hiện!', cls: 'civilian-win' },
      spy: { icon: '🕵️', title: 'GIÁN ĐIỆP THẮNG!', sub: reason === 'misidentified' ? 'Gián điệp bị khai báo sai vai trò!' : reason === 'correct_guess' ? 'Gián điệp đoán đúng từ khóa!' : 'Gián điệp áp đảo dân thường!', cls: 'spy-win' },
      whitehat: { icon: '🎩', title: 'MŨ TRẮNG THẮNG!', sub: reason === 'misidentified' ? 'Mũ trắng bị khai báo sai vai trò!' : 'Mũ trắng đoán đúng từ khóa!', cls: 'civilian-win' }
    };
    const wInfo = winnerInfo[winner] || winnerInfo.civilian;

    let html = `
      <div class="results-winner ${wInfo.cls}">
        <div class="winner-icon">${wInfo.icon}</div>
        <h2>${wInfo.title}</h2>
        <p class="winner-sub">${wInfo.sub}</p>
      </div>
      <div class="results-keyword">
        <span>Từ dân thường:</span> <strong>${roomData.keyword}</strong><br>
        <span>Từ gián điệp:</span> <strong>${roomData.spyKeyword || 'Không có'}</strong>
      </div>
      <div class="results-players"><h3>Vai trò của mọi người</h3>`;

    Object.entries(players).forEach(([id, player]) => {
      const isSpy = spyIds.includes(id);
      const isWH = whiteHatIds.includes(id);
      let badge, cls;
      if (isSpy) { badge = '🕵️ Gián điệp'; cls = 'spy'; }
      else if (isWH) { badge = '🎩 Mũ trắng'; cls = 'whitehat'; }
      else { badge = '👤 Dân thường'; cls = 'civilian'; }
      html += `
        <div class="result-player ${isSpy ? 'is-spy' : isWH ? 'is-whitehat' : ''}">
          <div class="player-avatar">${player.name.charAt(0).toUpperCase()}</div>
          <span class="player-name">${player.name}</span>
          <span class="role-badge ${cls}">${badge}</span>
          ${player.eliminated ? '<span class="eliminated-badge">❌</span>' : ''}
        </div>`;
    });
    html += '</div>';
    document.getElementById('results-content').innerHTML = html;
    document.getElementById('btn-play-again').classList.toggle('hidden', !Game.isHost);
  },

  // ================================
  // UTILITIES
  // ================================

  copyRoomCode() {
    const code = document.getElementById('room-code-display').textContent;
    navigator.clipboard.writeText(code)
      .then(() => this.showToast('Đã copy mã phòng!', 'success'))
      .catch(() => {
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input); input.select(); document.execCommand('copy');
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
    setTimeout(() => { toast.classList.add('toast-exit'); setTimeout(() => toast.remove(), 300); }, 3500);
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// ================================
// INITIALIZE APP
// ================================
document.addEventListener('DOMContentLoaded', () => { App.init(); });
console.log('✅ App controller loaded (v2 - circular table & phases)');