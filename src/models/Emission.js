const mongoose = require('mongoose');

const emissionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  transportEmission: {
    type: Number,
    required: true
  },
  packagingEmission: {
    type: Number,
    required: true
  },
  foodEmission: {
    type: Number,
    required: true
  },
  totalEmission: {
    type: Number,
    required: true
  },
  factors: {
    transportMode: {
      type: String,
      enum: ['bike', 'car', 'walking'],
      default: 'bike'
    },
    distance: {
      type: Number,
      required: true
    },
    packagingType: {
      type: String,
      enum: ['plastic', 'paper', 'mixed'],
      default: 'plastic'
    },
    foodCategories: [{
      category: String,
      quantity: Number,
      emissionFactor: Number
    }]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create index for user and order to ensure uniqueness
emissionSchema.index({ user: 1, order: 1 }, { unique: true });

module.exports = mongoose.model('Emission', emissionSchema); 