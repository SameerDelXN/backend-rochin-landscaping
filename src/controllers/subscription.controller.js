const asyncHandler = require('../middlewares/async');
const ErrorResponse = require('../utils/errorResponse');
const Tenant = require('../models/tenant.model');
const SystemSetting = require('../models/SystemSetting');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function envGetPriceId(planKey, billingCycle) {
  const map = {
    basic: {
      monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      yearly: process.env.STRIPE_PRICE_BASIC_YEARLY,
    },
    premium: {
      monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY,
    },
    enterprise: {
      monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
    },
  };
  const priceId = map[planKey]?.[billingCycle];
  if (!priceId) {
    const keyName = `STRIPE_PRICE_${String(planKey).toUpperCase()}_${String(billingCycle).toUpperCase()}`;
    throw new Error(`Missing env var ${keyName} for plan=${planKey}, cycle=${billingCycle}`);
  }
  return priceId;
}

// Resolve Stripe priceId from SystemSetting.subscription_plans
async function resolvePriceId(planKey, billingCycle) {
  const setting = await SystemSetting.getSetting('subscription_plans');
  const plan = setting?.value?.[planKey];
  const fromSetting = plan?.prices?.[billingCycle]
    || (billingCycle === 'monthly' ? plan?.stripePriceMonthly : plan?.stripePriceYearly);
  if (fromSetting) return fromSetting;
  // Fallback to env mapping
  return envGetPriceId(planKey, billingCycle);
}

