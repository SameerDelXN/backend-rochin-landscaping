const ErrorResponse = require('../utils/errorResponse');
const asyncHandler = require('../middlewares/async');
const Appointment = require('../models/appointment.model');
const Customer = require('../models/customer.model');
const User = require('../models/user.model');
const Service = require('../models/service.model');
const Tenant = require('../models/tenant.model');
const sendEmail = require('../utils/sendEmail');
const cloudinary = require('../utils/cloudinary');
const moment = require('moment'); // For backend/Node.js files




// // @desc    Get all appointments
// // @route   GET /api/v1/appointments
// // @access  Public/Private
// exports.getAppointments = asyncHandler(async (req, res, next) => {
//   if (req.query.status === 'Completed') {
//     try {
//       // Clear any existing population from advancedResults
//       req.query.populate = '';
      
//       let appointments = await Appointment.find({ status: 'Completed' })
//         .populate({
//           path: 'customer',
//           select: '-__v', // exclude version key
//           populate: {
//             path: 'user',
//             model: 'User',
//             select: 'name email phone role'
//           }
//         })
//         .populate('createdBy', 'name email role')
//         .populate('service', 'name category')
//         .lean();

//       // Debug: Check what was actually populated
//       console.log('Populated data sample:', appointments[0]?.customer?.user);

//       return res.status(200).json({
//         success: true,
//         count: appointments.length,
//         data: appointments
//       });
//     } catch (error) {
//       console.error('Error:', error);
//       return next(new ErrorResponse('Error fetching appointments', 500));
//     }
//   }

//   // For other queries
//   if (!req.user || !['admin', 'professional'].includes(req.user.role)) {
//     return next(new ErrorResponse('Not authorized', 403));
//   }

//   // Use advancedResults with consistent population
//   req.query.populate = [
//     {
//       path: 'customer',
//       populate: { path: 'user', select: 'name email phone' }
//     },
//     'service',
//     'createdBy'
//   ];

//   return res.status(200).json(res.advancedResults);
// });


exports.getAppointments = asyncHandler(async (req, res, next) => {
  if (req.user.role !== 'tenantAdmin') {
    return res.status(403).json({
      success: false,
      message: 'Unauthorized access - Tenant admin role required'
    });
  }

  // 1. FIRST get ONLY services that belong to this tenant
  const services = await Service.find({ 
    tenantId: req.user.tenantId 
  }).select('_id');

  const serviceIds = services.map(s => s._id);

  // 2. SIMPLE query - appointments must EITHER:
  //    - Have tenantId directly set, OR
  //    - Reference a service that belongs to this tenant
  const query = {
    $or: [
      { tenantId: req.user.tenantId },
      { service: { $in: serviceIds } }
    ]
  };

  // Optional filters
  if (req.query.status) query.status = req.query.status;
  if (req.query.startDate && req.query.endDate) {
    query.date = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate)
    };
  }

  // 3. Configure population WITHOUT strict matching
  req.query.populate = [
    {
      path: 'customer',
      select: '-__v',
      populate: { 
        path: 'user',
        model: 'User',
        select: 'name email phone'
      }
    },
    {
      path: 'service',
      select: 'name category duration price tenantId'
    },
    {
      path: 'createdBy',
      select: 'name email'
    }
  ];

  // 4. Execute query
  req.query.filter = query;
  const results = await res.advancedResults;
  
  // 5. Final filtering (just in case)
  const filteredData = results.data.filter(appointment => {
    // Either has matching tenantId directly
    if (appointment.tenantId?.toString() === req.user.tenantId?.toString()) {
      return true;
    }
    // Or references a service with matching tenantId
    if (appointment.service?.tenantId?.toString() === req.user.tenantId?.toString()) {
      return true;
    }
    return false;
  });

  return res.status(200).json({
    ...results,
    count: filteredData.length,
    data: filteredData
  });
});



// exports.getAppointments = asyncHandler(async (req, res, next) => {
//   if (!req.user || !['admin', 'professional'].includes(req.user.role)) {
//     return next(new ErrorResponse('Not authorized to access appointments', 403));
//   }

//   const appointments = await Appointment.find()
//     .populate({
//       path: 'customer',
//       select: 'address user',
//       populate: {
//         path: 'user',
//         select: 'name email phone'
//       }
//     })
//     .populate('service', 'name category');

//   res.status(200).json({
//     success: true,
//     count: appointments.length,
//     data: appointments
//   });
// });


// @desc    Get single appointment
// @route   GET /api/v1/appointments/:id
// @access  Private
exports.getAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate({
      path: 'customer',
      select: 'address propertyDetails notificationPreferences',
      populate: {
        path: 'user',
        select: 'name email phone'
      }
    })
    .populate('service')
    .populate({
      path: 'crew.assignedTo',
      select: 'name phone'
    })
    .populate({
      path: 'crew.leadProfessional',
      select: 'name phone'
    })
    .populate({
      path: 'createdBy',
      select: 'name'
    });

  if (!appointment) {
    return next(
      new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if user is authorized to view
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer || appointment.customer._id.toString() !== customer._id.toString()) {
      return next(
        new ErrorResponse(`Not authorized to access this appointment`, 403)
      );
    }
  }
  // tenantAdmin can view all appointments in their tenant
  else if (req.user.role === 'tenantAdmin') {
    // Additional tenant validation can be added here if needed
  }
  else {
    return next(
      new ErrorResponse(`Not authorized to access this appointment`, 403)
    );
  }

  res.status(200).json({
    success: true,
    data: appointment
  });
});

// // @desc    Get available time slots
// // @route   GET /api/v1/appointments/availability
// // @access  Public
// exports.getAvailableTimeSlots = asyncHandler(async (req, res, next) => {
//   const { date, serviceId } = req.query;

//   // Validate input
//   if (!date || !serviceId) {
//     return next(new ErrorResponse('Please provide date and service ID', 400));
//   }

