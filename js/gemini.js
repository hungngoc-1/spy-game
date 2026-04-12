// ========================================
// Gemini AI Integration - Spy Game
// ========================================

const GEMINI_API_KEY = 'AIzaSyBFhKa8oRi4gTbBz0ftSJ4ffcgT-DMObhU';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Built-in Vietnamese word lists (fallback if API fails)
const WORD_LISTS = {
  "Đồ ăn": ["Phở", "Bánh mì", "Bún bò Huế", "Cơm tấm", "Bánh xèo", "Gỏi cuốn", "Bún chả", "Bánh cuốn", "Hủ tiếu", "Mì Quảng", "Bánh canh", "Chả giò", "Xôi", "Bánh tráng trộn", "Bò kho"],
  "Động vật": ["Mèo", "Chó", "Voi", "Hổ", "Rắn", "Cá sấu", "Gấu trúc", "Khỉ", "Đại bàng", "Cá heo", "Sư tử", "Ngựa vằn", "Chim cánh cụt", "Rùa biển", "Bạch tuộc"],
  "Nghề nghiệp": ["Bác sĩ", "Giáo viên", "Kỹ sư", "Đầu bếp", "Ca sĩ", "Phi công", "Lính cứu hỏa", "Nhà báo", "Luật sư", "Kiến trúc sư", "Nhiếp ảnh gia", "Diễn viên", "Thợ cắt tóc", "Dược sĩ", "Lập trình viên"],
  "Địa điểm": ["Bệnh viện", "Trường học", "Siêu thị", "Công viên", "Sân bay", "Bãi biển", "Thư viện", "Nhà hàng", "Rạp chiếu phim", "Bảo tàng", "Vườn thú", "Ngân hàng", "Bưu điện", "Nhà ga", "Chợ đêm"],
  "Đồ vật": ["Điện thoại", "Laptop", "Xe đạp", "Đồng hồ", "Kính mắt", "Ô dù", "Máy ảnh", "Tai nghe", "Balo", "Ví tiền", "Chìa khóa", "Bút máy", "Gương", "Nến thơm", "Quả địa cầu"],
  "Phim & Nhân vật": ["Harry Potter", "Superman", "Doraemon", "Thanos", "Elsa", "Spider-Man", "Pikachu", "Naruto", "Iron Man", "Tôn Ngộ Không", "Joker", "Batman", "Sherlock Holmes", "James Bond", "Jack Sparrow"],
  "Thể thao": ["Bóng đá", "Bơi lội", "Cầu lông", "Bóng rổ", "Tennis", "Đua xe", "Trượt tuyết", "Yoga", "Boxing", "Leo núi", "Lướt sóng", "Bắn cung", "Đấu kiếm", "Billiards", "Cờ vua"],
  "Quốc gia": ["Việt Nam", "Nhật Bản", "Hàn Quốc", "Pháp", "Ý", "Brazil", "Ai Cập", "Úc", "Mexico", "Ấn Độ", "Thái Lan", "Đức", "Nga", "Canada", "Argentina"]
};

/**
 * Call Gemini API with a prompt
 */
async function callGemini(prompt) {
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 1024
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

/**
 * Generate a keyword pair for the game using AI
 * Returns: { civilian: "từ dân thường", spy: "từ gián điệp", category: "chủ đề" }
 */
async function generateKeywordPair() {
  const prompt = `Bạn là quản trò của trò chơi "Ai là gián điệp" (Spy Game). 
Hãy tạo một cặp từ khóa cho trò chơi. Hai từ phải thuộc cùng chủ đề nhưng khác nhau, đủ gần để khó phân biệt nhưng đủ khác để người chơi thông minh có thể nhận ra.

Ví dụ: 
- "Phở" và "Bún bò Huế" (cùng là món nước nhưng khác nhau)
- "Bác sĩ" và "Y tá" (cùng ngành y nhưng khác nhau)
- "Sân bay" và "Nhà ga" (cùng là nơi đi lại)

Trả lời ĐÚNG FORMAT JSON (không có markdown):
{"civilian": "từ cho dân thường", "spy": "từ cho gián điệp", "category": "tên chủ đề"}`;

  const result = await callGemini(prompt);
  
  if (result) {
    try {
      // Try to parse JSON from result
      const jsonMatch = result.match(/\{[^}]+\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse Gemini response, using fallback');
    }
  }

  // Fallback: use built-in word lists
  return generateFallbackKeywordPair();
}

/**
 * Generate keyword from built-in lists (fallback)
 */
function generateFallbackKeywordPair() {
  const categories = Object.keys(WORD_LISTS);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const words = WORD_LISTS[category];
  
  // Pick two different words from the same category
  const idx1 = Math.floor(Math.random() * words.length);
  let idx2 = Math.floor(Math.random() * words.length);
  while (idx2 === idx1) {
    idx2 = Math.floor(Math.random() * words.length);
  }

  return {
    civilian: words[idx1],
    spy: words[idx2],
    category: category
  };
}

/**
 * Generate a single keyword (for simple mode - spy doesn't know the word)
 */
async function generateSingleKeyword() {
  const prompt = `Bạn là quản trò trò chơi "Ai là gián điệp". Hãy chọn MỘT từ khóa thú vị cho chủ đề ngẫu nhiên.
Trả lời ĐÚNG FORMAT JSON (không có markdown):
{"keyword": "từ khóa", "category": "chủ đề", "hint": "gợi ý ngắn về chủ đề"}`;

  const result = await callGemini(prompt);
  
  if (result) {
    try {
      const jsonMatch = result.match(/\{[^}]+\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('Failed to parse Gemini response');
    }
  }

  // Fallback
  const categories = Object.keys(WORD_LISTS);
  const category = categories[Math.floor(Math.random() * categories.length)];
  const words = WORD_LISTS[category];
  const keyword = words[Math.floor(Math.random() * words.length)];
  return { keyword, category, hint: `Chủ đề: ${category}` };
}

/**
 * AI game master - generate a discussion question
 */
async function generateQuestion(keyword, round) {
  const prompt = `Bạn là quản trò trò chơi "Ai là gián điệp". Từ khóa bí mật hiện tại là "${keyword}".
Hãy đặt 1 câu hỏi thảo luận cho vòng ${round}. Câu hỏi phải liên quan đến từ khóa nhưng KHÔNG được tiết lộ trực tiếp từ khóa.
Chỉ trả lời câu hỏi, không giải thích gì thêm.`;

  const result = await callGemini(prompt);
  return result || `Mô tả từ khóa của bạn bằng 3 từ (vòng ${round})`;
}

/**
 * AI analyze chat to find potential spy
 */
async function analyzeChat(messages, keyword) {
  if (!messages || messages.length < 3) return null;

  const chatLog = messages.map(m => `${m.name}: ${m.text}`).join('\n');
  const prompt = `Bạn đang phân tích cuộc trò chuyện trong trò chơi "Ai là gián điệp". 
Từ khóa bí mật là "${keyword}". Gián điệp KHÔNG biết từ khóa này.

Cuộc trò chuyện:
${chatLog}

Dựa trên câu trả lời, ai có khả năng là gián điệp nhất? Tại sao?
Trả lời ngắn gọn trong 2-3 câu bằng tiếng Việt.`;

  return await callGemini(prompt);
}

console.log('✅ Gemini AI module loaded');
