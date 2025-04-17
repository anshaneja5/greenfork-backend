const Emission = require('../models/Emission');
const Order = require('../models/Order');

// Emission factors (in kg CO2e)
const EMISSION_FACTORS = {
  transport: {
    bike: 0.05, // kg CO2e per km
    car: 0.2,   // kg CO2e per km
    walking: 0   // kg CO2e per km
  },
  packaging: {
    plastic: 0.1,  // kg CO2e per order
    paper: 0.05,   // kg CO2e per order
    mixed: 0.08    // kg CO2e per order
  },
  food: {
    vegetarian: 0.5,    // kg CO2e per kg
    nonVegetarian: 2.5, // kg CO2e per kg
    seafood: 3.0,       // kg CO2e per kg
    dairy: 1.0,         // kg CO2e per kg
    beverages: 0.3      // kg CO2e per kg
  }
};

class EmissionService {
  static async calculateEmission(orderId, userId, factors) {
    try {
      const order = await Order.findOne({ _id: orderId, user: userId });
      if (!order) {
        throw new Error('Order not found');
      }

      // Calculate transport emission
      const transportEmission = this.calculateTransportEmission(
        factors.transportMode,
        factors.distance
      );

      // Calculate packaging emission
      const packagingEmission = this.calculatePackagingEmission(
        factors.packagingType
      );

      // Calculate food emission
      const foodEmission = this.calculateFoodEmission(
        factors.foodCategories
      );

      // Calculate total emission
      const totalEmission = transportEmission + packagingEmission + foodEmission;

      // Create or update emission record
      const emission = await Emission.findOneAndUpdate(
        { user: userId, order: orderId },
        {
          transportEmission,
          packagingEmission,
          foodEmission,
          totalEmission,
          factors
        },
        { upsert: true, new: true }
      );

      // Update order with emission data
      await Order.findByIdAndUpdate(orderId, {
        emissionData: {
          totalEmission,
          transportEmission,
          packagingEmission,
          foodEmission
        }
      });

      return emission;
    } catch (error) {
      console.error('Error calculating emission:', error);
      throw error;
    }
  }

  static calculateTransportEmission(mode, distance) {
    return EMISSION_FACTORS.transport[mode] * distance;
  }

  static calculatePackagingEmission(type) {
    return EMISSION_FACTORS.packaging[type];
  }

  static calculateFoodEmission(foodCategories) {
    return foodCategories.reduce((total, item) => {
      return total + (item.quantity * item.emissionFactor);
    }, 0);
  }

  static async getUserEmissionSummary(userId) {
    try {
      const emissions = await Emission.find({ user: userId });
      
      return {
        totalEmission: emissions.reduce((sum, e) => sum + e.totalEmission, 0),
        averageEmissionPerOrder: emissions.length > 0 
          ? emissions.reduce((sum, e) => sum + e.totalEmission, 0) / emissions.length 
          : 0,
        transportEmission: emissions.reduce((sum, e) => sum + e.transportEmission, 0),
        packagingEmission: emissions.reduce((sum, e) => sum + e.packagingEmission, 0),
        foodEmission: emissions.reduce((sum, e) => sum + e.foodEmission, 0),
        orderCount: emissions.length
      };
    } catch (error) {
      console.error('Error getting user emission summary:', error);
      throw error;
    }
  }

  static async getEmissionTrends(userId, period = 'month') {
    try {
      const startDate = new Date();
      if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      } else if (period === 'year') {
        startDate.setFullYear(startDate.getFullYear() - 1);
      }

      const emissions = await Emission.find({
        user: userId,
        createdAt: { $gte: startDate }
      }).sort({ createdAt: 1 });

      return emissions.map(e => ({
        date: e.createdAt,
        totalEmission: e.totalEmission,
        transportEmission: e.transportEmission,
        packagingEmission: e.packagingEmission,
        foodEmission: e.foodEmission
      }));
    } catch (error) {
      console.error('Error getting emission trends:', error);
      throw error;
    }
  }
}

module.exports = EmissionService; 