//   // Validate and parse date
//   const selectedDate = new Date(date);
//   if (isNaN(selectedDate)) {
//     return next(new ErrorResponse('Invalid date format', 400));
//   }

//   // Get service details
//   const service = await Service.findById(serviceId);
//   if (!service) {
//     return next(new ErrorResponse('Service not found', 404));
//   }

//   // Get business hours (you might want to store these in a config/model)
//   const businessHours = {
//     start: 8, // 8 AM
//     end: 18,  // 6 PM
//     slotInterval: 30 // minutes between slots
//   };

//   // Calculate time slots
//   const startTime = new Date(selectedDate);
//   startTime.setHours(businessHours.start, 0, 0, 0);

//   const endTime = new Date(selectedDate);
//   endTime.setHours(businessHours.end, 0, 0, 0);

//   // Generate all possible slots
//   const allSlots = [];
//   let current = new Date(startTime);
  
//   while (current < endTime) {
//     const slotEnd = new Date(current.getTime() + service.duration * 60000);
//     if (slotEnd > endTime) break;
    
//     allSlots.push({
//       start: current.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
//       end: slotEnd.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
//     });
    
//     current = new Date(current.getTime() + businessHours.slotInterval * 60000);
//   }

//   // Get existing appointments
//   const appointments = await Appointment.find({
//     date: {
//       $gte: new Date(selectedDate.setHours(0, 0, 0, 0)),
//       $lte: new Date(selectedDate.setHours(23, 59, 59, 999))
//     }
//   });

//   // Filter out occupied slots
//   const availableSlots = allSlots.filter(slot => {
//     return !appointments.some(appointment => {
//       const apptStart = new Date(`1970-01-01T${appointment.timeSlot.startTime}`);
//       const apptEnd = new Date(`1970-01-01T${appointment.timeSlot.endTime}`);
//       const slotStart = new Date(`1970-01-01T${slot.start}`);
//       const slotEnd = new Date(`1970-01-01T${slot.end}`);
      
//       return (slotStart < apptEnd && slotEnd > apptStart);
//     });
//   });

//   res.status(200).json({
//     success: true,
//     data: availableSlots
//   });
// });


// // @desc    Get all time slots with availability status
// // @route   GET /api/v1/appointments/availability
// // @access  Public
// exports.getTimeSlotsWithAvailability = asyncHandler(async (req, res, next) => {
//   const { date, serviceId } = req.query;

//   // Validate input
//   if (!date || !serviceId) {
//     return next(new ErrorResponse('Please provide date and service ID', 400));
//   }

//   // Validate and parse date
//   const selectedDate = new Date(date);
//   if (isNaN(selectedDate)) {
//     return next(new ErrorResponse('Invalid date format', 400));
//   }

//   // Get service details
//   const service = await Service.findById(serviceId);
//   if (!service) {
//     return next(new ErrorResponse('Service not found', 404));
//   }

//   // Business hours configuration
//   const businessHours = {
//     start: 8,  // 8 AM
//     end: 18,   // 6 PM
//     slotInterval: 30 // minutes
//   };

//   // Strict time normalization (HH:MM format)
//   const normalizeTime = (timeStr) => {
//     if (typeof timeStr !== 'string') timeStr = String(timeStr);
//     const [hours, minutes] = timeStr.split(':').map(Number);
//     return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
//   };

//   // Generate all possible time slots
//   const allSlots = [];
//   let currentHour = businessHours.start;
//   let currentMinute = 0;

//   while (currentHour < businessHours.end || 
//         (currentHour === businessHours.end && currentMinute === 0)) {
//     const startTime = normalizeTime(`${currentHour}:${currentMinute}`);
    
//     // Calculate end time based on service duration
//     const endTime = new Date(0);
//     endTime.setHours(currentHour, currentMinute + service.duration, 0, 0);
//     const formattedEndTime = normalizeTime(`${endTime.getHours()}:${endTime.getMinutes()}`);
    
//     // Only add slot if it ends within business hours
//     if (endTime.getHours() < businessHours.end || 
//         (endTime.getHours() === businessHours.end && endTime.getMinutes() === 0)) {
//       allSlots.push({
//         start: startTime,
//         end: formattedEndTime,
//         available: true
//       });
//     }

//     // Move to next slot
//     currentMinute += businessHours.slotInterval;
//     if (currentMinute >= 60) {
//       currentHour += Math.floor(currentMinute / 60);
//       currentMinute = currentMinute % 60;
//     }
//   }

//   // Get existing appointments for this date and service
//   const appointments = await Appointment.find({
//     date: {
//       $gte: new Date(selectedDate.setHours(0, 0, 0, 0)),
//       $lte: new Date(selectedDate.setHours(23, 59, 59, 999))
//     },
//     service: serviceId
//   }).select('timeSlot.startTime timeSlot.endTime');

//   // Create exact booking map
//   const exactBookings = new Map();
//   appointments.forEach(app => {
//     const start = normalizeTime(app.timeSlot.startTime);
//     const end = normalizeTime(app.timeSlot.endTime);
//     exactBookings.set(`${start}-${end}`, true);
//   });

//   // Mark availability (only exact matches)
//   const availableSlots = allSlots.map(slot => {
//     const slotKey = `${slot.start}-${slot.end}`;
//     return {
//       start: slot.start,
//       end: slot.end,
//       available: !exactBookings.has(slotKey)
//     };
//   });

//   res.status(200).json({
//     success: true,
//     data: availableSlots
//   });
// });



// exports.getAvailability = async (req, res) => {
//   const { serviceId, date } = req.query;

//   if (!serviceId || !date) {
//     return res.status(400).json({ message: "serviceId and date are required" });
//   }

//   // Convert to date-only string (ignore time)
//   const dateOnly = new Date(date).toISOString().split("T")[0];

//   // Get service duration
//   const service = await Service.findById(serviceId);
//   if (!service) {
//     return res.status(404).json({ message: "Service not found" });
//   }

//   const workingStartHour = 8; // 08:00
//   const workingEndHour = 18;  // 18:00
//   const slotDuration = service.duration; // Use service duration
//   const slotInterval = 30;    // step every 30 min

