// const nodemailer = require('nodemailer');

// /**
//  * Send an email using nodemailer
//  * For development: Uses Ethereal email test accounts
//  * For production: Uses configured email service
//  */
// const sendEmail = async (options) => {
//   try {
//     let transporter;
    
//     // Check if we're in production and have email credentials
//     if (process.env.NODE_ENV === 'production' && 
//         process.env.EMAIL_USERNAME && 
//         process.env.EMAIL_PASSWORD) {
//       // Use real email service in production
//       transporter = nodemailer.createTransport({
//         service: process.env.EMAIL_SERVICE || 'gmail',
//         auth: {
//           user: process.env.EMAIL_USERNAME,
//           pass: process.env.EMAIL_PASSWORD
//         }
//       });
      
//       console.log('Using production email configuration');
//     } else {
//       // Create test account for development
//       const testAccount = await nodemailer.createTestAccount();
      
//       transporter = nodemailer.createTransport({
//         host: 'smtp.ethereal.email',
//         port: 587,
//         secure: false, // true for 465, false for other ports
//         auth: {
//           user: testAccount.user,
//           pass: testAccount.pass
//         }
//       });
      
//       console.log('Using test email account:', testAccount.user);
//     }

//     // Define email options
//     const mailOptions = {
//       from: `"${process.env.EMAIL_FROM || 'Landscaping API'}" <${process.env.EMAIL_USERNAME || 'noreply@example.com'}>`,
//       to: options.email,
//       subject: options.subject,
//       text: options.message,
//       html: options.html || options.message
//     };

//     // Send email
//     const info = await transporter.sendMail(mailOptions);

//     console.log('Message sent:', info.messageId);
    
//     // If using test account, log preview URL
//     if (info.messageUrl) {
//       console.log('Preview URL:', info.messageUrl);
//     } else if (nodemailer.getTestMessageUrl && info) {
//       console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
//     }
    
//     return info;
//   } catch (error) {
//     console.error('Email error:', error);
//     throw error;
//   }
// };

// module.exports = sendEmail; 



const nodemailer = require('nodemailer');

/**
 * Send an email using nodemailer with real credentials
 */
const sendEmail = async (options) => {
  try {
    // Always use real Gmail credentials if available
    if (process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
      const transporter = nodemailer.createTransport({
        pool: true,
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_PASSWORD,
        },
      });

      console.log('✅ Using real Gmail email configuration');

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM || 'Multi-tenant'}" <${process.env.EMAIL_USERNAME}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html || options.message,
      };

      const info = await transporter.sendMail(mailOptions);

      console.log('📧 Message sent:', info.messageId);
      return info;
    } else {
      throw new Error('Email credentials not provided in environment variables');
    }
  } catch (error) {
    console.error('❌ Email sending error:', error);
    throw error;
  }
};

module.exports = sendEmail;






// const nodemailer = require('nodemailer');

// const sendEmail = async (options) => {
//   try {
//     const transporter = nodemailer.createTransport({
//       host: process.env.SMTP_HOST,
//       port: Number(process.env.SMTP_PORT),
//       secure: false,
//       auth: {
//         user: process.env.SMTP_USER,
//         pass: process.env.EMAIL_PASSWORD,
//       },
//     });

//     console.log('✅ Using Brevo SMTP configuration');

//     const mailOptions = {
//       from: `"${process.env.EMAIL_FROM}" <${process.env.SMTP_USER}>`,
//       to: options.email,
//       subject: options.subject,
//       text: options.message,
//       html: options.html || options.message,
//     };

//     const info = await transporter.sendMail(mailOptions);
//     console.log('📧 Email sent:', info.messageId);

//     return info;
//   } catch (error) {
//     console.error('❌ Email sending error:', error);
//     throw new Error('Email could not be sent');
//   }
// };

// module.exports = sendEmail;
