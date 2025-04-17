const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema({
  // Can be a specific orderId or 'overall' + userId
  recommendationId: {
    type: String,
    required: true,
    unique: true
  },
  // Type of recommendation (order or overall)
  type: {
    type: String,
    enum: ['order', 'overall'],
    required: true
  },
  // The user this recommendation belongs to
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // For 'order' type, store the order ID
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  // For 'overall' type, store the order count at time of generation
  orderCount: {
    type: Number
  },
  // The actual recommendation data
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // When this recommendation was created
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // TTL index - expire documents after 1 hour
  }
});

// Create compound indexes for faster lookups
recommendationSchema.index({ user: 1, type: 1 });
recommendationSchema.index({ order: 1 }, { sparse: true });

const Recommendation = mongoose.model('Recommendation', recommendationSchema);

module.exports = Recommendation; 