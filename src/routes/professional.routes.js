const express = require('express');
const {
  getProfessionals,
  getProfessional,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  getProfessionalWorkload,
  assignToAppointment,
  getAvailableProfessionals,
  updateAppointmentCrew
} = require('../controllers/professional.controller');
const { updateUser, deleteUser } = require('../controllers/user.controller');

const router = express.Router();

const { protect, authorize } = require('../middlewares/auth');

// Apply protection and authorization to all routes
router.use(protect);
router.use(authorize('tenantAdmin'));

// Available professionals route
router.get('/available', getAvailableProfessionals);

// Base professional routes
router.route('/')
  .get(authorize('tenantAdmin'), getProfessionals)
  .post(createProfessional);

// Individual professional routes
router.route('/:id')
  .get(getProfessional)
  .put(updateUser)
  .delete(deleteUser);

router
  .route('/:id/crew')
  .put(protect, authorize('tenantAdmin'), updateAppointmentCrew);

// Professional workload route
router.get('/:id/workload', getProfessionalWorkload);

// Assign professional to appointment
router.put('/:id/assign/:appointmentId', assignToAppointment);

module.exports = router;