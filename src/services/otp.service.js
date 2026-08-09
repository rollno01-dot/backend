// services/otp.service.js - UPDATED WITH YOUR MSG91 CONFIG
const crypto = require('crypto');
const axios = require('axios');
const OTP = require('../models/OTP');

class OTPService {
  constructor() {
    // ✅ Read from environment variables
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.templateId = process.env.MSG91_TEMPLATE_ID;
    this.senderId = process.env.MSG91_SENDER_ID || 'docmytime';
    this.route = process.env.MSG91_ROUTE || '4';
    this.country = process.env.MSG91_COUNTRY || '91';
    
    // ✅ API Endpoint
    this.smsBaseUrl = 'https://api.msg91.com/api/v5/flow/';
    
    this.isMsg91Configured = !!(this.authKey && this.authKey.trim() !== '' && this.templateId);
    
    // Rate limiting
    this.rateLimitStore = new Map();
    this.RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
    this.MAX_REQUESTS_PER_WINDOW = 3;
    
    if (this.isMsg91Configured) {
      console.log(`✅ MSG91 SMS Configured`);
      console.log(`📝 Template ID: ${this.templateId}`);
      console.log(`📱 Sender ID: ${this.senderId}`);
      console.log(`🛣️ Route: ${this.route}`);
    } else {
      console.log(`⚠️ MSG91 SMS: Not configured (using dev mode)`);
      if (!this.authKey) console.log(`   - Missing: MSG91_AUTH_KEY`);
      if (!this.templateId) console.log(`   - Missing: MSG91_TEMPLATE_ID`);
    }
  }

  generateOTP() {
    return crypto.randomInt(100000, 999999).toString();
  }

  isValidIndianNumber(phoneNumber) {
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const indianRegex = /^[6-9]\d{9}$/;
    return indianRegex.test(cleanNumber);
  }

