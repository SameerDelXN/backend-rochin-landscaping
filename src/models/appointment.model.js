const mongoose = require('mongoose');
const tenantScopePlugin = require('./plugins/tenantScope.plugin');

const AppointmentSchema = new mongoose.Schema({
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  packageType: {
    type: String,
    enum: ['Basic', 'Standard', 'Premium'],
    default: 'Standard'
  },
  date: {
    type: Date,
    required: [true, 'Please add an appointment date']
  },
  timeSlot: {
    startTime: {
      type: String,
      required: [true, 'Please add a start time']
    },
    endTime: {
      type: String,
      required: [true, 'Please add an end time']
    }
  },

  duration: {
    type: Number,
    // required: true,
    min: 15,
    max: 480
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'Rescheduled', 'Rejected'],
    default: 'Pending'
  },
  recurringType: {
    type: String,
    enum: ['One-time', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annually'],
    default: 'One-time'
  },
  crew: {
    assignedTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    leadProfessional: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  notes: {
    customer: {
      type: String
    },
    professional: {
      type: String
    },
    internal: {
      type: String
    }
  },
  payment: {
    status: {
      type: String,
      enum: ['Not Required', 'Pending', 'Paid', 'Partially Paid', 'Refunded'],
      default: 'Not Required'
    },
    amount: {
      type: Number
    },
    transactionId: {
      type: String
    },
    paymentMethod: {
      type: String,
      enum: ['Credit Card', 'PayPal', 'Cash', 'Check', 'Bank Transfer'],
      default: 'Credit Card'
    },
    paymentDate: {
      type: Date
    }
  },
  photos: {
    beforeService: [{
      url: {
        type: String
      },
      caption: {
        type: String
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }],
    afterService: [{
      url: {
        type: String
      },
      caption: {
        type: String
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  completionDetails: {
    completedAt: {
      type: Date
    },
    duration: {
      type: Number // in minutes
    },
    additionalWorkPerformed: {
      type: String
    },
    customerSignature: {
      type: String
    }
  },
  notificationsStatus: {
    reminderSent: {
      type: Boolean,
      default: false
    },
    confirmationSent: {
      type: Boolean,
      default: false
    },
    completionSent: {
      type: Boolean,
      default: false
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Generate a color code based on service type
AppointmentSchema.virtual('calendarColor').get(function() {
  const colorMap = {
    'Lawn Maintenance': '#28a745', // green
    'Gardening': '#ffc107', // yellow
    'Tree Service': '#6c757d', // gray
    'Landscaping Design': '#17a2b8', // cyan
    'Irrigation': '#007bff', // blue
    'Seasonal': '#dc3545', // red
    'Other': '#6610f2' // purple
  };

  // Check if service exists and has a category
  if (!this.service || !this.service.category) {
    return '#6c757d'; // Default gray color for unknown services
  }

  return colorMap[this.service.category] || '#6c757d';
});

// Prevent exact duplicate bookings for the same service, date, and time
// This handles race conditions where two users book at the exact same millisecond
AppointmentSchema.index(
  { 
    service: 1, 
    date: 1, 
    "timeSlot.startTime": 1, 
    "timeSlot.endTime": 1 
  },
  { 
    unique: true, 
    partialFilterExpression: { 
      status: { $nin: ['Cancelled', 'Rejected'] } 
    } 
  }
);

AppointmentSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('Appointment', AppointmentSchema);