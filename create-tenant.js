const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Tenant = require('./src/models/tenant.model');

// Load env vars
dotenv.config();

// Connect to database
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

const createTenant = async () => {
  await connectDB();

  try {
    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({ subdomain: 'isaac-gomes-ernandes' });
    
    if (existingTenant) {
      console.log('Tenant already exists:', existingTenant);
      process.exit(0);
    }

    // Create new tenant
    const tenant = await Tenant.create({
      name: 'Isaac Gomes Ernandes',
      email: 'isaac@example.com',
      subdomain: 'isaac-gomes-ernandes',
      address: '',
      phone: '',
      subscription: {
        plan: 'basic',
        billingCycle: 'monthly',
        status: 'active'
      }
    });

    console.log('Tenant created successfully:', tenant);
    process.exit(0);
  } catch (error) {
    console.error('Error creating tenant:', error);
    process.exit(1);
  }
};

createTenant();