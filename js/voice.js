// ========================================
// Voice Chat Module - Agora WebRTC
// ========================================

const Voice = {
  client: null,
  localTrack: null,
  remoteUsers: {},
  isJoined: false,
  isMuted: false,
  appId: 'cfb85dd1286a45ae9336574469bed70d',
  _retryCount: 0,
  _maxRetries: 2,

  /**
   * Initialize Agora client
   */
  init() {
    if (typeof AgoraRTC === 'undefined') {
      console.error('❌ AgoraRTC is NOT loaded — check CDN URL');
      this._sdkLoaded = false;
      return;
    }
    this._sdkLoaded = true;
    AgoraRTC.setLogLevel(1); // Show warnings for debugging
    this.client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    this._bindEvents();
    console.log('✅ Voice: Agora SDK version', AgoraRTC.VERSION || 'unknown');
  },

  _bindEvents() {
    if (!this.client) return;

    this.client.on('user-published', async (user, mediaType) => {
      try {
        await this.client.subscribe(user, mediaType);
        if (mediaType === 'audio') {
          user.audioTrack.play();
          this.remoteUsers[user.uid] = user;
          console.log('🔊 Now hearing:', user.uid);
        }
      } catch (err) {
        console.error('Subscribe error:', err);
      }
    });

    this.client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'audio') delete this.remoteUsers[user.uid];
    });

    this.client.on('user-left', (user) => {
      delete this.remoteUsers[user.uid];
    });

    this.client.on('connection-state-change', (curState, prevState) => {
      console.log(`🔗 Voice connection: ${prevState} → ${curState}`);
    });
  },

  /**
   * Join a voice channel
   */
  async join(channelName, uid) {
    // Check SDK loaded
    if (!this._sdkLoaded || !this.client) {
      return { success: false, error: 'Agora SDK chưa tải. Thử refresh trang.' };
    }
    if (this.isJoined) return { success: true };

    try {
      console.log('🔄 Voice: joining channel', channelName);

      // Use null UID (let Agora auto-assign)
      await this.client.join(this.appId, channelName, null, null);
      console.log('✅ Voice: joined channel OK');

      // Request mic access
      this.localTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: 'speech_standard'
      });
      console.log('✅ Voice: mic track created');

      await this.client.publish([this.localTrack]);
      console.log('✅ Voice: publishing audio');

      this.isJoined = true;
      this.isMuted = false;
      this._retryCount = 0;
      return { success: true };

    } catch (err) {
      const errMsg = err.message || err.code || String(err);
      console.error('❌ Voice join failed:', errMsg, err);

      // Parse specific errors
      if (errMsg.includes('INVALID_OPERATION') || errMsg.includes('UID_CONFLICT')) {
        // Already in a channel, try to leave and rejoin
        try { await this.client.leave(); } catch(_){}
        if (this._retryCount < this._maxRetries) {
          this._retryCount++;
          return this.join(channelName, uid);
        }
      }

      let userError = 'Lỗi kết nối voice: ' + errMsg;
      if (errMsg.includes('PERMISSION_DENIED') || errMsg.includes('NotAllowed')) {
        userError = 'Bạn cần cho phép quyền mic trong cài đặt trình duyệt';
      } else if (errMsg.includes('CAN_NOT_GET_GATEWAY_SERVER') || errMsg.includes('NETWORK')) {
        userError = 'Lỗi mạng - kiểm tra kết nối internet';
      } else if (errMsg.includes('INVALID_PARAMS') || errMsg.includes('token')) {
        userError = 'Lỗi cấu hình Agora - kiểm tra App ID/Token';
      }

      return { success: false, error: userError };
    }
  },

  async leave() {
    if (!this.isJoined) return;
    try {
      if (this.localTrack) {
        this.localTrack.stop();
        this.localTrack.close();
        this.localTrack = null;
      }
      await this.client.leave();
    } catch (_) {}
    this.remoteUsers = {};
    this.isJoined = false;
    this.isMuted = false;
  },

  toggleMute() {
    if (!this.localTrack) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localTrack.setEnabled(!this.isMuted);
    return this.isMuted;
  },

  setMute(muted) {
    if (!this.localTrack) return;
    this.isMuted = muted;
    this.localTrack.setEnabled(!muted);
  },

  getRemoteUserCount() {
    return Object.keys(this.remoteUsers).length;
  }
};

console.log('✅ Voice module loaded, AgoraRTC available:', typeof AgoraRTC !== 'undefined');
