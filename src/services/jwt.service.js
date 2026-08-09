const jwt = require('jsonwebtoken');

class JWTService {
  generateToken(payload) {
    return jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  decodeToken(token) {
    return jwt.decode(token);
  }
}

module.exports = new JWTService();