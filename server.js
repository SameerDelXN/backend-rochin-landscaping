const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middlewares/error');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

// Initialize app
const app = express();

// Import tenant resolution middleware
const { resolveTenant } = require('./src/middlewares/tenantResolver');

// Body parser
// app.use(express.json());
// With this:
app.use(express.json({ limit: '50mb' }));

// CORS must run before all other middleware to ensure headers are present on every response
// Ensure caches/proxies vary on Origin and do not cache API responses
app.use((req, res, next) => {
  if (req.headers.origin) {
    const existingVary = res.getHeader('Vary');
    if (!existingVary) {
      res.setHeader('Vary', 'Origin');
    } else if (typeof existingVary === 'string' && !existingVary.includes('Origin')) {
      res.setHeader('Vary', existingVary + ', Origin');
    }
    // As a safety net, set ACAO early; cors() below will set it too
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Primary CORS configuration - echo request origin
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Tenant-Domain',
    'X-Tenant-Subdomain',
    'x-tenant-id',
    'x-tenant-subdomain',
    'x-tenant-domain',
    'x-all-tenants'
  ]
}));

// Explicitly handle preflight requests with CORS (before any routes)
app.options('*', cors({ origin: true, credentials: true }));

// Cookie parser
app.use(cookieParser());

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Disable if you're handling CORS elsewhere
}));


// Add this before your routes
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/', // Use absolute path for temp files
  createParentPath: true,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB limit (adjust as needed)
    files: 10 // Maximum number of files
  },
  abortOnLimit: false, // Set to false to handle limits gracefully
  safeFileNames: true,
  preserveExtension: true,
  debug: process.env.NODE_ENV === 'development',
  responseOnLimit: 'File size limit has been reached'
}));

// Resolve tenant from subdomain and set context
app.use(resolveTenant);

// API version
const API_PREFIX = '/api/v1';

// Route files
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const appointmentRoutes = require('./src/routes/appointment.routes');
const estimateRoutes = require('./src/routes/estimate.routes');
const serviceRoutes = require('./src/routes/service.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const customerRoutes = require('./src/routes/customer.routes');
const professionalRoutes = require('./src/routes/professional.routes');
const reportRoutes = require('./src/routes/report.routes');
const businessSettingRoutes = require('./src/routes/business-setting.routes');
const galleryRoutes = require('./src/routes/gallery.routes');
const portfolioRoutes = require('./src/routes/portfolio.routes');
const heroImageRoutes = require('./src/routes/hero-image');
const adminRoutes = require('./src/routes/admin.routes');
const subscriptionRoutes = require('./src/routes/subscription.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
const equipmentRoutes = require('./src/routes/equipment.routes');

// Import the contact route
const contactRoutes = require('./src/routes/contact');

// Import the announcements route
const announcementsRoutes = require('./src/routes/announcements');

// Import the message routes
const messageRoutes = require('./src/routes/message.routes');

// Import logo routes
const logoRoutes = require('./src/routes/logo');

// Import property routes
const propertyRoutes = require('./src/routes/property.routes');

// Import tenant routes
const tenantRoutes = require('./src/routes/tenant.routes');

// Import super admin routes
const superAdminRoutes = require('./src/routes/super-admin.routes');

// Mount routers
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/appointments`, appointmentRoutes);
app.use(`${API_PREFIX}/estimates`, estimateRoutes);
app.use(`${API_PREFIX}/services`, serviceRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/customers`, customerRoutes);
app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
app.use(`${API_PREFIX}/professionals`, professionalRoutes);
app.use(`${API_PREFIX}/reports`, reportRoutes);
app.use(`${API_PREFIX}/business-settings`, businessSettingRoutes);
app.use(`${API_PREFIX}/gallery`, galleryRoutes);
app.use(`${API_PREFIX}/portfolio`, portfolioRoutes);
app.use(`${API_PREFIX}/hero-image`, heroImageRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/subscriptions`, subscriptionRoutes);

// Mount super admin routes
app.use(`${API_PREFIX}/super-admin`, superAdminRoutes);

// Mount tenant routes
app.use(`${API_PREFIX}/tenant`, tenantRoutes);

// Mount the contact route here
app.use(`${API_PREFIX}/api/contact`, contactRoutes);

// Mount the announcements route
app.use(`${API_PREFIX}/announcements`, announcementsRoutes);

// Mount the message routes
app.use(`${API_PREFIX}/messages`, messageRoutes);

// Mount the logo routes
app.use(`${API_PREFIX}/logo`, logoRoutes);

// Mount the property routes
app.use(`${API_PREFIX}/properties`, propertyRoutes);

// Mount webhook routes
app.use('/webhook', webhookRoutes);

// Mount equipment routes
app.use(`${API_PREFIX}/equipment`, equipmentRoutes);

// Welcome route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to the Landscaping Service Management API',
    apiDocumentation: `${req.protocol}://${req.get('host')}${API_PREFIX}/docs`,
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log(`UNCAUGHT EXCEPTION! Shutting down...`);
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});