  cleanPhoneNumber(phoneNumber) {
    let cleaned = phoneNumber.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('+91')) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith('91')) {
      cleaned = cleaned.substring(2);
    }
    return cleaned;
  }

  checkRateLimit(phoneNumber) {
    const now = Date.now();
    const key = phoneNumber;
    
    if (!this.rateLimitStore.has(key)) {
      this.rateLimitStore.set(key, [now]);
      return true;
    }
    
    const timestamps = this.rateLimitStore.get(key);
    const recentRequests = timestamps.filter(t => now - t < this.RATE_LIMIT_WINDOW);
    
    if (recentRequests.length >= this.MAX_REQUESTS_PER_WINDOW) {
      return false;
    }
    
    recentRequests.push(now);
    this.rateLimitStore.set(key, recentRequests);
    return true;
  }

  showOTPInConsole(phoneNumber, otp) {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║              🔑 OTP GENERATED                       ║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  📱 Phone:    ${phoneNumber}`);
    console.log(`║  🔐 OTP:      ${otp}  👈 USE THIS`);
    console.log(`║  ⏰ Valid:    10 minutes`);
    console.log(`║  📨 Status:   ${this.isMsg91Configured ? 'Sending SMS...' : 'Development Mode'}`);
    console.log(`║  📝 Template: ${this.templateId || 'Not set'}`);
    console.log(`║  📱 Sender:   ${this.senderId}`);
    console.log(`║  🛣️ Route:    ${this.route}`);
    console.log('╚═══════════════════════════════════════════════════════╝\n');
  }

  async saveOTPToDatabase(phoneNumber, otp) {
    try {
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      await OTP.deleteMany({ phoneNumber: cleanNumber, verified: false });
      
      const otpRecord = new OTP({
        phoneNumber: cleanNumber,
        otp: otp,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      await otpRecord.save();
      console.log(`💾 OTP saved to database for ${cleanNumber}`);
      return otpRecord;
    } catch (error) {
      console.error('❌ Database save error:', error.message);
      throw error;
    }
  }

  /**
   * Send OTP via SMS using MSG91 Flow API
   */
  async sendOTPviaSMS(phoneNumber, otp) {
    try {
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      const fullNumber = `${this.country}${cleanNumber}`;

      // ✅ MSG91 API v5 Flow API
      const requestData = {
        sender: this.senderId,
        mobiles: fullNumber,
        authkey: this.authKey,
        template_id: this.templateId,
        route: this.route,
        OTP: otp,
        // Additional variables for template
        var1: otp,
        var2: '10' // validity in minutes
      };

      console.log(`📤 Sending SMS OTP to ${phoneNumber}...`);
      console.log(`📝 Template: ${this.templateId}`);
      console.log(`📱 Full Number: ${fullNumber}`);

      const response = await axios.post(
        `${this.smsBaseUrl}${this.templateId}`,
        requestData,
        {
          headers: { 
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      console.log('📊 SMS Response:', JSON.stringify(response.data, null, 2));

      // MSG91 v5 response format
      if (response.data && response.data.type === 'success') {
        console.log(`✅ SMS OTP sent to ${phoneNumber}`);
        return { 
          success: true, 
          response: response.data,
          messageId: response.data.message_id || response.data.msg_id
        };
      } else if (response.data && response.data.type === 'error') {
        console.log(`❌ SMS Error: ${response.data.message}`);
        return { 
          success: false, 
          error: response.data.message || 'Failed to send SMS'
        };
      } else {
        return { 
          success: false, 
          error: 'Unknown response from MSG91'
        };
      }

    } catch (error) {
      console.log(`❌ SMS Error: ${error.message}`);
      if (error.response) {
        console.log('📊 Error Response:', JSON.stringify(error.response.data, null, 2));
        return { 
          success: false, 
          error: error.response.data.message || error.message
        };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Alternative method using MSG91 Send SMS API
   */
  async sendOTPviaSendSMS(phoneNumber, otp) {
    try {
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      const fullNumber = `${this.country}${cleanNumber}`;

      // Alternative: MSG91 Send SMS API
      const requestData = {
        authkey: this.authKey,
        mobiles: fullNumber,
        message: `Your OTP for DocMyTime login is ${otp}. Valid for 10 minutes.`,
        sender: this.senderId,
        route: this.route,
        country: this.country
      };

      console.log(`📤 Sending SMS via SendSMS API to ${phoneNumber}...`);

      const response = await axios.post(
        'https://api.msg91.com/api/sendhttp.php',
        new URLSearchParams(requestData).toString(),
        {
          headers: { 
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      );

      console.log('📊 SendSMS Response:', response.data);

      if (response.data && response.data.startsWith('SUCCESS')) {
        return { success: true, response: response.data };
      } else {
        return { success: false, error: response.data };
      }

    } catch (error) {
      console.log(`❌ SendSMS Error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send OTP - Main Method
   */
  async sendOTP(phoneNumber, otp) {
    try {
      if (!phoneNumber) {
        throw new Error('Phone number is required');
      }

      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      
      if (!this.isValidIndianNumber(cleanNumber)) {
        throw new Error('Invalid Indian phone number. Must be 10 digits starting with 6-9');
      }

      // Rate Limit Check
      if (!this.checkRateLimit(cleanNumber)) {
        throw new Error('Rate limit exceeded. Please try again after 1 minute');
      }

      // Save OTP to database
      await this.saveOTPToDatabase(cleanNumber, otp);

      // Show OTP in console
      this.showOTPInConsole(phoneNumber, otp);

      // If MSG91 not configured, return dev mode
      if (!this.isMsg91Configured) {
        console.log(`ℹ️ Development Mode: OTP shown above`);
        return {
          success: true,
          message: 'OTP generated (dev mode)',
          devOtp: otp
        };
      }

      // Try Flow API first
      let smsResult = await this.sendOTPviaSMS(phoneNumber, otp);
      
      // If Flow API fails, try SendSMS API as fallback
      if (!smsResult.success) {
        console.log(`🔄 Flow API failed, trying SendSMS API as fallback...`);
        smsResult = await this.sendOTPviaSendSMS(phoneNumber, otp);
      }

      return {
        success: smsResult.success,
        message: smsResult.success ? 'OTP sent successfully' : 'Failed to send OTP',
        ...(smsResult.success ? {} : { error: smsResult.error }),
        devOtp: otp
      };

    } catch (error) {
      console.error('❌ OTP Send Error:', error.message);
      return {
        success: false,
        message: error.message || 'Failed to send OTP',
        error: error.message
      };
    }
  }

  /**
   * Verify OTP from Database
   */
  async verifyOTP(phoneNumber, otpCode) {
    try {
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      
      console.log(`🔍 Verifying OTP for ${cleanNumber}...`);

      const otpRecord = await OTP.findOne({
        phoneNumber: cleanNumber,
        otp: otpCode,
        verified: false
      });

      if (!otpRecord) {
        return {
          success: false,
          message: 'Invalid OTP'
        };
      }

      if (otpRecord.isExpired()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return {
          success: false,
          message: 'OTP has expired. Please request a new one.'
        };
      }

      if (otpRecord.isMaxAttemptsReached()) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return {
          success: false,
          message: 'Too many failed attempts. Please request a new OTP.'
        };
      }

      await otpRecord.incrementAttempts();
      otpRecord.verified = true;
      await otpRecord.save();

      console.log(`✅ OTP verified successfully for ${cleanNumber}`);
      
      return {
        success: true,
        message: 'OTP verified successfully'
      };

    } catch (error) {
      console.error('❌ Verify OTP Error:', error.message);
      return {
        success: false,
        message: 'Failed to verify OTP'
      };
    }
  }

  /**
   * Resend OTP
   */
  async resendOTP(phoneNumber) {
    try {
      const cleanNumber = this.cleanPhoneNumber(phoneNumber);
      
      const resendKey = `resend_${cleanNumber}`;
      const lastResend = this.rateLimitStore.get(resendKey);
      
      if (lastResend && Date.now() - lastResend < 30000) {
        return {
          success: false,
          message: 'Please wait 30 seconds before requesting a new OTP'
        };
      }
      
      this.rateLimitStore.set(resendKey, Date.now());

      const newOTP = this.generateOTP();
      return await this.sendOTP(phoneNumber, newOTP);

    } catch (error) {
      console.error('❌ Resend OTP Error:', error.message);
      return {
        success: false,
        message: error.message || 'Failed to resend OTP'
      };
    }
  }

  clearRateLimits() {
    this.rateLimitStore.clear();
  }
}

module.exports = new OTPService();