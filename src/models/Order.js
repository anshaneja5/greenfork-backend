const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['Swiggy', 'Zomato']
  },
  orderId: {
    type: String,
    required: true
  },
  restaurantName: {
    type: String,
    required: true
  },
  orderDate: {
    type: Date,
    required: true
  },
  orderAmount: {
    type: Number,
    required: true
  },
  orderStatus: {
    type: String,
    required: true
  },
  items: [{
    name: String,
    quantity: Number,
    price: Number,
    category: {
      type: String,
      enum: ['veg', 'non-veg']
    }
  }],
  emissionData: {
    transportEmission: Number,
    packagingEmission: Number,
    foodEmission: Number,
    totalEmission: Number,
    factors: {
      transportMode: String,
      distance: Number,
      packagingType: String,
      foodCategories: [String]
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Additional fields for Zomato orders
  deliveryAddress: String,
  restaurantRating: {
    aggregateRating: String,
    ratingText: String,
    ratingColor: String,
    votes: String,
    subtext: String
  },
  restaurantImage: String,
  restaurantUrl: String,
  restaurantPhone: String,
  restaurantEstablishment: [String],
  locality: {
    cityId: Number,
    localityName: String,
    localityUrl: String,
    addressString: String,
    directionTitle: String,
    directionUrl: String
  },
  deliveryDetails: {
    deliveryStatus: Number,
    deliveryMessage: String,
    deliveryLabel: String
  },
  paymentStatus: Number,
  dishString: String,
  hashId: String,
  reOrderUrl: String
}, {
  timestamps: true
});

// Create a compound index to ensure uniqueness of user and orderId combination
orderSchema.index({ user: 1, orderId: 1 }, { unique: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order; 