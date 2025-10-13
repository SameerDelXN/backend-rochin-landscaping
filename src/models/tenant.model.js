const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tenant name is required.'],
    trim: true,
  },
  subdomain: {
    type: String,
    required: [true, 'Subdomain is required.'],
    trim: true,
    unique: true,
  },
  // Optional hosted domains for this tenant (preferred for public links)
  customDomains: {
    type: [String],
    default: [],
  },
  // Optional primary apex domain
  domain: {
    type: String,
    trim: true,
  },
  

  email: {
    type: String,
    required: [true, 'Tenant email is required.'],
    trim: true,
    lowercase: true,
    unique: true,
    match: [/\S+@\S+\.\S+/, 'Please enter a valid email'],
  },

  address: {
  type: String,
  // required: [true, 'Address is required'],
  trim: true,
 
},
phone: {
  type: String,
  // required: [true, 'Phone number is required'],
  trim: true,
  // match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number']
},

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  stripeCustomerId: {
    type: String,
    default: null,
    index: true,
  },
  stripeSubscriptionId: {
    type: String,
    default: null,
    index: true,
  },
  settings: {
    logo: String,
    themeColor: String,
    timezone: {
      type: String,
      default: 'UTC',
    },
  },
  subscription: {
    plan: {
      type: String,
      trim: true,
      default: 'none',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'trialing', 'suspended'],
      default: 'trialing',
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'yearly'],
      default: 'monthly',
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    startDate: Date,
    endDate: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Normalize basic fields (keep user-defined plan keys)
tenantSchema.pre('validate', function(next) {
  if (!this.subscription) return next();
  let plan = this.subscription.plan;
  let cycle = this.subscription.billingCycle;
  if (typeof plan === 'string') plan = plan.trim().toLowerCase();
  if (typeof cycle === 'string') cycle = cycle.trim().toLowerCase();
  if (!['monthly', 'yearly'].includes(cycle)) cycle = 'monthly';
  this.subscription.plan = plan || 'none';
  this.subscription.billingCycle = cycle;
  if (!this.subscription.currency) this.subscription.currency = 'USD';
  next();
});

module.exports = mongoose.model('Tenant', tenantSchema);
