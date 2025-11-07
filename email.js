import nodemailer from 'nodemailer';
import crypto from 'crypto';

/**
 * Email Utility for User Authentication
 * Handles email verification, password reset, etc.
 */

// Create transporter based on environment
function createTransporter() {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST) {
    console.warn('⚠️  SMTP not configured. Email features disabled.');
    return null;
  }

  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Generate a random token for email verification or password reset
 */
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(email, token, username) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('📧 Email would be sent to:', email, '(SMTP not configured)');
    return { success: false, error: 'SMTP not configured' };
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: '✅ Verify Your Email - DonationBar',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to DonationBar!</h1>
            </div>
            <div class="content">
              <h2>Hi ${username}!</h2>
              <p>Thank you for registering. Please verify your email address to get started.</p>
              <p style="text-align: center;">
                <a href="${verificationUrl}" class="button">✅ Verify Email</a>
              </p>
              <p style="color: #666; font-size: 14px;">
                Or copy this link to your browser:<br>
                <code style="background: #e0e0e0; padding: 5px; display: inline-block; margin-top: 5px; word-break: break-all;">${verificationUrl}</code>
              </p>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                This link will expire in 24 hours.
              </p>
            </div>
            <div class="footer">
              <p>DonationBar - Stream Donation Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log(`📧 Verification email sent to: ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email, token, username) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('📧 Password reset email would be sent to:', email, '(SMTP not configured)');
    return { success: false, error: 'SMTP not configured' };
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: '🔑 Reset Your Password - DonationBar',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Reset Your Password</h1>
            </div>
            <div class="content">
              <h2>Hi ${username}!</h2>
              <p>We received a request to reset your password. Click the button below to create a new password:</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p style="color: #666; font-size: 14px;">
                Or copy this link to your browser:<br>
                <code style="background: #e0e0e0; padding: 5px; display: inline-block; margin-top: 5px; word-break: break-all;">${resetUrl}</code>
              </p>
              <div class="warning">
                <strong>⚠️ Security Notice:</strong><br>
                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
              </div>
              <p style="color: #666; font-size: 12px; margin-top: 30px;">
                This link will expire in 1 hour for security reasons.
              </p>
            </div>
            <div class="footer">
              <p>DonationBar - Stream Donation Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log(`📧 Password reset email sent to: ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send welcome email after successful registration
 */
export async function sendWelcomeEmail(email, username) {
  const transporter = createTransporter();
  if (!transporter) {
    console.log('📧 Welcome email would be sent to:', email, '(SMTP not configured)');
    return { success: false, error: 'SMTP not configured' };
  }

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: '🎉 Welcome to DonationBar!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .feature { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #667eea; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to DonationBar!</h1>
            </div>
            <div class="content">
              <h2>Hi ${username}!</h2>
              <p>Your account has been successfully created and verified. You're all set to start receiving donations!</p>
              
              <h3>🚀 Quick Start Guide:</h3>
              <div class="feature">
                <strong>1️⃣ Set Up Your Donation Page</strong><br>
                Configure your donation goal and customize your overlay in the admin panel.
              </div>
              <div class="feature">
                <strong>2️⃣ Configure ECPay</strong><br>
                Add your ECPay merchant credentials to start accepting payments.
              </div>
              <div class="feature">
                <strong>3️⃣ Add to OBS</strong><br>
                Use your unique overlay URL in OBS Browser Source.
              </div>
              
              <p style="text-align: center;">
                <a href="${baseUrl}/admin" class="button">Go to Admin Panel</a>
              </p>
              
              <p style="color: #666; font-size: 14px; margin-top: 30px;">
                Need help? Check out our documentation or contact support.
              </p>
            </div>
            <div class="footer">
              <p>DonationBar - Stream Donation Management</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log(`📧 Welcome email sent to: ${email}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error);
    return { success: false, error: error.message };
  }
}

export default {
  generateToken,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail
};
