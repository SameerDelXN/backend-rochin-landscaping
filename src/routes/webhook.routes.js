const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/payment.model');
const Appointment = require('../models/appointment.model');
const Tenant = require('../models/tenant.model');
const asyncHandler = require('../middlewares/async');

const router = express.Router();

// Stripe webhook endpoint
router.post('/stripe', express.raw({type: 'application/json'}), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log(`Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      try {
        // Subscription mode (default flow)
        if (session.mode === 'subscription' && session.metadata && session.metadata.tenantId) {
          const tenant = await Tenant.findById(session.metadata.tenantId);
          if (tenant) {
            // Fetch the subscription from Stripe for accurate billing info
            let stripeSub = null;
            if (session.subscription) {
              try { stripeSub = await stripe.subscriptions.retrieve(session.subscription); } catch {}
            }

            // Derive plan/billingCycle/amount/currency/period from Stripe subscription if available
            const firstItem = stripeSub?.items?.data?.[0];
            const price = firstItem?.price;
            const interval = price?.recurring?.interval; // 'month' | 'year'
            const derivedBillingCycle = interval === 'year' ? 'yearly' : 'monthly';
            const amount = typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : undefined;
            const currency = price?.currency ? price.currency.toUpperCase() : undefined;
            const periodStart = stripeSub?.current_period_start ? new Date(stripeSub.current_period_start * 1000) : new Date();
            const periodEnd = stripeSub?.current_period_end ? new Date(stripeSub.current_period_end * 1000) : undefined;

            // If tenant has an older different subscription, schedule cancellation at period end
            if (tenant.stripeSubscriptionId && session.subscription && tenant.stripeSubscriptionId !== session.subscription) {
              try {
                await stripe.subscriptions.update(tenant.stripeSubscriptionId, { cancel_at_period_end: true });
              } catch (e) {
                console.warn('Failed to schedule cancellation for old subscription', tenant.stripeSubscriptionId, e?.message);
              }
            }

            tenant.subscription = tenant.subscription || {};
            tenant.subscription.plan = (session.metadata.planKey || tenant.subscription.plan || 'basic').toLowerCase();
            tenant.subscription.billingCycle = session.metadata.billingCycle || derivedBillingCycle || tenant.subscription.billingCycle || 'monthly';
            tenant.subscription.status = 'active';
            if (amount != null) tenant.subscription.amount = amount;
            if (currency) tenant.subscription.currency = currency;
            tenant.subscription.startDate = periodStart;
            if (periodEnd) tenant.subscription.endDate = periodEnd;

            if (session.subscription) {
              tenant.stripeSubscriptionId = session.subscription;
            }
            await tenant.save();
            console.log(`Activated/updated tenant ${tenant._id} via subscription checkout`);
          } else {
            console.warn('Webhook: Tenant not found for tenantId=', session.metadata.tenantId);
          }
        }

        // One-time payment mode (e.g., UPI init flow)
        if (session.mode === 'payment' && session.metadata && session.metadata.tenantId && session.metadata.planKey && session.metadata.billingCycle) {
          const tenant = await Tenant.findById(session.metadata.tenantId);
          if (tenant) {
            tenant.subscription = tenant.subscription || {};
            tenant.subscription.plan = session.metadata.planKey;
            tenant.subscription.billingCycle = session.metadata.billingCycle;
            tenant.subscription.status = 'active';
            tenant.subscription.startDate = new Date();
            await tenant.save();
            console.log(`Activated tenant ${tenant._id} via UPI payment`);
          } else {
            console.warn('Webhook: Tenant not found for tenantId=', session.metadata.tenantId);
          }
        }
      } catch (err) {
        console.error('Error in checkout.session.completed handler:', err);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      try {
        const tenantId = subscription.metadata?.tenantId;
        if (tenantId) {
          const tenant = await Tenant.findById(tenantId);
          if (tenant) {
            const firstItem = subscription.items?.data?.[0];
            const price = firstItem?.price;
            const interval = price?.recurring?.interval; // 'month' | 'year'
            const derivedBillingCycle = interval === 'year' ? 'yearly' : 'monthly';
            const amount = typeof price?.unit_amount === 'number' ? price.unit_amount / 100 : undefined;
            const currency = price?.currency ? price.currency.toUpperCase() : undefined;
            const periodStart = subscription.current_period_start ? new Date(subscription.current_period_start * 1000) : undefined;
            const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : undefined;

            tenant.stripeSubscriptionId = subscription.id;
            tenant.subscription = tenant.subscription || {};
            // Map Stripe status to our status
            const statusMap = {
              active: 'active',
              trialing: 'trialing',
              past_due: 'inactive',
              unpaid: 'inactive',
              canceled: 'inactive',
              incomplete: 'inactive',
              incomplete_expired: 'inactive'
            };
            tenant.subscription.status = statusMap[subscription.status] || 'inactive';
            if (derivedBillingCycle) tenant.subscription.billingCycle = derivedBillingCycle;
            if (amount != null) tenant.subscription.amount = amount;
            if (currency) tenant.subscription.currency = currency;
            if (periodStart) tenant.subscription.startDate = periodStart;
            if (periodEnd) tenant.subscription.endDate = periodEnd;
            // Try to preserve plan key from metadata if present
            if (subscription.metadata?.planKey) tenant.subscription.plan = subscription.metadata.planKey.toLowerCase();

            await tenant.save();
          }
        }
      } catch (err) {
        console.error('Error in customer.subscription.updated handler:', err);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      try {
        const tenantId = subscription.metadata?.tenantId;
        if (tenantId) {
          const tenant = await Tenant.findById(tenantId);
          if (tenant) {
            tenant.subscription = tenant.subscription || {};
            tenant.subscription.status = 'inactive';
            await tenant.save();
          }
        }
      } catch (err) {
        console.error('Error in customer.subscription.deleted handler:', err);
      }
      break;
    }
    
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful!');
      break;
    
    case 'payment_method.attached':
      const paymentMethod = event.data.object;
      console.log('PaymentMethod was attached to a Customer!');
      break;
    
    case 'charge.succeeded':
      const charge = event.data.object;
      // Update payment status in database
      await Payment.findOneAndUpdate(
        { gatewayTransactionId: charge.id },
        { status: 'Completed' }
      );
      break;
    
    case 'charge.failed':
      const failedCharge = event.data.object;
      // Update payment status in database
      await Payment.findOneAndUpdate(
        { gatewayTransactionId: failedCharge.id },
        { status: 'Failed' }
      );
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
}));

module.exports = router;