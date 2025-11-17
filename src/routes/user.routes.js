const express = require('express');
const {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getStaff
} = require('../controllers/user.controller');

const User = require('../models/user.model');

const router = express.Router();

const { protect, authorize } = require('../middlewares/auth');
const advancedResults = require('../middlewares/advancedResults');

// Staff route for tenantAdmin
router.get('/staff', protect, authorize('tenantAdmin'), getStaff);

router.use(protect);

// Allow both tenantAdmin and superAdmin to update a user record.
// Important: define this BEFORE applying superAdmin-only middleware
// so tenant admins can update staff within their tenant.
router.put('/:id', authorize('tenantAdmin', 'superAdmin'), updateUser);

// Allow both tenantAdmin and superAdmin to delete a user record.
// Place before superAdmin-only middleware; controller will enforce tenant scope.
router.delete('/:id', authorize('tenantAdmin', 'superAdmin'), deleteUser);

// All routes below this line are superAdmin-only
router.use(authorize('superAdmin'));

router.route('/')
  .get(advancedResults(User), getUsers)
  .post(createUser);

router.route('/:id')
  .get(getUser)
  .delete(deleteUser);

module.exports = router;