// Build the Tenant App base URL for redirects using tenant subdomain.
// Priority:
// 1) If TENANT_APP_BASE_URL contains {SUBDOMAIN}, replace it.
// 2) If TENANT_APP_BASE_URL is a full URL without placeholder, use it as-is.
// 3) Fallback to local dev pattern http://<subdomain>:3000
function resolveTenantAppBaseUrl(tenant, req) {
  const sub = tenant?.subdomain || 'localhost';
  const tpl = process.env.TENANT_APP_BASE_URL;
  if (tpl && tpl.includes('{SUBDOMAIN}')) {
    return tpl.replace('{SUBDOMAIN}', sub);
  }
  if (tpl) {
    return tpl;
  }
  // Attempt to preserve current scheme if available
  const scheme = (req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http');
  return `${scheme}://${sub}:3000`;
}

exports.createCheckoutSession = asyncHandler(async (req, res, next) => {
  const { planKey, billingCycle = 'monthly' } = req.body;
  if (!['monthly', 'yearly'].includes(billingCycle)) {
    return next(new ErrorResponse('Invalid billingCycle', 400));
  }

  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  if (!tenantId) return next(new ErrorResponse('Tenant context not found', 400));

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return next(new ErrorResponse('Tenant not found', 404));

  let stripeCustomerId = tenant.stripeCustomerId;

  // Check if we have a customer ID and if it's valid
  if (stripeCustomerId) {
    try {
      // Try to retrieve the customer from Stripe
      await stripe.customers.retrieve(stripeCustomerId);
      console.log(`Using existing Stripe customer: ${stripeCustomerId}`);
    } catch (error) {
      // Customer doesn't exist, create a new one
      console.log(`Stripe customer ${stripeCustomerId} not found, creating new one...`);
      const customer = await stripe.customers.create({
        name: tenant.name,
        email: tenant.email,
        metadata: { 
          tenantId: tenant._id.toString(), 
          subdomain: tenant.subdomain,
          previousInvalidCustomerId: stripeCustomerId
        }
      });
      stripeCustomerId = customer.id;
      tenant.stripeCustomerId = customer.id;
      await tenant.save();
    }
  } else {
    // No customer ID, create new one
    const customer = await stripe.customers.create({
      name: tenant.name,
      email: tenant.email,
      metadata: { tenantId: tenant._id.toString(), subdomain: tenant.subdomain }
    });
    stripeCustomerId = customer.id;
    tenant.stripeCustomerId = customer.id;
    await tenant.save();
  }

  // Validate plan exists in settings, unless it's one of legacy defaults
  const plansSetting = await SystemSetting.getSetting('subscription_plans');
  const isLegacy = ['basic', 'premium', 'enterprise'].includes(planKey);
  if (!plansSetting?.value?.[planKey] && !isLegacy) {
    return next(new ErrorResponse('Invalid or unavailable planKey', 400));
  }

  let price;
  try {
    price = await resolvePriceId(planKey, billingCycle);
  } catch (e) {
    return next(new ErrorResponse(e.message || 'Price not configured for this plan/cycle', 500));
  }

  // Validate that the Stripe Price is active
  try {
    const priceObj = await stripe.prices.retrieve(price);
    if (!priceObj?.active) {
      return next(new ErrorResponse('The specified Stripe Price is inactive. Please use an active price ID.', 400));
    }
  } catch (e) {
    return next(new ErrorResponse('Invalid Stripe Price ID configured for this plan/cycle', 400));
  }

  // If tenant already has an active subscription, update it in-place with proration so only the difference is charged
  if (tenant.stripeSubscriptionId) {
    try {
      const existing = await stripe.subscriptions.retrieve(tenant.stripeSubscriptionId);
      if (existing && ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(existing.status)) {
        const itemId = existing.items?.data?.[0]?.id;
        if (!itemId) return next(new ErrorResponse('Unable to resolve subscription item to update', 500));
        await stripe.subscriptions.update(tenant.stripeSubscriptionId, {
          cancel_at_period_end: false,
          proration_behavior: 'create_prorations',
          billing_cycle_anchor: 'unchanged',
          payment_behavior: 'create_invoice',
          proration_date: Math.floor(Date.now() / 1000),
          items: [{ id: itemId, price }],
          metadata: { tenantId: tenant._id.toString(), planKey, billingCycle }
        });
        return res.status(200).json({ success: true, message: 'Subscription updated with proration' });
      }
    } catch (e) {
      // fall through to Checkout if retrieval/update fails
    }
  }

  // Adoption: if we don't have tenant.stripeSubscriptionId yet but the Stripe customer already has an active subscription,
  // adopt it and update in-place with proration to avoid full-price new subscription
  if (!tenant.stripeSubscriptionId && stripeCustomerId) {
    try {
      const list = await stripe.subscriptions.list({ customer: stripeCustomerId, status: 'all', limit: 10 });
      const existing = (list.data || []).find(s => ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'].includes(s.status));
      if (existing) {
        const itemId = existing.items?.data?.[0]?.id;
        if (itemId) {
          await stripe.subscriptions.update(existing.id, {
            cancel_at_period_end: false,
            proration_behavior: 'create_prorations',
            billing_cycle_anchor: 'unchanged',
            payment_behavior: 'create_invoice',
            proration_date: Math.floor(Date.now() / 1000),
            items: [{ id: itemId, price }],
            metadata: { tenantId: tenant._id.toString(), planKey, billingCycle }
          });
          tenant.stripeSubscriptionId = existing.id;
          await tenant.save();
          return res.status(200).json({ success: true, message: 'Subscription updated with proration' });
        }
      }
    } catch (e) {
      // continue to Checkout if adoption fails
    }
  }

  const successUrlBase = resolveTenantAppBaseUrl(tenant, req);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: stripeCustomerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${successUrlBase}/admin/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${successUrlBase}/admin/subscriptions/cancelled`,
    metadata: { tenantId: tenant._id.toString(), planKey, billingCycle },
    subscription_data: { metadata: { tenantId: tenant._id.toString(), planKey, billingCycle } }
  });

  res.status(200).json({ success: true, sessionId: session.id, url: session.url });
});

// Start first payment via UPI (one-time), then create subscription in webhook
exports.createUpiInitCheckoutSession = asyncHandler(async (req, res, next) => {
  const { planKey, billingCycle = 'monthly' } = req.body;
  if (!['basic', 'premium', 'enterprise'].includes(planKey)) {
    return next(new ErrorResponse('Invalid planKey', 400));
  }
  if (!['monthly', 'yearly'].includes(billingCycle)) {
    return next(new ErrorResponse('Invalid billingCycle', 400));
  }

  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  if (!tenantId) return next(new ErrorResponse('Tenant context not found', 400));

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return next(new ErrorResponse('Tenant not found', 404));

  let price;
  try {
    price = getPriceId(planKey, billingCycle);
  } catch (e) {
    return next(new ErrorResponse(e.message || 'Price not configured for this plan/cycle', 500));
  }

  const successUrlBase = resolveTenantAppBaseUrl(tenant, req);

  // Create a one-time payment Checkout session using UPI
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['upi'],
    customer_creation: 'always',
    line_items: [{ price, quantity: 1 }],
    success_url: `${successUrlBase}/admin/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${successUrlBase}/admin/subscriptions/cancelled`,
    payment_intent_data: {
      // Attempt to save for future off-session use, but UPI usually does not support this
      setup_future_usage: 'off_session',
      metadata: { tenantId: tenant._id.toString(), planKey, billingCycle }
    },
    metadata: { tenantId: tenant._id.toString(), planKey, billingCycle }
  });

  res.status(200).json({ success: true, sessionId: session.id, url: session.url });
});

exports.createPortalSession = asyncHandler(async (req, res, next) => {
  const tenantId = req.user?.tenantId?._id || req.user?.tenantId;
  if (!tenantId) return next(new ErrorResponse('Tenant context not found', 400));

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) return next(new ErrorResponse('Tenant not found', 404));
  if (!tenant.stripeCustomerId) return next(new ErrorResponse('No Stripe customer linked to tenant', 400));

  const returnUrl = resolveTenantAppBaseUrl(tenant, req);
  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${returnUrl}/admin/subscriptions`
  });
  res.status(200).json({ success: true, url: session.url });
});

