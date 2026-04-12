// ========================================
// Game Logic Module - Spy Game
// ========================================

const Game = {
  currentRoom: null,
  isHost: false,
  listeners: [],
  votingTimer: null,
  discussionTimer: null,

  /**
   * Generate a random 6-character room code
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  },

  /**
   * Create a new game room
   */
  async createRoom(settings) {
    try {
      const code = this.generateRoomCode();
      const user = Auth.currentUser;
      
      const roomData = {
        code: code,
        host: user.uid,
        hostName: user.name,
        mode: settings.mode, // 'inperson' or 'online'
        status: 'waiting',
        settings: {
          maxPlayers: settings.maxPlayers || 10,
          numSpies: settings.numSpies || 1,
          numWhiteHats: settings.numWhiteHats || 0,
          discussionTime: settings.discussionTime || 180,
          votingTime: settings.votingTime || 60,
          keywordMode: settings.keywordMode || 'pair' // 'pair' or 'single'
        },
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {}
      };

      // Add host as first player
      roomData.players[user.uid] = {
        name: user.name,
        role: null,
        keyword: null,
        voted: false,
        votedFor: null,
        eliminated: false,
        isReady: true,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      };

      await db.ref('rooms/' + code).set(roomData);
      
      this.currentRoom = code;
      this.isHost = true;

      return { success: true, code: code };
    } catch (error) {
      console.error('Create room error:', error);
      return { success: false, error: 'Không thể tạo phòng. Thử lại.' };
    }
  },

  /**
   * Join an existing room
   */
  async joinRoom(code) {
    try {
      code = code.toUpperCase().trim();
      const snapshot = await db.ref('rooms/' + code).once('value');
      const room = snapshot.val();

      if (!room) {
        return { success: false, error: 'Không tìm thấy phòng này' };
      }

      if (room.status !== 'waiting') {
        return { success: false, error: 'Phòng đã bắt đầu chơi rồi' };
      }

      const playerCount = room.players ? Object.keys(room.players).length : 0;
      if (playerCount >= room.settings.maxPlayers) {
        return { success: false, error: 'Phòng đã đầy' };
      }

      const user = Auth.currentUser;

      // Check if already in room
      if (room.players && room.players[user.uid]) {
        this.currentRoom = code;
        this.isHost = room.host === user.uid;
        return { success: true, code: code };
      }

      // Add player to room
      await db.ref('rooms/' + code + '/players/' + user.uid).set({
        name: user.name,
        role: null,
        keyword: null,
        voted: false,
        votedFor: null,
        eliminated: false,
        isReady: false,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });

      this.currentRoom = code;
      this.isHost = room.host === user.uid;

      return { success: true, code: code };
    } catch (error) {
      console.error('Join room error:', error);
      return { success: false, error: 'Không thể tham gia phòng' };
    }
  },

  /**
   * Leave the current room
   */
  async leaveRoom() {
    if (!this.currentRoom) return;

    try {
      const user = Auth.currentUser;
      if (!user) return;

      // Remove listeners
      this.removeAllListeners();

      // Clear timers
      if (this.votingTimer) clearInterval(this.votingTimer);
      if (this.discussionTimer) clearInterval(this.discussionTimer);

      if (this.isHost) {
        // Host leaves = delete room
        await db.ref('rooms/' + this.currentRoom).remove();
      } else {
        // Player leaves = remove from room
        await db.ref('rooms/' + this.currentRoom + '/players/' + user.uid).remove();
      }

      this.currentRoom = null;
      this.isHost = false;
    } catch (error) {
      console.error('Leave room error:', error);
    }
  },

  /**
   * Start the game (host only)
   */
  async startGame() {
    if (!this.isHost || !this.currentRoom) return { success: false };

    try {
      const snapshot = await db.ref('rooms/' + this.currentRoom).once('value');
      const room = snapshot.val();
      const players = room.players;
      const playerIds = Object.keys(players);
      const numPlayers = playerIds.length;

      if (numPlayers < 3) {
        return { success: false, error: 'Cần ít nhất 3 người chơi' };
      }

      const numSpies = Math.min(room.settings.numSpies, Math.floor(numPlayers / 3));
      const numWhiteHats = Math.min(room.settings.numWhiteHats || 0, Math.floor((numPlayers - numSpies) / 3));

      // Generate keywords
      let keywordData;
      if (room.settings.keywordMode === 'pair') {
        keywordData = await generateKeywordPair();
      } else {
        const singleData = await generateSingleKeyword();
        keywordData = {
          civilian: singleData.keyword,
          spy: null,
          category: singleData.category
        };
      }

      // Randomly assign spies, then white hats, rest are civilians
      const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
      const spyIds = shuffled.slice(0, numSpies);
      const whiteHatIds = shuffled.slice(numSpies, numSpies + numWhiteHats);

      // Update each player's role and keyword
      const updates = {};
      playerIds.forEach(id => {
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
        updates[`rooms/${this.currentRoom}/players/${id}/votedFor`] = null;
        updates[`rooms/${this.currentRoom}/players/${id}/eliminated`] = false;
      });

      // Update room status
      updates[`rooms/${this.currentRoom}/status`] = 'playing';
      updates[`rooms/${this.currentRoom}/keyword`] = keywordData.civilian;
      updates[`rooms/${this.currentRoom}/spyKeyword`] = keywordData.spy || '???';
      updates[`rooms/${this.currentRoom}/category`] = keywordData.category;
      updates[`rooms/${this.currentRoom}/round`] = 1;
      updates[`rooms/${this.currentRoom}/spies`] = spyIds;
      updates[`rooms/${this.currentRoom}/whiteHats`] = whiteHatIds;

      await db.ref().update(updates);

      return { success: true };
    } catch (error) {
      console.error('Start game error:', error);
      return { success: false, error: 'Không thể bắt đầu game' };
    }
  },

  /**
   * Start voting round (host only)
   */
  async startVoting() {
    if (!this.isHost || !this.currentRoom) return;

    try {
      const snapshot = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
      const players = snapshot.val();
      
      // Reset all votes
      const updates = {};
      Object.keys(players).forEach(id => {
        if (!players[id].eliminated) {
          updates[`rooms/${this.currentRoom}/players/${id}/voted`] = false;
          updates[`rooms/${this.currentRoom}/players/${id}/votedFor`] = null;
        }
      });
      updates[`rooms/${this.currentRoom}/status`] = 'voting';

      await db.ref().update(updates);
    } catch (error) {
      console.error('Start voting error:', error);
    }
  },

  /**
   * Submit a vote
   */
  async submitVote(targetId) {
    if (!this.currentRoom) return;

    const user = Auth.currentUser;
    try {
      await db.ref(`rooms/${this.currentRoom}/players/${user.uid}`).update({
        voted: true,
        votedFor: targetId
      });

      // Check if all players have voted
      const snapshot = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
      const players = snapshot.val();
      const activePlayers = Object.entries(players).filter(([_, p]) => !p.eliminated);
      const allVoted = activePlayers.every(([_, p]) => p.voted);

      if (allVoted) {
        await this.calculateVoteResults();
      }
    } catch (error) {
      console.error('Vote error:', error);
    }
  },

  /**
   * Calculate vote results
   */
  async calculateVoteResults() {
    try {
      const snapshot = await db.ref('rooms/' + this.currentRoom).once('value');
      const room = snapshot.val();
      const players = room.players;

      // Count votes
      const voteCounts = {};
      Object.entries(players).forEach(([id, player]) => {
        if (!player.eliminated && player.votedFor) {
          voteCounts[player.votedFor] = (voteCounts[player.votedFor] || 0) + 1;
        }
      });

      // Find the player with most votes
      let maxVotes = 0;
      let eliminatedId = null;
      Object.entries(voteCounts).forEach(([id, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          eliminatedId = id;
        }
      });

      if (eliminatedId) {
        await db.ref(`rooms/${this.currentRoom}/players/${eliminatedId}/eliminated`).set(true);
      }

      // Check win condition
      const spyIds = room.spies || [];
      const whiteHatIds = room.whiteHats || [];
      const remainingSpies = spyIds.filter(id => !players[id]?.eliminated && id !== eliminatedId);
      // White hats count with civilians for win/lose
      const remainingNonSpies = Object.entries(players)
        .filter(([id, p]) => !p.eliminated && id !== eliminatedId && !spyIds.includes(id))
        .length;

      let gameOver = false;
      let winner = null;

      if (remainingSpies.length === 0) {
        // All spies eliminated - civilians & white hats win
        gameOver = true;
        winner = 'civilian';
      } else if (remainingSpies.length >= remainingNonSpies) {
        // Spies outnumber non-spies - spies win
        gameOver = true;
        winner = 'spy';
      }

      const updates = {};
      updates[`rooms/${this.currentRoom}/lastEliminated`] = eliminatedId;
      updates[`rooms/${this.currentRoom}/lastVoteCounts`] = voteCounts;

      if (gameOver) {
        updates[`rooms/${this.currentRoom}/status`] = 'finished';
        updates[`rooms/${this.currentRoom}/winner`] = winner;
      } else {
        updates[`rooms/${this.currentRoom}/status`] = 'revealing';
        updates[`rooms/${this.currentRoom}/round`] = (room.round || 1) + 1;
      }

      await db.ref().update(updates);
    } catch (error) {
      console.error('Calculate vote results error:', error);
    }
  },

  /**
   * Continue to next round after reveal
   */
  async continueGame() {
    if (!this.isHost || !this.currentRoom) return;
    await db.ref(`rooms/${this.currentRoom}/status`).set('playing');
  },

  /**
   * Send a chat message (online mode)
   */
  async sendMessage(text) {
    if (!this.currentRoom || !text.trim()) return;

    const user = Auth.currentUser;
    await db.ref(`rooms/${this.currentRoom}/messages`).push({
      userId: user.uid,
      name: user.name,
      text: text.trim(),
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  },

  /**
   * Listen to room changes
   */
  listenToRoom(callback) {
    if (!this.currentRoom) return;
    const ref = db.ref('rooms/' + this.currentRoom);
    ref.on('value', (snapshot) => {
      callback(snapshot.val());
    });
    this.listeners.push(ref);
  },

  /**
   * Listen to chat messages
   */
  listenToMessages(callback) {
    if (!this.currentRoom) return;
    const ref = db.ref('rooms/' + this.currentRoom + '/messages');
    ref.orderByChild('timestamp').on('child_added', (snapshot) => {
      callback({ id: snapshot.key, ...snapshot.val() });
    });
    this.listeners.push(ref);
  },

  /**
   * Remove all Firebase listeners
   */
  removeAllListeners() {
    this.listeners.forEach(ref => ref.off());
    this.listeners = [];
  },

  /**
   * Add a bot player for testing (host only)
   */
  async addBotPlayer() {
    if (!this.isHost || !this.currentRoom) return;

    const botNames = ['Bot An', 'Bot Bình', 'Bot Chi', 'Bot Dung', 'Bot Em',
                      'Bot Phúc', 'Bot Giang', 'Bot Hà', 'Bot Khánh', 'Bot Linh',
                      'Bot Minh', 'Bot Ngọc', 'Bot Oanh', 'Bot Phong'];

    const snapshot = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
    const players = snapshot.val() || {};
    const existingCount = Object.keys(players).length;

    if (existingCount >= 15) return;

    const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const botName = botNames[existingCount % botNames.length];

    await db.ref('rooms/' + this.currentRoom + '/players/' + botId).set({
      name: botName,
      role: null,
      keyword: null,
      voted: false,
      votedFor: null,
      eliminated: false,
      isReady: true,
      isBot: true,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
  },

  /**
   * Auto-vote for bots (random vote)
   */
  async autoBotVote() {
    if (!this.currentRoom) return;

    const snapshot = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
    const players = snapshot.val() || {};

    const activePlayers = Object.entries(players).filter(([_, p]) => !p.eliminated);
    const bots = activePlayers.filter(([id, p]) => p.isBot && !p.voted);
    const targets = activePlayers.map(([id]) => id);

    for (const [botId, bot] of bots) {
      // Bot votes randomly (excluding self)
      const validTargets = targets.filter(id => id !== botId);
      const target = validTargets[Math.floor(Math.random() * validTargets.length)];
      if (target) {
        await db.ref(`rooms/${this.currentRoom}/players/${botId}`).update({
          voted: true,
          votedFor: target
        });
      }
    }

    // Check if all players have voted
    const updatedSnapshot = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
    const updatedPlayers = updatedSnapshot.val();
    const allActive = Object.entries(updatedPlayers).filter(([_, p]) => !p.eliminated);
    const allVoted = allActive.every(([_, p]) => p.voted);

    if (allVoted) {
      await this.calculateVoteResults();
    }
  },

  /**
   * Reset game for new round (host only)
   */
  async resetGame() {
    if (!this.isHost || !this.currentRoom) return;

    try {
      const snapshot = await db.ref('rooms/' + this.currentRoom + '/players').once('value');
      const players = snapshot.val();

      const updates = {};
      Object.keys(players).forEach(id => {
        updates[`rooms/${this.currentRoom}/players/${id}/role`] = null;
        updates[`rooms/${this.currentRoom}/players/${id}/keyword`] = null;
        updates[`rooms/${this.currentRoom}/players/${id}/voted`] = false;
        updates[`rooms/${this.currentRoom}/players/${id}/votedFor`] = null;
        updates[`rooms/${this.currentRoom}/players/${id}/eliminated`] = false;
      });

      updates[`rooms/${this.currentRoom}/status`] = 'waiting';
      updates[`rooms/${this.currentRoom}/keyword`] = null;
      updates[`rooms/${this.currentRoom}/spyKeyword`] = null;
      updates[`rooms/${this.currentRoom}/category`] = null;
      updates[`rooms/${this.currentRoom}/round`] = null;
      updates[`rooms/${this.currentRoom}/spies`] = null;
      updates[`rooms/${this.currentRoom}/whiteHats`] = null;
      updates[`rooms/${this.currentRoom}/winner`] = null;
      updates[`rooms/${this.currentRoom}/lastEliminated`] = null;
      updates[`rooms/${this.currentRoom}/lastVoteCounts`] = null;
      updates[`rooms/${this.currentRoom}/messages`] = null;

      await db.ref().update(updates);
    } catch (error) {
      console.error('Reset game error:', error);
    }
  }
};

console.log('✅ Game module loaded');
