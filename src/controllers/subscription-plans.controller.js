const asyncHandler = require('../middlewares/async');
const ErrorResponse = require('../utils/errorResponse');
const SystemSetting = require('../models/SystemSetting');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// @desc    Get subscription plans (from SystemSetting)
// @route   GET /api/v1/super-admin/settings/subscription-plans
// @access  Super Admin
exports.getSubscriptionPlans = asyncHandler(async (req, res, next) => {
  const setting = await SystemSetting.getSetting('subscription_plans');
  res.status(200).json({ success: true, data: setting?.value || {} });
});

// @desc    Update subscription plans (write to SystemSetting)
// @route   PUT /api/v1/super-admin/settings/subscription-plans
// @access  Super Admin
exports.updateSubscriptionPlans = asyncHandler(async (req, res, next) => {
  // Incoming payload: { [planKey]: { name?, price?, priceMonthly?, priceYearly?, features?, limits?, currency? } }
  const incoming = req.body;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return next(new ErrorResponse('Invalid plans payload', 400));
  }

  // Load existing setting to preserve previously created Stripe IDs
  const existingSetting = await SystemSetting.getSetting('subscription_plans');
  const existingPlans = existingSetting?.value || {};

  const outPlans = {};

  // Helper to coerce number safely
  const toCents = (n) => Math.round((Number(n) || 0) * 100);

  for (const [planKey, planVal] of Object.entries(incoming)) {
    const prev = existingPlans[planKey] || {};
    const name = planVal.name || prev.name || planKey.charAt(0).toUpperCase() + planKey.slice(1);
    const currency = (planVal.currency || prev.currency || 'usd').toLowerCase();

    // Support legacy single price field as monthly
    const monthlyAmount = (planVal.priceMonthly != null ? Number(planVal.priceMonthly) : (planVal.price != null ? Number(planVal.price) : prev.priceMonthly)) || 0;
    // If yearly not provided, default to 10x monthly (approx. 2 months free)
    const yearlyAmount = (planVal.priceYearly != null ? Number(planVal.priceYearly) : (prev.priceYearly != null ? Number(prev.priceYearly) : Number(monthlyAmount) * 10));

    // Ensure a Stripe Product exists (create or update name)
    let productId = prev.stripeProductId || prev.productId;
    if (productId) {
      try {
        // Update product name if changed
        await stripe.products.update(productId, { name });
      } catch (e) {
        // If product missing (e.g., deleted), recreate
        const product = await stripe.products.create({ name, metadata: { planKey } });
        productId = product.id;
      }
    } else {
      const product = await stripe.products.create({ name, metadata: { planKey } });
      productId = product.id;
    }

    // Helper to ensure an active price for a given interval and amount
    const ensureRecurringPrice = async (prevPriceId, amount, interval) => {
      // If there is a previous price, check if it matches amount/currency
      if (prevPriceId) {
        try {
          const prevPrice = await stripe.prices.retrieve(prevPriceId);
          const matches = prevPrice && prevPrice.unit_amount === toCents(amount) && prevPrice.currency === currency && prevPrice.recurring?.interval === interval && prevPrice.active;
          if (matches) return prevPrice.id;
          // Deactivate old price if exists and amount changed
          if (prevPrice && prevPrice.active) {
            await stripe.prices.update(prevPrice.id, { active: false });
          }
        } catch (e) {
          // Ignore retrieval errors; create a new price
        }
      }
      // Create new price
      const newPrice = await stripe.prices.create({
        product: productId,
        unit_amount: toCents(amount),
        currency,
        recurring: { interval },
        metadata: { planKey, interval }
      });
      return newPrice.id;
    };

    const stripePriceMonthly = await ensureRecurringPrice(prev.prices?.monthly || prev.stripePriceMonthly, monthlyAmount, 'month');
    const stripePriceYearly = await ensureRecurringPrice(prev.prices?.yearly || prev.stripePriceYearly, yearlyAmount, 'year');

    outPlans[planKey] = {
      name,
      currency: currency.toUpperCase(),
      features: Array.isArray(planVal.features) ? planVal.features : (Array.isArray(prev.features) ? prev.features : []),
      limits: planVal.limits || prev.limits || {},
      // Persist human prices for convenience
      priceMonthly: Number(monthlyAmount),
      priceYearly: Number(yearlyAmount),
      // Stripe linkage
      stripeProductId: productId,
      prices: {
        monthly: stripePriceMonthly,
        yearly: stripePriceYearly,
      },
      // Backward-compat fields (do not rely on them, but keep for existing code)
      stripePriceMonthly,
      stripePriceYearly,
    };
  }

  // Save
  const updated = await SystemSetting.setSetting('subscription_plans', outPlans, {
    category: 'payment',
    description: 'Available subscription plans',
    isPublic: true,
    dataType: 'object'
  });

  res.status(200).json({ success: true, data: updated.value });
});
