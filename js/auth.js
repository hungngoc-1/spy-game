// ========================================
// Authentication Module - Spy Game
// ========================================

const Auth = {
  currentUser: null,

  /**
   * Sign up with email and password
   */
  async signup(email, password, displayName) {
    try {
      const credential = await auth.createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({ displayName: displayName });
      
      // Save user data to database
      await db.ref('users/' + credential.user.uid).set({
        name: displayName,
        email: email,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        gamesPlayed: 0,
        wins: 0
      });

      this.currentUser = {
        uid: credential.user.uid,
        name: displayName,
        email: email
      };

      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  },

  /**
   * Login with email and password
   */
  async login(email, password) {
    try {
      const credential = await auth.signInWithEmailAndPassword(email, password);
      
      this.currentUser = {
        uid: credential.user.uid,
        name: credential.user.displayName || email.split('@')[0],
        email: credential.user.email
      };

      return { success: true, user: this.currentUser };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: this.getErrorMessage(error.code) };
    }
  },

  /**
   * Update Profile Name
   */
  async updateProfileName(newName) {
    if (!this.currentUser) return { success: false };
    try {
      await auth.currentUser.updateProfile({ displayName: newName });
      await db.ref('users/' + this.currentUser.uid).update({ name: newName });
      this.currentUser.name = newName;
      return { success: true };
    } catch (error) {
      console.error('Update name error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Logout
   */
  async logout() {
    try {
      // Leave any active room before logging out
      if (Game.currentRoom) {
        await Game.leaveRoom();
      }
      await auth.signOut();
      this.currentUser = null;
      return { success: true };
    } catch (error) {
      console.error('Logout error:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Listen for auth state changes
   */
  onAuthStateChanged(callback) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        this.currentUser = {
          uid: user.uid,
          name: user.displayName || user.email.split('@')[0],
          email: user.email
        };
      } else {
        this.currentUser = null;
      }
      callback(this.currentUser);
    });
  },

  /**
   * Get Vietnamese error messages
   */
  getErrorMessage(code) {
    const messages = {
      'auth/email-already-in-use': 'Email này đã được sử dụng',
      'auth/invalid-email': 'Email không hợp lệ',
      'auth/weak-password': 'Mật khẩu phải có ít nhất 6 ký tự',
      'auth/user-not-found': 'Không tìm thấy tài khoản',
      'auth/wrong-password': 'Mật khẩu không đúng',
      'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng thử lại sau',
      'auth/invalid-credential': 'Email hoặc mật khẩu không đúng',
      'auth/network-request-failed': 'Lỗi kết nối mạng'
    };
    return messages[code] || 'Đã có lỗi xảy ra. Vui lòng thử lại.';
  }
};

console.log('✅ Auth module loaded');