//   const slots = [];

//   // Generate all possible time slots
//   for (let hour = workingStartHour; hour < workingEndHour; hour++) {
//     for (let minutes of [0, 30]) {
//       // Skip if this would go past working hours
//       if (hour === workingEndHour - 1 && minutes + slotDuration > 60) continue;
      
//       const start = new Date(`${dateOnly}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
//       const end = new Date(start.getTime() + slotDuration * 60000);

//       // Skip slots that would end after working hours
//       if (end.getHours() >= workingEndHour && end.getMinutes() > 0) continue;

//       const startTime = start.toTimeString().substring(0, 5); // "HH:mm"
//       const endTime = end.toTimeString().substring(0, 5);

//       slots.push({
//         startTime,
//         endTime,
//         available: true // Mark all as available initially
//       });
//     }
//   }

//   // Get booked appointments for this service and date
//   const bookedAppointments = await Appointment.find({
//     service: serviceId,
//     date: {
//       $gte: new Date(dateOnly),
//       $lt: new Date(new Date(dateOnly).getTime() + 86400000) // Next day
//     }
//   });

//   // Mark only exact matches as booked
//   bookedAppointments.forEach(booking => {
//     const bookedStart = booking.timeSlot.startTime.padStart(5, '0');
//     const bookedEnd = booking.timeSlot.endTime.padStart(5, '0');
    
//     const slotIndex = slots.findIndex(
//       s => s.startTime === bookedStart && s.endTime === bookedEnd
//     );
    
//     if (slotIndex !== -1) {
//       slots[slotIndex].available = false;
//     }
//   });

//   return res.json({
//     success: true,
//     date: dateOnly,
//     data: slots
//   });
// };





