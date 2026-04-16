// ========================================
// Game Logic Module - Spy Game (Session 2)
// Full rewrite with new phases & vote logic
// ========================================

const Game = {
  currentRoom: null,
  isHost: false,
  listeners: [],
  speakerTimerInterval: null,
  discussionTimerInterval: null,

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  },

  // ================================
  // Room Management
  // ================================

  async createRoom(settings) {
    try {
      const code = this.generateRoomCode();
      const user = Auth.currentUser;
      const roomData = {
        code,
        host: user.uid,
        hostName: user.name,
        mode: settings.mode,
        status: 'waiting',
        settings: {
          maxPlayers: settings.maxPlayers || 10,
          numSpies: settings.numSpies || 1,
          numWhiteHats: settings.numWhiteHats || 0,
          discussionTime: settings.discussionTime || 120,
          speakTime: 30,
          keywordMode: settings.keywordMode || 'pair'
        },
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {}
      };
      roomData.players[user.uid] = {
        name: user.name,
        role: null,
        keyword: null,
        voted: false,
        vote: null,
        eliminated: false,
        isReady: true,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      };
      await db.ref('rooms/' + code).set(roomData);
      this.currentRoom = code;
      this.isHost = true;
      return { success: true, code };
    } catch (err) {
      console.error('createRoom error:', err);
      return { success: false, error: 'Không thể tạo phòng. Thử lại.' };
    }
  },

  async joinRoom(code) {
    try {
      code = code.toUpperCase().trim();
      const snap = await db.ref('rooms/' + code).once('value');
      const room = snap.val();
      if (!room) return { success: false, error: 'Không tìm thấy phòng này' };
      const user = Auth.currentUser;

      // 1. Nếu người chơi đã có trong phòng -> Reconnect
      if (room.players && room.players[user.uid]) {
        this.currentRoom = code;
        this.isHost = room.host === user.uid;
        return { success: true, code, isRejoin: true };
      }

      // 2. Kiểm tra số lượng
      const playerCount = room.players ? Object.keys(room.players).length : 0;
      if (playerCount >= room.settings.maxPlayers) return { success: false, error: 'Phòng đã đầy' };

      // 3. Nếu phòng đang chơi -> Tham gia như một Khán giả
      if (room.status !== 'waiting') {
        await db.ref('rooms/' + code + '/players/' + user.uid).set({
          name: user.name,
          role: 'spectator',
          keyword: 'Tôi là khán giả',
          voted: true,      // Không cần vote
          vote: null,
          eliminated: true, // Xử lý như đã loại khỏi bàn
          isReady: true,
          isSpectator: true,
          joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        this.currentRoom = code;
        this.isHost = false;
        return { success: true, code, isSpectator: true };
      }

      // 4. Tham gia bình thường khi phòng chưa chơi
      await db.ref('rooms/' + code + '/players/' + user.uid).set({
        name: user.name,
        role: null,
        keyword: null,
        voted: false,
        vote: null,
        eliminated: false,
        isReady: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });
      this.currentRoom = code;
      this.isHost = room.host === user.uid;
      return { success: true, code };
    } catch (err) {
      console.error('joinRoom error:', err);
      return { success: false, error: 'Không thể tham gia phòng' };
    }
  },

  async leaveRoom() {
    if (!this.currentRoom) return;
    try {
      const user = Auth.currentUser;
      if (!user) return;
      this.removeAllListeners();
      this.clearTimers();
      if (this.isHost) {
        await db.ref('rooms/' + this.currentRoom).remove();
      } else {
        await db.ref('rooms/' + this.currentRoom + '/players/' + user.uid).remove();
      }
      this.currentRoom = null;
      this.isHost = false;
    } catch (err) {
      console.error('leaveRoom error:', err);
    }
  },

  clearTimers() {
    if (this.speakerTimerInterval) { clearInterval(this.speakerTimerInterval); this.speakerTimerInterval = null; }
    if (this.discussionTimerInterval) { clearInterval(this.discussionTimerInterval); this.discussionTimerInterval = null; }
  },

  // ================================
  // Game Start
  // ================================

  async startGame(customKeywords = null) {
    if (!this.isHost || !this.currentRoom) return { success: false };
    try {
      const snap = await db.ref('rooms/' + this.currentRoom).once('value');
      const room = snap.val();
      const players = room.players;
      const allPlayerIds = Object.keys(players);
      const isOnlineMode = room.mode === 'online';

      // In non-online modes, host is observer (not a participant)
      const participantIds = isOnlineMode
        ? allPlayerIds
        : allPlayerIds.filter(id => id !== room.host);
      const numParticipants = participantIds.length;

      if (numParticipants < 3) return { success: false, error: `Cần ít nhất 3 người chơi${isOnlineMode ? '' : ' (không tính quản trò)'}` };

      const numSpies = Math.min(room.settings.numSpies, Math.floor(numParticipants / 3));
      const numWhiteHats = Math.min(room.settings.numWhiteHats || 0, Math.floor((numParticipants - numSpies) / 3));

      // Get keywords
      let keywordData;
      if (room.mode === 'custom' && customKeywords) {
        keywordData = {
          civilian: customKeywords.civilian.trim(),
          spy: customKeywords.spy?.trim() || '???',
          category: customKeywords.category?.trim() || 'Tùy chỉnh'
        };
      } else if (room.settings.keywordMode === 'pair') {
        keywordData = await generateKeywordPair();
      } else {
        const single = await generateSingleKeyword();
        keywordData = { civilian: single.keyword, spy: '???', category: single.category };
      }

      // Shuffle PARTICIPANTS only and assign roles
      const shuffled = [...participantIds].sort(() => Math.random() - 0.5);
      const spyIds = shuffled.slice(0, numSpies);
      const whiteHatIds = shuffled.slice(numSpies, numSpies + numWhiteHats);

      // Speaking order: participants only
      const speakingOrder = [...participantIds].sort(() => Math.random() - 0.5);

      const updates = {};

      // Assign roles to participants
      participantIds.forEach(id => {
        const isSpy = spyIds.includes(id);
        const isWhiteHat = whiteHatIds.includes(id);
        let role, keyword;
        if (isSpy) {
          role = 'spy';
          keyword = keywordData.spy || '???';
        } else if (isWhiteHat) {
          role = 'whitehat';
          keyword = '???';
        } else {
          role = 'civilian';
          keyword = keywordData.civilian;
        }
        updates[`rooms/${this.currentRoom}/players/${id}/role`] = role;
        updates[`rooms/${this.currentRoom}/players/${id}/keyword`] = keyword;
        updates[`rooms/${this.currentRoom}/players/${id}/voted`] = false;
        updates[`rooms/${this.currentRoom}/players/${id}/vote`] = null;
        updates[`rooms/${this.currentRoom}/players/${id}/eliminated`] = false;
      });

      // Mark host as observer in non-online modes
      if (!isOnlineMode) {
        updates[`rooms/${this.currentRoom}/players/${room.host}/role`] = 'host';
        updates[`rooms/${this.currentRoom}/players/${room.host}/keyword`] = keywordData.civilian;
        updates[`rooms/${this.currentRoom}/players/${room.host}/voted`] = true; // host doesn't vote
        updates[`rooms/${this.currentRoom}/players/${room.host}/vote`] = null;
        updates[`rooms/${this.currentRoom}/players/${room.host}/eliminated`] = true; // excluded from game
      }

      // Determine phase based on mode
      const phase = isOnlineMode ? 'speaking' : 'freeplay';

      updates[`rooms/${this.currentRoom}/status`] = 'playing';
      updates[`rooms/${this.currentRoom}/phase`] = phase;
      updates[`rooms/${this.currentRoom}/keyword`] = keywordData.civilian;
      updates[`rooms/${this.currentRoom}/spyKeyword`] = keywordData.spy || '???';
      updates[`rooms/${this.currentRoom}/category`] = keywordData.category;
      updates[`rooms/${this.currentRoom}/round`] = 1;
      updates[`rooms/${this.currentRoom}/spies`] = spyIds;
      updates[`rooms/${this.currentRoom}/whiteHats`] = whiteHatIds;
      updates[`rooms/${this.currentRoom}/pendingElimination`] = null;
      updates[`rooms/${this.currentRoom}/lastEliminated`] = null;
      updates[`rooms/${this.currentRoom}/winner`] = null;
      updates[`rooms/${this.currentRoom}/winReason`] = null;
      updates[`rooms/${this.currentRoom}/currentSpeech`] = null;

      if (isOnlineMode) {
        updates[`rooms/${this.currentRoom}/speakingOrder`] = speakingOrder;
        updates[`rooms/${this.currentRoom}/currentSpeakerIndex`] = 0;
        updates[`rooms/${this.currentRoom}/speakerStartTime`] = firebase.database.ServerValue.TIMESTAMP;
      } else {
        updates[`rooms/${this.currentRoom}/speakingOrder`] = null;
        updates[`rooms/${this.currentRoom}/currentSpeakerIndex`] = null;
        updates[`rooms/${this.currentRoom}/speakerStartTime`] = null;
      }

      await db.ref().update(updates);
      return { success: true };
    } catch (err) {
      console.error('startGame error:', err);
      return { success: false, error: 'Không thể bắt đầu game' };
    }
  },

  // ================================
  // Speaking Phase
  // ================================

  async nextSpeaker() {
    if (!this.currentRoom) return;

    const snap = await db.ref('rooms/' + this.currentRoom).once('value');
    const room = snap.val();
    const speakingOrder = room.speakingOrder || [];
    const currentSpeakerUid = speakingOrder[room.currentSpeakerIndex || 0];
    const user = Auth.currentUser;

    // Chỉ Quản trò HOẶC người đang nói mới được phép chuyển lượt
    if (!this.isHost && user.uid !== currentSpeakerUid) return;

    const aliveOrdering = speakingOrder.filter(uid => !room.players[uid]?.eliminated);
    const posInAlive = aliveOrdering.indexOf(currentSpeakerUid);

    // FIX: Nếu mất đồng bộ, tự động chuyển cho người còn sống đầu tiên
    if (posInAlive === -1) {
      if (aliveOrdering.length > 0) {
        const rescueIdx = speakingOrder.indexOf(aliveOrdering[0]);
        await db.ref('rooms/' + this.currentRoom).update({
          currentSpeakerIndex: rescueIdx,
          speakerStartTime: firebase.database.ServerValue.TIMESTAMP,
          currentSpeech: null
        });
      }
      return;
    }

    const nextPosInAlive = posInAlive + 1;

    if (nextPosInAlive >= aliveOrdering.length) {
      // All players have spoken → go to discussion
      await this.startDiscussion();
    } else {
      const nextUid = aliveOrdering[nextPosInAlive];
      const nextIdxInOriginal = speakingOrder.indexOf(nextUid);
      await db.ref('rooms/' + this.currentRoom).update({
        currentSpeakerIndex: nextIdxInOriginal,
        speakerStartTime: firebase.database.ServerValue.TIMESTAMP,
        currentSpeech: null
      });
    }
  },

  async sendSpeech(text, isFinal, speakerUid, speakerName) {
    if (!this.currentRoom || !text) return;
    await db.ref('rooms/' + this.currentRoom + '/currentSpeech').set({
      speakerUid,
      speakerName,
      text,
      isFinal,
      ts: Date.now()
    });
  },

  // ================================
  // Discussion Phase
  // ================================

  async startDiscussion() {
    if (!this.isHost || !this.currentRoom) return;
    await db.ref('rooms/' + this.currentRoom).update({
      phase: 'discussion',
      discussionStartTime: firebase.database.ServerValue.TIMESTAMP,
      currentSpeech: null
    });
  },

  // ================================
  // Voting Phase
  // ================================

  async startVoting() {
    if (!this.currentRoom) return;

    const snap = await db.ref('rooms/' + this.currentRoom).once('value');
    const room = snap.val();

    // FIX: Chặn nếu không phải quản trò (ngoại trừ chế độ online)
    if (!this.isHost && room.mode !== 'online') return;

    const players = room.players || {};
    const updates = {};
    Object.keys(players).forEach(id => {
      if (!players[id].eliminated) {
        updates[`rooms/${this.currentRoom}/players/${id}/voted`] = false;
        updates[`rooms/${this.currentRoom}/players/${id}/vote`] = null;
      }
    });
    updates[`rooms/${this.currentRoom}/phase`] = 'voting';
    updates[`rooms/${this.currentRoom}/status`] = 'voting';
    updates[`rooms/${this.currentRoom}/currentSpeech`] = null;
    await db.ref().update(updates);
  },

  async submitVote(targetId, accusedRole) {
    if (!this.currentRoom) return;
    const user = Auth.currentUser;
    // Check if already voted (prevent double vote)
    const mySnap = await db.ref(`rooms/${this.currentRoom}/players/${user.uid}`).once('value');
    const myData = mySnap.val();
    if (myData?.voted) return; // Already voted, do nothing

    await db.ref(`rooms/${this.currentRoom}/players/${user.uid}`).update({
      voted: true,
      vote: { targetId, accusedRole }
    });
    // Note: Results are triggered by host manually via calculateVoteResults()
    // No auto-trigger here — host decides when to end voting
  },

  // ================================
  // Vote Result Calculation
  // ================================

  async calculateVoteResults() {
    try {
      const snap = await db.ref('rooms/' + this.currentRoom).once('value');
      const room = snap.val();
      const players = room.players;

      // Count votes per target
      const voteTally = {}; // targetId → [{ accusedRole, voterId }]
      Object.entries(players).forEach(([id, p]) => {
        if (!p.eliminated && p.voted && p.vote) {
          const { targetId, accusedRole } = p.vote;
          if (!voteTally[targetId]) voteTally[targetId] = [];
          voteTally[targetId].push({ accusedRole, voterId: id });
        }
      });

      // Find most-voted player (random tiebreak)
      let maxVotes = 0, topCandidates = [];
      Object.entries(voteTally).forEach(([id, votes]) => {
        if (votes.length > maxVotes) { maxVotes = votes.length; topCandidates = [id]; }
        else if (votes.length === maxVotes) topCandidates.push(id);
      });

      if (topCandidates.length === 0) {
        // No votes → just continue
        await this.continueGame();
        return;
      }

      const eliminatedId = topCandidates[Math.floor(Math.random() * topCandidates.length)];
      const eliminatedPlayer = players[eliminatedId];
      const trueRole = eliminatedPlayer.role;

      // Find majority accusedRole for this target
      const accusationVotes = voteTally[eliminatedId] || [];
      const accusationCount = {};
      accusationVotes.forEach(v => {
        accusationCount[v.accusedRole] = (accusationCount[v.accusedRole] || 0) + 1;
      });
      const majorityAccusedRole = Object.entries(accusationCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'civilian';

      const updates = {
        [`rooms/${this.currentRoom}/lastEliminated`]: eliminatedId,
        [`rooms/${this.currentRoom}/lastVoteCounts`]: Object.fromEntries(
          Object.entries(voteTally).map(([k, v]) => [k, v.length])
        ),
        [`rooms/${this.currentRoom}/lastAccusedRole`]: majorityAccusedRole,
        [`rooms/${this.currentRoom}/lastTrueRole`]: trueRole
      };

      // ── MISIDENTIFICATION RULE ──────────────────────────────────
      if ((trueRole === 'spy' || trueRole === 'whitehat') && majorityAccusedRole !== trueRole) {
        updates[`rooms/${this.currentRoom}/players/${eliminatedId}/eliminated`] = true;
        updates[`rooms/${this.currentRoom}/status`] = 'finished';
        updates[`rooms/${this.currentRoom}/winner`] = trueRole;
        updates[`rooms/${this.currentRoom}/winReason`] = 'misidentified';
        await db.ref().update(updates);
        return;
      }

      // ── CIVILIAN CORRECTLY (OR INCORRECTLY) VOTED ──────────────
      if (trueRole === 'civilian') {
        updates[`rooms/${this.currentRoom}/players/${eliminatedId}/eliminated`] = true;
        const outcome = this._checkWinAfterElimination(room, eliminatedId);
        if (outcome) {
          updates[`rooms/${this.currentRoom}/status`] = 'finished';
          updates[`rooms/${this.currentRoom}/winner`] = outcome.winner;
          updates[`rooms/${this.currentRoom}/winReason`] = outcome.reason;
        } else {
          updates[`rooms/${this.currentRoom}/status`] = 'revealing';
          updates[`rooms/${this.currentRoom}/round`] = (room.round || 1) + 1;
        }
        await db.ref().update(updates);
        return;
      }

      // ── SPY or WHITEHAT CORRECTLY IDENTIFIED → GUESS PHASE ──────
      updates[`rooms/${this.currentRoom}/status`] = 'guessing';
      updates[`rooms/${this.currentRoom}/pendingElimination`] = {
        playerId: eliminatedId,
        trueRole,
        accusedRole: majorityAccusedRole,
        guessDeadline: Date.now() + 31000
      };
      await db.ref().update(updates);
      
      // Nếu người bị bắt là Bot -> Bot không tự nhập phím được, host ép bot đoán sai sau 3 giây để game kết thúc
      if (eliminatedPlayer.isBot && this.isHost) {
        setTimeout(() => {
          this.submitGuess('___bot_wrong_guess___');
        }, 3500);
      }
    } catch (err) {
      console.error('calculateVoteResults error:', err);
    }
  },

  // ================================
  // Guess Phase
  // ================================

  async submitGuess(word) {
    if (!this.currentRoom) return;
    try {
      const snap = await db.ref('rooms/' + this.currentRoom).once('value');
      const room = snap.val();
      const pending = room.pendingElimination;
      if (!pending) return;

      const normalizedGuess = word.trim().toLowerCase().normalize('NFC');
      const normalizedKeyword = (room.keyword || '').trim().toLowerCase().normalize('NFC');
      const isCorrect = normalizedGuess === normalizedKeyword;

      const updates = {
        [`rooms/${this.currentRoom}/players/${pending.playerId}/eliminated`]: true,
        [`rooms/${this.currentRoom}/pendingElimination`]: null,
        [`rooms/${this.currentRoom}/lastGuess`]: word.trim(),
        [`rooms/${this.currentRoom}/lastGuessCorrect`]: isCorrect
      };

      if (isCorrect) {
        updates[`rooms/${this.currentRoom}/status`] = 'finished';
        updates[`rooms/${this.currentRoom}/winner`] = pending.trueRole;
        updates[`rooms/${this.currentRoom}/winReason`] = 'correct_guess';
      } else {
        const outcome = this._checkWinAfterElimination(room, pending.playerId);
        if (outcome) {
          updates[`rooms/${this.currentRoom}/status`] = 'finished';
          updates[`rooms/${this.currentRoom}/winner`] = outcome.winner;
          updates[`rooms/${this.currentRoom}/winReason`] = outcome.reason;
        } else {
          updates[`rooms/${this.currentRoom}/status`] = 'revealing';
          updates[`rooms/${this.currentRoom}/round`] = (room.round || 1) + 1;
        }
      }
      await db.ref().update(updates);
    } catch (err) {
      console.error('submitGuess error:', err);
    }
  },

  _checkWinAfterElimination(room, justEliminatedId) {
    const players = room.players;
    const spyIds = room.spies || [];
    const whiteHatIds = room.whiteHats || [];

    const isEliminated = id => id === justEliminatedId || players[id]?.eliminated;

    const allSpecialGone = [...spyIds, ...whiteHatIds].every(isEliminated);
    if (allSpecialGone) {
      return { winner: 'civilian', reason: 'all_eliminated' };
    }

    const aliveSpies = spyIds.filter(id => !isEliminated(id));
    const aliveNonSpies = Object.entries(players)
      .filter(([id, p]) => !isEliminated(id) && !spyIds.includes(id));

    if (aliveSpies.length > 0 && aliveSpies.length >= aliveNonSpies.length) {
      return { winner: 'spy', reason: 'majority' };
    }
    return null;
  },

  // ================================
  // Continue / Reset
  // ================================

  async continueGame() {
    if (!this.isHost || !this.currentRoom) return;
    const snap = await db.ref('rooms/' + this.currentRoom).once('value');
    const room = snap.val();
    const isOnlineMode = room.mode === 'online';
    const alivePlayers = Object.entries(room.players)
      .filter(([, p]) => !p.eliminated)
      .map(([id]) => id)
      .sort(() => Math.random() - 0.5);

    const updateData = {
      status: 'playing',
      phase: isOnlineMode ? 'speaking' : 'freeplay',
      currentSpeech: null,
      pendingElimination: null
    };

    if (isOnlineMode) {
      updateData.speakingOrder = alivePlayers;
      updateData.currentSpeakerIndex = 0;
      updateData.speakerStartTime = firebase.database.ServerValue.TIMESTAMP;
    }

    await db.ref('rooms/' + this.currentRoom).update(updateData);
  },

  async resetGame() {
    if (!this.isHost || !this.currentRoom) return;
    const snap = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
    const players = snap.val();
    const updates = {};
    Object.keys(players).forEach(id => {
      updates[`rooms/${this.currentRoom}/players/${id}/role`] = null;
      updates[`rooms/${this.currentRoom}/players/${id}/keyword`] = null;
      updates[`rooms/${this.currentRoom}/players/${id}/voted`] = false;
      updates[`rooms/${this.currentRoom}/players/${id}/vote`] = null;
      updates[`rooms/${this.currentRoom}/players/${id}/eliminated`] = false;
    });
    const fields = ['status', 'phase', 'keyword', 'spyKeyword', 'category', 'round', 'spies', 'whiteHats',
      'winner', 'winReason', 'speakingOrder', 'currentSpeakerIndex', 'speakerStartTime', 'discussionStartTime',
      'currentSpeech', 'pendingElimination', 'lastEliminated', 'lastVoteCounts', 'lastAccusedRole',
      'lastTrueRole', 'lastGuess', 'lastGuessCorrect'];
    fields.forEach(f => { updates[`rooms/${this.currentRoom}/${f}`] = null; });
    updates[`rooms/${this.currentRoom}/status`] = 'waiting';
    await db.ref().update(updates);
  },

  // ================================
  // Firebase Listeners
  // ================================

  listenToRoom(callback) {
    if (!this.currentRoom) return;
    const ref = db.ref('rooms/' + this.currentRoom);
    ref.on('value', snap => callback(snap.val()));
    this.listeners.push(ref);
  },

  removeAllListeners() {
    this.listeners.forEach(ref => ref.off());
    this.listeners = [];
  },

  // ================================
  // Bot Helpers (Testing)
  // ================================

  async addBotPlayer() {
    if (!this.isHost || !this.currentRoom) return;
    const botNames = ['Bot An', 'Bot Bình', 'Bot Chi', 'Bot Dung', 'Bot Em', 'Bot Phúc', 'Bot Giang', 'Bot Hà', 'Bot Khánh', 'Bot Linh'];
    const snap = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
    const players = snap.val() || {};
    const count = Object.keys(players).length;
    if (count >= 15) return;
    const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    await db.ref('rooms/' + this.currentRoom + '/players/' + botId).set({
      name: botNames[count % botNames.length],
      role: null,
      keyword: null,
      voted: false,
      vote: null,
      eliminated: false,
      isReady: true,
      isBot: true,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
  },

  async autoBotVote() {
    if (!this.currentRoom) return;
    const snap = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
    const players = snap.val() || {};
    const active = Object.entries(players).filter(([, p]) => !p.eliminated);
    const bots = active.filter(([, p]) => p.isBot && !p.voted);
    const targets = active.map(([id]) => id);
    const roles = ['spy', 'whitehat', 'civilian'];
    for (const [botId] of bots) {
      const validTargets = targets.filter(id => id !== botId);
      const target = validTargets[Math.floor(Math.random() * validTargets.length)];
      const accusedRole = roles[Math.floor(Math.random() * roles.length)];
      if (target) {
        await db.ref(`rooms/${this.currentRoom}/players/${botId}`).update({
          voted: true,
          vote: { targetId: target, accusedRole }
        });
      }
    }
    // Results are triggered by host via calculateVoteResults() manually
  },

  // ================================
  // Chat feature
  // ================================
  async sendChatMessage(text) {
    if (!this.currentRoom) return;
    const user = Auth.currentUser;
    await db.ref('rooms/' + this.currentRoom + '/chats').push({
      senderId: user.uid,
      senderName: user.name,
      text: text,
      ts: firebase.database.ServerValue.TIMESTAMP
    });
  },

  // ================================
  // Settings & Profile
  // ================================
  async updateRoomSettings(newSettings) {
    if (!this.isHost || !this.currentRoom) return { success: false };
    try {
      await db.ref('rooms/' + this.currentRoom + '/settings').update(newSettings);
      return { success: true };
    } catch (err) {
      console.error('updateRoomSettings error:', err);
      return { success: false, error: 'Không thể cập nhật cấu hình' };
    }
  },

  async updatePlayerName(newName) {
    if (!this.currentRoom) return { success: false };
    const user = Auth.currentUser;
    try {
      await db.ref(`rooms/${this.currentRoom}/players/${user.uid}`).update({ name: newName });
      // Update historical speech or chat if needed later, but updating current player name is enough
      return { success: true };
    } catch (err) {
      console.error('updatePlayerName error:', err);
      return { success: false };
    }
  }
};

console.log('✅ Game module loaded (v2 - with vote accusation & guess phase)');