// Return superadmin-defined subscription plans from system settings
exports.getPlans = asyncHandler(async (req, res, next) => {
  // Anyone under tenant admin can read available plans
  let setting = await SystemSetting.getSetting('subscription_plans');

  // If not configured yet, seed sane defaults so tenants are not blocked
  if (!setting || !setting.value) {
    // In production, do NOT auto-seed plans. Super admin must configure them explicitly.
    if (process.env.NODE_ENV === 'production') {
      return res.status(200).json({ success: true, data: [] });
    }

    // In non-production environments, seed developer-friendly defaults to simplify testing
    const defaultPlans = {
      basic: {
        price: 29,
        features: ['5 Users', '100 Appointments', '200 Customers', 'Email Support'],
        limits: { users: 5, appointments: 100, customers: 200 }
      },
      premium: {
        price: 79,
        features: ['25 Users', '500 Appointments', '1000 Customers', 'Priority Support'],
        limits: { users: 25, appointments: 500, customers: 1000 }
      },
      enterprise: {
        price: 199,
        features: ['Unlimited Users', 'Unlimited Appointments', 'Unlimited Customers', '24/7 Support'],
        limits: { users: -1, appointments: -1, customers: -1 }
      }
    };

    setting = await SystemSetting.setSetting(
      'subscription_plans',
      defaultPlans,
      {
        category: 'payment',
        description: 'Available subscription plans',
        isPublic: true,
        dataType: 'object'
      }
    );
  }

  // Transform object map to array with keys and monthly/yearly for UI
  const plansObj = setting.value || {};
  const plans = Object.entries(plansObj).map(([key, val]) => ({
    key,
    name: val.name || key.charAt(0).toUpperCase() + key.slice(1),
    priceMonthly: Number(val.priceMonthly != null ? val.priceMonthly : val.price) || 0,
    priceYearly: Number(val.priceYearly != null ? val.priceYearly : (Number(val.priceMonthly || val.price || 0) * 10)) || 0,
    features: Array.isArray(val.features) ? val.features : [],
    limits: val.limits || {},
    currency: (val.currency || 'USD').toUpperCase()
  }));

  return res.status(200).json({ success: true, data: plans });
});

// Verify a checkout session and update tenant subscription immediately (useful if webhooks are delayed)
exports.verifyCheckout = asyncHandler(async (req, res, next) => {
  const { session_id } = req.query;
  if (!session_id) return next(new ErrorResponse('Missing session_id', 400));

  // Retrieve session with expanded subscription
  const session = await stripe.checkout.sessions.retrieve(session_id, { expand: ['subscription', 'subscription.items'] });
  if (!session) return next(new ErrorResponse('Session not found', 404));
  if (!session.metadata?.tenantId) return next(new ErrorResponse('Missing tenant metadata on session', 400));

  const tenant = await Tenant.findById(session.metadata.tenantId);
  if (!tenant) return next(new ErrorResponse('Tenant not found', 404));

  // Only handle subscription sessions
  if (session.mode !== 'subscription' || !session.subscription) {
    return res.status(200).json({ success: true, message: 'No subscription to verify for this session' });
  }

  const sub = typeof session.subscription === 'string' ? await stripe.subscriptions.retrieve(session.subscription) : session.subscription;
  const firstItem = sub?.items?.data?.[0];
  const price = firstItem?.price;
  const interval = price?.recurring?.interval; // 'month' | 'year'
  const derivedBillingCycle = interval === 'year' ? 'yearly' : 'monthly';
  const amount = typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : undefined;
  const currency = price?.currency ? price.currency.toUpperCase() : undefined;
  const periodStart = sub?.current_period_start ? new Date(sub.current_period_start * 1000) : new Date();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end * 1000) : undefined;

  tenant.subscription = tenant.subscription || {};
  tenant.subscription.plan = (session.metadata.planKey || tenant.subscription.plan || 'basic').toLowerCase();
  tenant.subscription.billingCycle = session.metadata.billingCycle || derivedBillingCycle || tenant.subscription.billingCycle || 'monthly';
  tenant.subscription.status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : tenant.subscription.status || 'inactive';
  if (amount != null) tenant.subscription.amount = amount;
  if (currency) tenant.subscription.currency = currency;
  tenant.subscription.startDate = periodStart;
  if (periodEnd) tenant.subscription.endDate = periodEnd;
  tenant.stripeSubscriptionId = sub.id;

  await tenant.save();
  return res.status(200).json({ success: true, data: { subscriptionId: sub.id, status: tenant.subscription.status } });
});