exports.getAvailability = async (req, res) => {
  const { serviceId, date } = req.query;

  if (!serviceId || !date) {
    return res.status(400).json({ message: "serviceId and date are required" });
  }

  // Convert to date-only string (ignore time)
  const dateOnly = new Date(date).toISOString().split("T")[0];
  const today = new Date().toISOString().split("T")[0];
  const isToday = dateOnly === today;
  const currentTime = new Date();

  // Get service duration
  const service = await Service.findById(serviceId);
  if (!service) {
    return res.status(404).json({ message: "Service not found" });
  }

  const workingStartHour = 8; // 08:00
  const workingEndHour = 18;  // 18:00
  const slotDuration = service.duration; // Use service duration
  const slotInterval = 30;    // step every 30 min

  const slots = [];

  // Generate all possible time slots
  for (let hour = workingStartHour; hour < workingEndHour; hour++) {
    for (let minutes of [0, 30]) {
      // Skip if this would go past working hours
      if (hour === workingEndHour - 1 && minutes + slotDuration > 60) continue;
      
      const start = new Date(`${dateOnly}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
      const end = new Date(start.getTime() + slotDuration * 60000);

      // Skip slots that would end after working hours
      if (end.getHours() >= workingEndHour && end.getMinutes() > 0) continue;

      // For today's date, skip slots that are in the past
      if (isToday && start < currentTime) {
        continue;
      }

      const startTime = start.toTimeString().substring(0, 5); // "HH:mm"
      const endTime = end.toTimeString().substring(0, 5);

      slots.push({
        startTime,
        endTime,
        available: true // Mark all as available initially
      });
    }
  }

  // Get booked appointments for this service and date
  const bookedAppointments = await Appointment.find({
    service: serviceId,
    date: {
      $gte: new Date(dateOnly),
      $lt: new Date(new Date(dateOnly).getTime() + 86400000) // Next day
    }
  });

  // Mark overlapping slots as booked
  bookedAppointments.forEach(booking => {
    // Only consider active bookings
    if (['Cancelled', 'Rejected'].includes(booking.status)) return;

    const bookedStartVal = parseInt(booking.timeSlot.startTime.replace(':', ''));
    const bookedEndVal = parseInt(booking.timeSlot.endTime.replace(':', ''));
    
    slots.forEach(slot => {
      // Check for exact match only
      if (slot.startTime === booking.timeSlot.startTime && slot.endTime === booking.timeSlot.endTime) {
        slot.available = false;
      }
    });
  });

  return res.json({
    success: true,
    date: dateOnly,
    data: slots
  });
};




// // @desc    Create new appointment
// // @route   POST /api/v1/appointments
// // @access  Private/Admin
// exports.createAppointment = asyncHandler(async (req, res, next) => {
//   // Get logged-in user ID from token
//   const userId = req.user.id;
//   // Check customer exists
//   // const customer = await Customer.findById(req.body.customer);
//   // Find the Customer using the user ID
//   const customer = await Customer.findOne({ user: userId });
//   if (!customer) {
//     return next(
//       new ErrorResponse(`Customer not found with user id of ${userId}`, 404)
//     );
//   }
//   // Replace the customer ID in request body with correct one
//   req.body.customer = customer._id;
//   // Check service exists
//   const service = await Service.findById(req.body.service);
//   if (!service) {
//     return next(
//       new ErrorResponse(`Service not found with id of ${req.body.service}`, 404)
//     );
//   }

//   // Add user as creator
//   // req.body.createdBy = req.user.id;

//  // Add user as creator
//  req.body.createdBy = userId;
//   const appointment = await Appointment.create(req.body);

//   // Get customer's user info for notification
//   const customerUser = await User.findById(customer.user);

//   // Send confirmation email to customer
//   if (customerUser && customerUser.email) {
//     try {
//       const formattedDate = new Date(appointment.date).toLocaleString('en-US', {
//         weekday: 'long',
//         year: 'numeric',
//         month: 'long',
//         day: 'numeric'
//       });
      
//       await sendEmail({
//         email: customerUser.email,
//         subject: 'Appointment Confirmation',
//         message: `Your landscaping appointment has been scheduled for ${formattedDate} from ${appointment.timeSlot.startTime} to ${appointment.timeSlot.endTime}. Service: ${service.name}. Please contact us if you need to reschedule.`
//       });

//       // Update notification status
//       appointment.notificationsStatus.confirmationSent = true;
//       await appointment.save();
//     } catch (err) {
//       console.log('Email notification failed:', err);
//     }
//   }

//   res.status(201).json({
//     success: true,
//     data: appointment
//   });
// });



// @desc    Create new appointment
// @route   POST /api/v1/appointments
// @access  Private
exports.createAppointment = asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  // Find the Customer using the user ID
  const customer = await Customer.findOne({ user: userId }).populate('user');
  if (!customer) {
    return next(
      new ErrorResponse(`Customer not found with user id of ${userId}`, 404)
    );
  }

  // Check service exists and get tenantId from it
  const service = await Service.findById(req.body.service);
  if (!service) {
    return next(
      new ErrorResponse(`Service not found with id of ${req.body.service}`, 404)
    );
  }

  // Validate time slot format
  if (!req.body.timeSlot || !req.body.timeSlot.startTime || !req.body.timeSlot.endTime) {
    return next(
      new ErrorResponse('Please provide both startTime and endTime in the timeSlot object', 400)
    );
  }

  // Calculate duration in minutes
  const calculateDuration = (start, end) => {
    const [startHours, startMinutes] = start.split(':').map(Number);
    const [endHours, endMinutes] = end.split(':').map(Number);
    
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;
    
    return endTotal - startTotal;
  };

  const durationMinutes = calculateDuration(
    req.body.timeSlot.startTime,
    req.body.timeSlot.endTime
  );

  // Format time for display
  const formatTimeForDisplay = (timeStr) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes.padStart(2, '0')} ${ampm}`;
  };

  // Format date for display
    const formattedDate = new Date(normalizedDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Format time slot for display
  const formattedTimeSlot = `${formatTimeForDisplay(req.body.timeSlot.startTime)} - ${formatTimeForDisplay(req.body.timeSlot.endTime)}`;

  // Prepare appointment data
    const appointmentData = {
    ...req.body,
    date: normalizedDate, // force UTC midnight
    tenant: service.tenantId,
    customer: customer._id,
    createdBy: userId,
    duration: durationMinutes,
    formattedDate,
    formattedTimeSlot
  };

  // If booking payload includes an address (various shapes), update the customer's saved address
  const possibleAddress = (
    (req.body && typeof req.body.address === 'object' && req.body.address) ||
    (req.body && req.body.property && typeof req.body.property.address === 'object' && req.body.property.address) ||
    (Array.isArray(req.body.properties) && req.body.properties[0] && typeof req.body.properties[0].address === 'object' && req.body.properties[0].address) ||
    (Array.isArray(req.body.propertyDetails) && req.body.propertyDetails[0] && typeof req.body.propertyDetails[0].propertyAddress === 'object' && req.body.propertyDetails[0].propertyAddress)
  );
  if (possibleAddress) {
    const a = possibleAddress || {};
    const nextAddress = {
      street: a.street || customer.address?.street || '',
      city: a.city || customer.address?.city || '',
      state: a.state || customer.address?.state || '',
      zipCode: a.zipCode || customer.address?.zipCode || '',
      country: a.country || customer.address?.country || 'USA'
    };
    try {
      await Customer.findByIdAndUpdate(
        customer._id,
        { address: nextAddress },
        { new: true, runValidators: true }
      );
    } catch (e) {
      // Do not block booking if address update fails; log for diagnostics
      console.error('Failed to update customer address from booking:', e?.message || e);
    }
  }

  // Check for overlapping appointments for the same service
     const startOfDayUTC = normalizedDate;
  const endOfDayUTC = new Date(Date.UTC(
    normalizedDate.getUTCFullYear(),
    normalizedDate.getUTCMonth(),
    normalizedDate.getUTCDate(),
    23, 59, 59, 999
  ));
  const existingAppointments = await Appointment.find({
    service: req.body.service,
    date: {
      $gte: startOfDayUTC,
      $lt: endOfDayUTC
    },
    status: { $nin: ['Cancelled', 'Rejected'] }
  });

  // Check for EXACT duplicate slots only (same start AND same end time)
  // Per user requirement: Overlapping times (e.g. 8:00-9:00 and 8:30-9:30) allow booking.
  // We only prevent EXACT duplicate bookings (8:00-9:00 vs 8:00-9:00).
  const hasExactConflict = existingAppointments.some(appt => {
    return (appt.timeSlot.startTime === req.body.timeSlot.startTime && 
            appt.timeSlot.endTime === req.body.timeSlot.endTime);
  });

  if (hasExactConflict) {
    return next(new ErrorResponse('This time slot has already been booked. Please select another time.', 400));
  }

  // Create appointment with race condition handling
  let appointment;
  try {
    appointment = await Appointment.create(appointmentData);
  } catch (error) {
    if (error.code === 11000) {
      return next(new ErrorResponse('This time slot was just booked by another customer. Please select another time.', 400));
    }
    throw error;
  }

  // Add customer to tenant's customers list if not already there
  await Customer.findByIdAndUpdate(
    customer._id,
    { $addToSet: { tenants: service.tenantId } },
    { new: true }
  );

  // Get tenant info for email personalization
  const tenant = await Tenant.findById(service.tenantId);

  // Send confirmation email
  if (customer.user?.email) {
    try {
      await sendEmail({
        email: customer.user.email,
        subject: `Appointment Confirmation - ${tenant?.name || 'Our Service'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d3748;">Your Appointment is Confirmed</h2>
            <p>Hello ${customer.user.name},</p>
            
            <div style="background: #f7fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="margin-top: 0; color: #4a5568;">Appointment Details</h3>
              <p><strong>Service:</strong> ${service.name}</p>
              <p><strong>Date:</strong> ${formattedDate}</p>
              <p><strong>Time:</strong> ${formattedTimeSlot}</p>
              <p><strong>Duration:</strong> ${durationMinutes} minutes</p>
              ${tenant?.phone ? `<p><strong>Contact:</strong> ${tenant.phone}</p>` : ''}
            </div>

            <p>If you need to reschedule or have any questions, please contact us.</p>
            
            <p style="margin-top: 24px;">Best regards,<br>
            ${tenant?.name || 'The Service Team'}</p>
          </div>
        `
      });

      // Update notification status
      appointment.notificationsStatus = {
        confirmationSent: true,
        sentAt: new Date()
      };
      await appointment.save();
    } catch (err) {
      console.error('Email notification failed:', err);
      // Don't fail the request just because email failed
    }
  }

  res.status(201).json({
    success: true,
    data: appointment
  });
});

// @desc    Update appointment
// @route   PUT /api/v1/appointments/:id
// @access  Private (admin, professional, or customer for own appointment with limited fields)
exports.updateAppointment = asyncHandler(async (req, res, next) => {
  let appointment = await Appointment.findById(req.params.id)
    .populate({
      path: 'customer',
      populate: {
        path: 'user',
        select: 'email'
      }
    });

  if (!appointment) {
    return next(
      new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
    );
  }

  // Store original values before update
  const originalValues = {
    date: appointment.date,
    timeSlot: { ...appointment.timeSlot },
    status: appointment.status
  };

  // Update logic based on user role
  if (req.user.role === 'tenantAdmin' || req.user.role === 'professional') {
    appointment = await Appointment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate({
      path: 'customer',
      populate: {
        path: 'user',
        select: 'email'
      }
    });
  } else if (req.user.role === 'customer') {
    // ... existing customer update logic ...
  }

  // Email notification for completion
  if (req.body.status === 'Completed' && originalValues.status !== 'Completed') {
    try {
      // Update completion details
      appointment.completionDetails = {
        ...appointment.completionDetails,
        completedAt: new Date(),
        ...(req.body.completionDetails || {})
      };
      await appointment.save();

      // Only send email if customer has email
      if (appointment.customer?.user?.email) {
        await sendCompletionEmail(appointment);
        appointment.notificationsStatus.completionSent = true;
        await appointment.save();
      }
    } catch (err) {
      console.error('Completion notification failed:', err);
      // Implement retry mechanism here if needed
    }
  }

  // Email notification for rescheduling
  const isDateChanged = req.body.date && 
    !moment(req.body.date).isSame(originalValues.date, 'day');
  
  const isTimeChanged = req.body.timeSlot && (
    req.body.timeSlot.startTime !== originalValues.timeSlot.startTime ||
    req.body.timeSlot.endTime !== originalValues.timeSlot.endTime
  );

  if ((isDateChanged || isTimeChanged) && appointment.status !== 'Completed') {
    try {
      if (appointment.customer?.user?.email) {
        await sendRescheduleEmail(appointment, originalValues);
        appointment.notificationsStatus.rescheduleSent = true;
        await appointment.save();
      }
    } catch (err) {
      console.error('Reschedule notification failed:', err);
    }
  }

  res.status(200).json({
    success: true,
    data: appointment
  });
});

// Helper functions for email sending
async function sendCompletionEmail(appointment) {
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4CAF50;">Service Completed</h2>
      <p>Dear valued customer,</p>
      <p>Your landscaping service has been successfully completed.</p>
      <p><strong>Service Details:</strong></p>
      <ul>
        <li>Date: ${moment(appointment.date).format('MMMM D, YYYY')}</li>
        <li>Service: ${appointment.serviceType || 'Landscaping Service'}</li>
      </ul>
      <p>Thank you for choosing our services!</p>
      <p>Best regards,<br>Your Landscaping Team</p>
    </div>
  `;

  await sendEmail({
    email: appointment.customer.user.email,
    subject: 'Service Completed',
    html: emailContent
  });
}

async function sendRescheduleEmail(appointment, originalValues) {
  const formattedDate = moment(appointment.date).format('dddd, MMMM D, YYYY');
  const originalDate = moment(originalValues.date).format('dddd, MMMM D, YYYY');
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2196F3;">Appointment Rescheduled</h2>
      <p>Dear valued customer,</p>
      <p>Your landscaping appointment has been rescheduled.</p>
      
      ${originalDate !== formattedDate ? `
      <p><strong>Original Date:</strong> ${originalDate}</p>
      ` : ''}
      
      ${originalValues.timeSlot.startTime !== appointment.timeSlot.startTime || 
        originalValues.timeSlot.endTime !== appointment.timeSlot.endTime ? `
      <p><strong>Original Time:</strong> ${originalValues.timeSlot.startTime} - ${originalValues.timeSlot.endTime}</p>
      ` : ''}
      
      <p><strong>New Appointment Details:</strong></p>
      <ul>
        <li>Date: ${formattedDate}</li>
        <li>Time: ${appointment.timeSlot.startTime} - ${appointment.timeSlot.endTime}</li>
      </ul>
      <p>Please contact us if you have any questions or need to make further changes.</p>
      <p>Best regards,<br>Your Landscaping Team</p>
    </div>
  `;

  await sendEmail({
    email: appointment.customer.user.email,
    subject: 'Appointment Rescheduled',
    html: emailContent
  });
}





// // @desc    Delete appointment
// // @route   DELETE /api/v1/appointments/:id
// // @access  Private/Admin
// exports.deleteAppointment = asyncHandler(async (req, res, next) => {
//   const appointment = await Appointment.findById(req.params.id);

//   if (!appointment) {
//     return next(
//       new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
//     );
//   }

//   // Check if user is authorized to delete
//   if (req.user.role !== 'admin') {
//     return next(
//       new ErrorResponse(`Not authorized to delete this appointment`, 403)
//     );
//   }

//   await Appointment.findByIdAndDelete(req.params.id);


//   res.status(200).json({
//     success: true,
//     data: {}
//   });
// });



// @desc    Delete appointment
// @route   DELETE /api/v1/appointments/:id
// @access  Private
exports.deleteAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new ErrorResponse('Appointment not found', 404));
  }

  // Admin can always delete
  if (req.user.role === 'admin') {
    await Appointment.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, data: {} });
  }

  // For customers - since they only see their own appointments via my-appointments,
  // we just need to enforce the 24-hour rule
  if (req.user.role === 'customer') {
    const now = new Date();
    const appointmentDate = new Date(appointment.date);
    const hoursBeforeAppointment = (appointmentDate - now) / (1000 * 60 * 60);
    
    if (hoursBeforeAppointment < 24) {
      return next(new ErrorResponse(
        'Appointments can only be canceled at least 24 hours before', 
        400
      ));
    }

    await Appointment.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, data: {} });
  }

  return next(new ErrorResponse('Not authorized', 403));
});



