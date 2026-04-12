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
      console.warn('⚠️ Agora SDK not loaded');
      return;
    }
    // Disable Agora logs in production
    AgoraRTC.setLogLevel(3);
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
      await this.client.subscribe(user, mediaType);
      console.log(`🔊 Subscribed to ${user.uid}`);

      if (mediaType === 'audio') {
        const remoteAudioTrack = user.audioTrack;
        remoteAudioTrack.play();
        this.remoteUsers[user.uid] = user;
      }
    });

    // When a remote user stops publishing
    this.client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'audio') {
        delete this.remoteUsers[user.uid];
      }
    });

    // When a remote user leaves
    this.client.on('user-left', (user) => {
      delete this.remoteUsers[user.uid];
      console.log(`👋 User ${user.uid} left voice`);
    });
  },

  /**
   * Join a voice channel (channel = room code)
   */
  async join(channelName, uid) {
    if (!this.client) {
      console.warn('Voice client not initialized');
      return false;
    }
    if (this.isJoined) {
      console.log('Already in voice channel');
      return true;
    }

    try {
      // Join the channel (token = null for testing mode)
      await this.client.join(this.appId, channelName, null, uid || null);

      // Create and publish microphone track
      this.localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard'
      });

      await this.client.publish([this.localTrack]);

      this.isJoined = true;
      this.isMuted = false;
      console.log(`🎤 Joined voice channel: ${channelName}`);
      return true;
    } catch (err) {
      console.error('❌ Failed to join voice:', err);
      return false;
    }
  },

  /**
   * Leave the voice channel
   */
  async leave() {
    if (!this.isJoined) return;

    try {
      // Stop and close local track
      if (this.localTrack) {
        this.localTrack.stop();
        this.localTrack.close();
        this.localTrack = null;
      }

      // Leave the channel
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
    console.log(this.isMuted ? '🔇 Muted' : '🔊 Unmuted');
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
  }
};

console.log('✅ Voice module loaded');
