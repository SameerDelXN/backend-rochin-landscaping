const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middlewares/auth');
const superAdminController = require('../controllers/super-admin.controller');
const subscriptionPlansController = require('../controllers/subscription-plans.controller');

// Apply super admin authorization to all routes
router.use(protect);
router.use(authorize('superAdmin'));

// Dashboard & Analytics
router.get('/dashboard-stats', superAdminController.getDashboardStats);
router.get('/analytics/tenants', superAdminController.getTenantAnalytics);
router.get('/analytics/revenue', superAdminController.getRevenueAnalytics);
router.get('/analytics/users', superAdminController.getUserAnalytics);

// Tenant Management
router.get('/tenants', superAdminController.getTenants);
router.get('/tenants/:id', superAdminController.getTenant);
router.post('/tenants', superAdminController.createTenant);
router.put('/tenants/:id', superAdminController.updateTenant);
router.delete('/tenants/:id', superAdminController.deleteTenant);
router.post('/tenants/:id/suspend', superAdminController.suspendTenant);
router.post('/tenants/:id/activate', superAdminController.activateTenant);
router.get('/tenants/:id/users', superAdminController.getTenantUsers);
router.get('/tenants/:id/activity', superAdminController.getTenantActivity);
router.get('/tenants/:id/billing', superAdminController.getTenantBilling);

// User Management
router.get('/users', superAdminController.getAllUsers);
router.get('/users/:id', superAdminController.getUser);
router.post('/users', superAdminController.createUser);
router.put('/users/:id', superAdminController.updateUser);
router.delete('/users/:id', superAdminController.deleteUser);
router.post('/users/:id/suspend', superAdminController.suspendUser);
router.post('/users/:id/activate', superAdminController.activateUser);

// Billing & Subscriptions
router.get('/billing/subscriptions', superAdminController.getSubscriptions);
router.get('/billing/invoices', superAdminController.getInvoices);
router.get('/billing/revenue', superAdminController.getRevenue);
router.post('/billing/create-invoice', superAdminController.createInvoice);
router.put('/billing/subscriptions/:id', superAdminController.updateSubscription);
router.post('/billing/subscriptions/:id/cancel', superAdminController.cancelSubscription);

// System Settings
router.get('/settings', superAdminController.getSystemSettings);
router.put('/settings', superAdminController.updateSystemSettings);
router.get('/settings/email', superAdminController.getEmailSettings);
router.put('/settings/email', superAdminController.updateEmailSettings);
router.get('/settings/payment', superAdminController.getPaymentSettings);
router.put('/settings/payment', superAdminController.updatePaymentSettings);

// Subscription plans management
router.get('/settings/subscription-plans', subscriptionPlansController.getSubscriptionPlans);
router.put('/settings/subscription-plans', subscriptionPlansController.updateSubscriptionPlans);

// Activity Logs
router.get('/activity-logs', superAdminController.getActivityLogs);
router.get('/activity-logs/tenants', superAdminController.getTenantLogs);
router.get('/activity-logs/users', superAdminController.getUserLogs);
router.get('/activity-logs/system', superAdminController.getSystemLogs);
router.delete('/activity-logs', superAdminController.clearActivityLogs);

// System Health & Monitoring
router.get('/system/health', superAdminController.getSystemHealth);
router.get('/system/performance', superAdminController.getSystemPerformance);
router.get('/system/errors', superAdminController.getSystemErrors);
router.post('/system/backup', superAdminController.createBackup);
router.get('/system/backups', superAdminController.getBackups);

// Notifications & Alerts
router.get('/notifications', superAdminController.getNotifications);
router.post('/notifications', superAdminController.createNotification);
router.put('/notifications/:id', superAdminController.updateNotification);
router.delete('/notifications/:id', superAdminController.deleteNotification);
router.post('/notifications/broadcast', superAdminController.broadcastNotification);

// Reports
router.get('/reports/tenants', superAdminController.generateTenantReport);
router.get('/reports/revenue', superAdminController.generateRevenueReport);
router.get('/reports/users', superAdminController.generateUserReport);
router.get('/reports/activity', superAdminController.generateActivityReport);
router.post('/reports/export', superAdminController.exportReport);

module.exports = router; 