// @desc    Upload service photos
// @route   POST /api/v1/appointments/:id/photos
// @access  Private/Professional
exports.uploadServicePhotos = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(
      new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
    );
  }

  // Check if appointment is completed
  if (appointment.status !== 'Completed') {
    return next(
      new ErrorResponse(`Photos can only be uploaded for completed appointments`, 400)
    );
  }

  // Check if user is authorized to upload photos
  if (req.user.role !== 'tenantAdmin' && req.user.role !== 'professional') {
    return next(
      new ErrorResponse(`Not authorized to upload photos for this appointment`, 403)
    );
  }

  if (!req.body.photos || !Array.isArray(req.body.photos) || req.body.photos.length === 0) {
    return next(new ErrorResponse(`Please upload at least one photo`, 400));
  }

  // Check if before or after service
  if (!req.body.photoType || !['beforeService', 'afterService'].includes(req.body.photoType)) {
    return next(new ErrorResponse(`Please specify photoType as 'beforeService' or 'afterService'`, 400));
  }

  const uploadPromises = req.body.photos.map(photo => {
    return new Promise((resolve, reject) => {
      try {
        // Upload to cloudinary
        cloudinary.uploader.upload(
          `data:${photo.contentType};base64,${photo.data}`,
          {
            folder: `landscaping/appointments/${appointment._id}/${req.body.photoType}`,
            resource_type: 'auto',
            public_id: photo.name.split('.')[0] // Use filename without extension as public_id
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve({
                url: result.secure_url,
                publicId: result.public_id,
                caption: '',
                uploadedAt: Date.now()
              });
            }
          }
        );
      } catch (err) {
        reject(err);
      }
    });
  });

  try {
    const uploadedPhotos = await Promise.all(uploadPromises);

    // Add photos to appointment
    if (req.body.photoType === 'beforeService') {
      appointment.photos.beforeService.push(...uploadedPhotos);
    } else {
      appointment.photos.afterService.push(...uploadedPhotos);
    }
    
    await appointment.save();

    res.status(200).json({
      success: true,
      count: uploadedPhotos.length,
      data: uploadedPhotos
    });
  } catch (err) {
    return next(new ErrorResponse(`Problem with photo upload: ${err.message}`, 500));
  }
});

