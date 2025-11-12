import nodemailer from 'nodemailer';

/**
 * Email Utility for OAuth-based Authentication
 * Sends welcome emails and notifications to users
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
  sendWelcomeEmail
};
