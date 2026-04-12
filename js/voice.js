// ========================================
// Voice Chat Module - Agora WebRTC
// ========================================

const Voice = {
  client: null,
  localTrack: null,
  remoteUsers: {},
  isJoined: false,
  isMuted: false,
  appId: '10460078d04c4a1f8b2be8893da6277d',

  /**
   * Initialize Agora client
   */
  init() {
    if (typeof AgoraRTC === 'undefined') {
      console.warn('⚠️ Agora SDK not loaded — voice chat disabled');
      return;
    }
    AgoraRTC.setLogLevel(3); // Reduce log noise
    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this._bindEvents();
    console.log('✅ Voice module initialized');
  },

  /**
   * Bind Agora client events
   */
  _bindEvents() {
    if (!this.client) return;

    // When a remote user publishes audio
    this.client.on('user-published', async (user, mediaType) => {
      try {
        await this.client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          const remoteAudioTrack = user.audioTrack;
          remoteAudioTrack.play();
          this.remoteUsers[user.uid] = user;
          console.log(`🔊 Hearing user ${user.uid}`);
        }
      } catch (err) {
        console.error('Subscribe error:', err);
      }
    });

    this.client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'audio') {
        delete this.remoteUsers[user.uid];
      }
    });

    this.client.on('user-left', (user) => {
      delete this.remoteUsers[user.uid];
    });
  },

  /**
   * Join a voice channel (channel = room code)
   * uid must be null (auto) or a numeric value for Agora
   */
  async join(channelName, uid) {
    if (!this.client) {
      console.warn('Voice client not initialized');
      return false;
    }
    if (this.isJoined) return true;

    try {
      // Convert uid to a numeric hash for Agora (must be number or null)
      const numericUid = uid ? Math.abs(this._hashCode(uid)) % 100000000 : null;

      // Join the channel (token = null for testing mode)
      await this.client.join(this.appId, channelName, null, numericUid);

      // Create and publish microphone track
      this.localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard',
        AEC: true,  // Echo cancellation
        AGC: true,  // Auto gain control
        ANS: true   // Noise suppression
      });

      await this.client.publish([this.localTrack]);

      this.isJoined = true;
      this.isMuted = false;
      console.log(`🎤 Joined voice channel: ${channelName} (uid: ${numericUid})`);
      return true;
    } catch (err) {
      console.error('❌ Failed to join voice:', err.message || err);
      // If mic permission denied, show helpful message
      if (err.code === 'PERMISSION_DENIED' || err.message?.includes('Permission')) {
        console.error('💡 User denied microphone access');
      }
      return false;
    }
  },

  /**
   * Leave the voice channel
   */
  async leave() {
    if (!this.isJoined) return;

    try {
      if (this.localTrack) {
        this.localTrack.stop();
        this.localTrack.close();
        this.localTrack = null;
      }
      await this.client.leave();
      this.remoteUsers = {};
      this.isJoined = false;
      this.isMuted = false;
      console.log('👋 Left voice channel');
    } catch (err) {
      console.error('Error leaving voice:', err);
    }
  },

  /**
   * Toggle mute/unmute
   */
  toggleMute() {
    if (!this.localTrack) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localTrack.setEnabled(!this.isMuted);
    return this.isMuted;
  },

  /**
   * Set mute state directly
   */
  setMute(muted) {
    if (!this.localTrack) return;
    this.isMuted = muted;
    this.localTrack.setEnabled(!muted);
  },

  /**
   * Get number of connected users
   */
  getRemoteUserCount() {
    return Object.keys(this.remoteUsers).length;
  },

  /**
   * Hash a string to a number (for UID)
   */
  _hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }
};

console.log('✅ Voice module loaded');