// @desc    Get my appointments (Customer)
// @route   GET /api/v1/appointments/my-appointments
// @access  Private/Customer
exports.getMyAppointments = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findOne({ user: req.user.id });

  if (!customer) {
    return next(new ErrorResponse(`No customer profile found`, 404));
  }

  const appointments = await Appointment.find({ customer: customer._id })
    .populate('service', 'name category')
    .sort({ date: -1 });

  res.status(200).json({
    success: true,
    count: appointments.length,
    data: appointments
  });
});

// // // @desc    Request reschedule (Customer)
// // // @route   PUT /api/v1/appointments/:id/reschedule-request
// // // @access  Private/Customer
// // exports.requestReschedule = asyncHandler(async (req, res, next) => {
// //   const { requestedDate, requestedTime, reason } = req.body;

// //   if (!requestedDate || !requestedTime) {
// //     return next(new ErrorResponse(`Please provide requested date and time`, 400));
// //   }

// //   const appointment = await Appointment.findById(req.params.id);

// //   if (!appointment) {
// //     return next(new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404));
// //   }

// //   // Verify customer owns this appointment
// //   const customer = await Customer.findOne({ user: req.user.id });
// //   if (!customer || appointment.customer.toString() !== customer._id.toString()) {
// //     return next(new ErrorResponse(`Not authorized to reschedule this appointment`, 403));
// //   }

// //   // Parse the time slot (assuming format "HH:MM - HH:MM")
// //   const [startTime, endTime] = requestedTime.split(' - ');

// //   // Update the appointment with new date/time
// //   appointment.date = requestedDate;
// //   appointment.timeSlot = {
// //     startTime: startTime.trim(),
// //     endTime: endTime.trim()
// //   };
  
// //   // Add reschedule request to notes
// //   if (!appointment.notes.customer) {
// //     appointment.notes.customer = '';
// //   }
  
// //   appointment.notes.customer += `\n[RESCHEDULE REQUEST] Date: ${requestedDate}, Time: ${requestedTime}, Reason: ${reason || 'Not provided'}`;
// //   appointment.status = 'Rescheduled';
  
// //   await appointment.save();

// //   // Notify admin about reschedule request
// //   try {
// //     const admins = await User.find({ role: 'admin' });
// //     if (admins.length > 0) {
// //       await sendEmail({
// //         email: admins[0].email,
// //         subject: 'Appointment Reschedule Request',
// //         message: `Customer ${req.user.name} has requested to reschedule their appointment on ${new Date(appointment.date).toLocaleDateString()} to ${requestedDate} at ${requestedTime}. Reason: ${reason || 'Not provided'}`
// //       });
// //     }
// //   } catch (err) {
// //     console.log('Reschedule notification failed:', err);
// //   }

// //   res.status(200).json({
// //     success: true,
// //     data: appointment
// //   });
// // });



// exports.requestReschedule = asyncHandler(async (req, res, next) => {
//   const { requestedDate, requestedTime } = req.body;
  
//   // Parse time slot
//   const [startTime, endTime] = requestedTime.split(' - ').map(t => t.trim());

//   // Create datetime in UTC by combining date and time
//   const newAppointmentDate = new Date(`${requestedDate}T${startTime}:00Z`);
  
//   // Get current time in UTC
//   const now = new Date();
//   const bufferTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute buffer

//   // Debug logs
//   console.log("Received reschedule request:", {
//     requestedDate,
//     requestedTime,
//     newAppointmentDate,
//     now,
//     bufferTime
//   });

//   if (newAppointmentDate < bufferTime) {
//     return next(new ErrorResponse(`Cannot reschedule to a past date/time`, 400));
//   }

//   // Update appointment with UTC date
//   appointment.date = newAppointmentDate;
//   appointment.timeSlot = { startTime, endTime };
//   appointment.status = 'Rescheduled';
  
//   // Add reschedule note with local time display
//   const localDateStr = newAppointmentDate.toLocaleDateString();
//   const localTimeStr = `${startTime}-${endTime}`;
//   appointment.notes.customer = (appointment.notes.customer || '') + 
//     `\n[RESCHEDULE REQUEST] Date: ${localDateStr}, Time: ${localTimeStr}, Reason: Customer requested reschedule`;

//   await appointment.save();

//   res.status(200).json({
//     success: true,
//     data: appointment
//   });
// });




exports.requestReschedule = asyncHandler(async (req, res, next) => {
  const { requestedDate, requestedTime, reason } = req.body;

  if (!requestedDate || !requestedTime) {
    return next(new ErrorResponse(`Please provide requested date and time`, 400));
  }

  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404));
  }

  // Verify customer owns this appointment
  const customer = await Customer.findOne({ user: req.user.id });
  if (!customer || appointment.customer.toString() !== customer._id.toString()) {
    return next(new ErrorResponse(`Not authorized to reschedule this appointment`, 403));
  }

  // Parse time slot
  const [startTime, endTime] = requestedTime.split(' - ').map(t => t.trim());

  // Create datetime in UTC by combining date and time
  const newAppointmentDate = new Date(`${requestedDate}T${startTime}:00Z`);
  
  // Get current time in UTC
  const now = new Date();
  const bufferTime = new Date(now.getTime() + 5 * 60 * 1000); // 5 minute buffer

  if (newAppointmentDate < bufferTime) {
    return next(new ErrorResponse(`Cannot reschedule to a past date/time`, 400));
  }

  // Update appointment with UTC date
  appointment.date = newAppointmentDate;
  appointment.timeSlot = { startTime, endTime };
  appointment.status = 'Rescheduled';
  
  // Add reschedule note with local time display
  const localDateStr = newAppointmentDate.toLocaleDateString();
  const localTimeStr = `${startTime}-${endTime}`;
  appointment.notes.customer = (appointment.notes.customer || '') + 
    `\n[RESCHEDULE REQUEST] Date: ${localDateStr}, Time: ${localTimeStr}, Reason: ${reason || 'Not provided'}`;

  await appointment.save();

  // Notify admin about reschedule request
  try {
    const admins = await User.find({ role: 'admin' });
    if (admins.length > 0) {
      // Format date for email in a user-friendly way
      const formattedDate = newAppointmentDate.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      await sendEmail({
        email: admins[0].email,
        subject: 'Appointment Reschedule Request',
        message: `Customer ${req.user.name} has requested to reschedule their appointment to:
        \n\nNew Date/Time: ${formattedDate}
        \nTime Slot: ${startTime} - ${endTime}
        \nReason: ${reason || 'Not provided'}`
      });
    }
  } catch (err) {
    console.log('Reschedule notification failed:', err);
    // Don't fail the request if email fails
  }

  res.status(200).json({
    success: true,
    data: appointment
  });
});


// @desc    Get appointments by date range
// @route   GET /api/v1/appointments/calendar
// @access  Private
exports.getCalendarAppointments = asyncHandler(async (req, res, next) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return next(
      new ErrorResponse(`Please provide start and end dates`, 400)
    );
  }

  let query = {
    date: {
      $gte: new Date(start),
      $lte: new Date(end)
    }
  };

  // If customer, only show their appointments
  if (req.user.role === 'customer') {
    const customer = await Customer.findOne({ user: req.user.id });
    if (!customer) {
      return next(new ErrorResponse(`No customer profile found`, 404));
    }
    query.customer = customer._id;
  }

  // If professional, only show appointments they're assigned to
  if (req.user.role === 'professional') {
    query.$or = [
      { 'crew.assignedTo': req.user.id },
      { 'crew.leadProfessional': req.user.id }
    ];
  }

  const appointments = await Appointment.find(query)
    .populate('customer', 'address')
    .populate('service', 'name category')
    .populate('crew.leadProfessional', 'name')
    .sort({ date: 1 });

  // Format for calendar display with null checks
  const calendarAppointments = appointments.map(apt => {
    // Get service name with fallback
    const serviceName = apt.service?.name || 'Unassigned Service';
    
    // Get customer address with fallback
    const customerAddress = apt.customer?.address || 'No Address';
    
    // Get start and end times with validation
    const startTime = apt.timeSlot?.startTime || '00:00';
    const endTime = apt.timeSlot?.endTime || '00:00';



      // Normalize the incoming booking date to UTC midnight to avoid client timezone mismatches
  const normalizeDateToUTC = (inputDate) => {
    const d = new Date(inputDate);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const day = d.getUTCDate();
    return new Date(Date.UTC(y, m, day));
  };
  const normalizedDate = normalizeDateToUTC(req.body.date);
    
    // Create date objects with validation
    const startDate = new Date(`${apt.date.toISOString().split('T')[0]}T${startTime}`);
    const endDate = new Date(`${apt.date.toISOString().split('T')[0]}T${endTime}`);
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.error(`Invalid date for appointment ${apt._id}:`, {
        date: apt.date,
        startTime,
        endTime
      });
      return null;
    }

    return {
      id: apt._id,
      title: `${serviceName} - ${customerAddress}`,
      start: startDate,
      end: endDate,
      color: apt.calendarColor || '#3174ad', // Default color if calendarColor is not set
      status: apt.status || 'Scheduled',
      customer: apt.customer || null,
      packageType: apt.packageType || 'Standard',
      recurring: apt.recurringType !== 'One-time'
    };
  }).filter(Boolean); // Remove any null entries from invalid dates

  res.status(200).json({
    success: true,
    count: calendarAppointments.length,
    data: calendarAppointments
  });
}); 

// @desc    Update crew assignment for appointment
// @route   PUT /api/v1/appointments/:id/crew
// @access  Private/TenantAdmin
exports.updateCrewAssignment = asyncHandler(async (req, res, next) => {
  const { leadProfessional, assignedTo } = req.body;

  const appointment = await Appointment.findById(req.params.id);

  if (!appointment) {
    return next(
      new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
    );
  }

  // Check authorization
  if (req.user.role !== 'tenantAdmin') {
    return next(
      new ErrorResponse('Not authorized to assign crew', 403)
    );
  }

  // Validate staff members exist
  if (leadProfessional) {
    const leadUser = await User.findById(leadProfessional);
    if (!leadUser || !['staff', 'tenantAdmin'].includes(leadUser.role)) {
      return next(
        new ErrorResponse('Invalid lead professional', 400)
      );
    }
  }

  if (assignedTo && assignedTo.length > 0) {
    const staffMembers = await User.find({
      _id: { $in: assignedTo },
      role: { $in: ['staff', 'tenantAdmin'] }
    });
    
    if (staffMembers.length !== assignedTo.length) {
      return next(
        new ErrorResponse('One or more assigned staff members are invalid', 400)
      );
    }
  }

  // Check for scheduling conflicts for the given time window
  const dateOnly = new Date(appointment.date.toISOString().split('T')[0]);
  const { startTime, endTime } = appointment.timeSlot || {};
  if (!startTime || !endTime) {
    return next(new ErrorResponse('Appointment timeSlot is missing', 400));
  }

  // Helper to check availability for a professional (as lead or team member)
  const hasConflict = async (professionalId) => {
    // Conflicts where this professional is lead
    const leadConflicts = await Appointment.find({
      'crew.leadProfessional': professionalId,
      date: dateOnly,
      'timeSlot.startTime': { $lt: endTime },
      'timeSlot.endTime': { $gt: startTime },
      _id: { $ne: appointment._id }
    }).limit(1);

    if (leadConflicts.length > 0) return true;

    // Conflicts where this professional is in assignedTo
    const teamConflicts = await Appointment.find({
      'crew.assignedTo': professionalId,
      date: dateOnly,
      'timeSlot.startTime': { $lt: endTime },
      'timeSlot.endTime': { $gt: startTime },
      _id: { $ne: appointment._id }
    }).limit(1);

    return teamConflicts.length > 0;
  };

  // Check lead availability
  if (leadProfessional) {
    const leadBusy = await hasConflict(leadProfessional);
    if (leadBusy) {
      return next(new ErrorResponse('Lead professional is not available during this time slot', 400));
    }
  }

  // Check each assigned staff availability
  for (const memberId of assignedTo || []) {
    const busy = await hasConflict(memberId);
    if (busy) {
      return next(new ErrorResponse(`Staff member ${memberId} is not available during this time slot`, 400));
    }
  }

  // Update crew assignment
  appointment.crew = {
    leadProfessional: leadProfessional || null,
    assignedTo: assignedTo || []
  };

  await appointment.save();

  // Populate the crew data for response
  await appointment.populate([
    { path: 'crew.leadProfessional', select: 'name email role' },
    { path: 'crew.assignedTo', select: 'name email role' }
  ]);

  res.status(200).json({
    success: true,
    data: appointment
  });
});








// @desc    Approve appointment
// @route   PUT /api/v1/appointments/:id/approve
// @access  Private/Admin
exports.approveAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('customer')
    .populate('service');

  if (!appointment) {
    return next(
      new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
    );
  }

  if (appointment.status !== 'Pending') {
    return next(
      new ErrorResponse('Only pending appointments can be approved', 400)
    );
  }

  // Update status to confirmed
  appointment.status = 'Confirmed';
  await appointment.save();

  // Send confirmation email
  try {
    const customer = await Customer.findById(appointment.customer._id).populate('user');
    if (customer && customer.user.email) {
      await sendEmail({
        email: customer.user.email,
        subject: 'Appointment Confirmed',
        message: `Your appointment for ${appointment.service.name} on ${new Date(appointment.date).toLocaleDateString()} has been confirmed. We'll see you at ${appointment.timeSlot.startTime}.`
      });
    }
  } catch (err) {
    console.log('Email notification failed:', err);
  }

  res.status(200).json({
    success: true,
    data: appointment
  });
});

// @desc    Complete appointment and collect payment
// @route   PUT /api/v1/appointments/:id/complete
// @access  Private/Admin
exports.completeAppointment = asyncHandler(async (req, res, next) => {
  const appointment = await Appointment.findById(req.params.id)
    .populate('service');

  if (!appointment) {
    return next(
      new ErrorResponse(`Appointment not found with id of ${req.params.id}`, 404)
    );
  }

  if (appointment.status !== 'In Progress') {
    return next(
      new ErrorResponse('Only in-progress appointments can be completed', 400)
    );
  }

  // Update status and payment requirement
  appointment.status = 'Completed';
  appointment.payment.status = 'pending';
  // Calculate payment amount from service pricing
  let paymentAmount = 50; // Default fallback amount
  if (appointment.service?.basePrice) {
    paymentAmount = appointment.service.basePrice;
  }
  appointment.payment = {
    ...appointment.payment,
    status: 'Pending',
    amount: paymentAmount
  };
  appointment.completionDetails.completedAt = Date.now();

  await appointment.save();

  res.status(200).json({
    success: true,
    data: appointment
  });
});